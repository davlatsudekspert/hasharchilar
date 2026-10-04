// Admin panel API: /api/admin/* — statistika, foydalanuvchilar (bloklash, rol, o'chirish), hasharlar.
// Hammasi requireAdmin ortida: mehmon → 401, oddiy foydalanuvchi → 403.
import { Hono } from 'hono';
import { adminPhones, isAdmin, isEnvAdmin, requireAuth } from './auth.js';
import { HASHAR_SELECT, tashkentNow, toDto } from './hashars.js';
import { deletePhotos } from './media.js';
import { deleteComment } from './social.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  cleanLine,
  likePattern,
  parseId,
  readJson,
  toIso,
} from './validate.js';

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;
const RECENT = 5;
const USER_NOT_FOUND = 'Foydalanuvchi topilmadi';
const HASHAR_NOT_FOUND = 'Hashar topilmadi';
const COMMENT_NOT_FOUND = 'Izoh topilmadi';
const ENV_ADMIN_LOCKED = "Bu administrator ADMIN_PHONES sozlamasi orqali tayinlangan — uni paneldan o'zgartirib bo'lmaydi";

/** Faqat administratorlar (avval requireAuth: mehmon 401, bloklangan 403). */
export async function requireAdmin(c, next) {
  await requireAuth(c, async () => {
    if (!isAdmin(c.get('user'), c.env)) throw new ForbiddenError("Bu bo'lim faqat administratorlar uchun");
    await next();
  });
}

/** ?offset=&limit= → butun sonlar (noto'g'ri qiymat — standart, limit ≤ 100). */
function paging(c) {
  const int = (v, def) => {
    const n = Number(v);
    return v != null && v !== '' && Number.isSafeInteger(n) ? n : def;
  };
  return {
    offset: Math.max(0, int(c.req.query('offset'), 0)),
    limit: Math.min(PAGE_MAX, Math.max(1, int(c.req.query('limit'), PAGE_DEFAULT))),
  };
}

/** Qidiruv so'zi (≤ 100 belgi, bo'sh bo'lsa ''). */
const searchQuery = (c) => cleanLine(c.req.query('q')).slice(0, 100);

// ---------- Foydalanuvchilar ----------

const USER_SELECT = `
  SELECT u.id, u.name, u.phone, u.email, u.email_verified_at, u.role, u.blocked_at, u.created_at,
         (SELECT COUNT(*) FROM hashars h WHERE h.creator_id = u.id) AS created_count,
         (SELECT COUNT(*) FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
            WHERE v.user_id = u.id AND h.creator_id <> u.id) AS joined_count
  FROM users u`;

/** Admin ro'yxati uchun foydalanuvchi obyekti. env_admin — ADMIN_PHONES orqali (himoyalangan). */
const adminUserDto = (u, env) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email ?? null,
  email_verified: Boolean(u.email_verified_at),
  role: u.role,
  is_admin: isAdmin(u, env),
  env_admin: isEnvAdmin(u.phone, env),
  blocked_at: toIso(u.blocked_at),
  created_at: toIso(u.created_at),
  created_count: u.created_count ?? 0,
  joined_count: u.joined_count ?? 0,
});

async function loadUser(db, id) {
  const u = await db.prepare(`${USER_SELECT} WHERE u.id = ?1`).bind(id).first();
  if (!u) throw new NotFoundError(USER_NOT_FOUND);
  return u;
}

/**
 * O'ziga yoki ADMIN_PHONES admin'iga xavfli amal qilinmasin (409).
 * `selfMessage` — o'zi bo'lsa ko'rsatiladigan matn.
 */
function guardTarget(c, target, selfMessage) {
  if (target.id === c.get('user').id) throw new ConflictError(selfMessage);
  if (isEnvAdmin(target.phone, c.env)) throw new ConflictError(ENV_ADMIN_LOCKED);
}

// ---------- Hasharlar ----------

/** HasharDTO + creator.phone (admin hamma telefonni ko'radi). */
function adminHasharDto(r, uid) {
  const dto = toDto(r, uid);
  dto.creator = { ...dto.creator, phone: r.creator_phone };
  return dto;
}

// ---------- Marshrutlar ----------

export const adminRoutes = new Hono();

adminRoutes.use('*', requireAdmin);

// GET /api/admin/overview — umumiy raqamlar + oxirgi hasharlar / foydalanuvchilar
adminRoutes.get('/overview', async (c) => {
  const db = c.env.DB;
  const uid = c.get('user').id;
  const phones = JSON.stringify([...adminPhones(c.env)]);
  const [counts, hashars, users] = await db.batch([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE role = 'admin' OR phone IN (SELECT value FROM json_each(?1))) AS admins,
           (SELECT COUNT(*) FROM users WHERE blocked_at IS NOT NULL) AS blocked,
           (SELECT COUNT(*) FROM hashars) AS hashars,
           (SELECT COUNT(*) FROM hashars WHERE status = 'PENDING') AS pending,
           (SELECT COUNT(*) FROM hashars WHERE status = 'COMPLETED') AS completed,
           (SELECT COUNT(DISTINCT user_id) FROM volunteers) AS volunteers,
           (SELECT COUNT(*) FROM hashar_media) AS media,
           (SELECT COUNT(*) FROM comments) AS comments,
           (SELECT COUNT(*) FROM users WHERE created_at >= datetime('now', '-7 days')) AS signups_7d,
           (SELECT COUNT(*) FROM hashars WHERE created_at >= datetime('now', '-7 days')) AS hashars_7d`,
      )
      .bind(phones),
    db.prepare(`${HASHAR_SELECT} ORDER BY h.id DESC LIMIT ${RECENT}`).bind(uid),
    db.prepare(`${USER_SELECT} ORDER BY u.id DESC LIMIT ${RECENT}`),
  ]);
  return c.json({
    ...counts.results[0],
    recent_hashars: hashars.results.map((r) => adminHasharDto(r, uid)),
    recent_users: users.results.map((u) => adminUserDto(u, c.env)),
  });
});

// GET /api/admin/users?q=&offset=&limit= — ism, telefon yoki email bo'yicha qidiruv, yangilari birinchi
adminRoutes.get('/users', async (c) => {
  const db = c.env.DB;
  const { offset, limit } = paging(c);
  const where = [];
  const params = [];
  const q = searchQuery(c);
  if (q) {
    const conds = ["u.name LIKE ? ESCAPE '\\'", "u.phone LIKE ? ESCAPE '\\'", "u.email LIKE ? ESCAPE '\\'"];
    const like = likePattern(q);
    params.push(like, like, like);
    // "90 123 45 67" kabi bo'shliqli / qavsli raqam ham topilsin (faqat raqamga o'xshash so'zda)
    const digits = q.replace(/\D/g, '');
    if (digits && digits !== q && /^[\d\s()+-]+$/.test(q)) {
      conds.push("u.phone LIKE ? ESCAPE '\\'");
      params.push(likePattern(digits));
    }
    where.push(`(${conds.join(' OR ')})`);
  }
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, total] = await db.batch([
    db.prepare(`${USER_SELECT} ${cond} ORDER BY u.id DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM users u ${cond}`).bind(...params),
  ]);
  return c.json({ items: list.results.map((u) => adminUserDto(u, c.env)), total: total.results[0].n });
});

// POST /api/admin/users/:id/block — bloklash; barcha sessiyalari o'chiriladi va boshqalarning
// hali bo'lmagan PENDING hasharlaridagi joylari bo'shatiladi (max_volunteers ni to'ldirib qo'ymasin).
// COMPLETED tarixi va o'tib ketgan (sanasidan 3 soatdan ko'p o'tgan, hali yakunlanmagan) hasharlardagi
// qatnashuv qoladi — u haqiqatda bo'lib o'tgan. Blokdan chiqarilganda qatnashuvlar tiklanmaydi.
const BLOCK_KEEP_AFTER_MS = 3 * 3600e3; // src/lib/utils.js ONGOING_MIN bilan bir xil
adminRoutes.post('/users/:id/block', async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  guardTarget(c, await loadUser(db, id), "O'zingizni bloklay olmaysiz");
  await db.batch([
    db.prepare("UPDATE users SET blocked_at = COALESCE(blocked_at, datetime('now')) WHERE id = ?1").bind(id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id),
    db
      .prepare(
        `DELETE FROM volunteers WHERE user_id = ?1
           AND hashar_id IN (SELECT id FROM hashars WHERE status = 'PENDING' AND creator_id <> ?1 AND date_time >= ?2)`,
      )
      .bind(id, tashkentNow(-BLOCK_KEEP_AFTER_MS)),
  ]);
  return c.json({ user: adminUserDto(await loadUser(db, id), c.env) });
});

// POST /api/admin/users/:id/unblock
adminRoutes.post('/users/:id/unblock', async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  await loadUser(db, id);
  await db.prepare('UPDATE users SET blocked_at = NULL WHERE id = ?1').bind(id).run();
  return c.json({ user: adminUserDto(await loadUser(db, id), c.env) });
});

// POST /api/admin/users/:id/role — {role: 'user' | 'admin'}
adminRoutes.post('/users/:id/role', async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  const body = await readJson(c);
  const role = body.role;
  if (role !== 'user' && role !== 'admin') throw new ValidationError("Rol qiymati noto'g'ri (user yoki admin)");
  const target = await loadUser(db, id);
  if (target.id === c.get('user').id) throw new ConflictError("O'z rolingizni o'zgartira olmaysiz");
  if (role === 'user' && isEnvAdmin(target.phone, c.env)) throw new ConflictError(ENV_ADMIN_LOCKED);
  await db.prepare('UPDATE users SET role = ?2 WHERE id = ?1').bind(id, role).run();
  return c.json({ user: adminUserDto(await loadUser(db, id), c.env) });
});

// DELETE /api/admin/users/:id — foydalanuvchi, sessiyalari, email kodlari, qatnashuvlari, hasharlari, izohlari
// (+ hashar rasmlari va avatar R2 dan)
adminRoutes.delete('/users/:id', async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  guardTarget(c, await loadUser(db, id), "O'zingizni o'chira olmaysiz");
  const own = 'SELECT id FROM hashars WHERE creator_id = ?1';
  // Bitta tranzaksiya; rasm kalitlari ham shu tranzaksiya ichida olinadi (orada qo'shilgani qolib ketmasin)
  // Bog'liq qatorlar (izohlar ham) oldindan o'chiriladi: meta.changes FK kaskadi bilan ortib ketmasin
  const [media, , , , , , , delUser] = await db.batch([
    db
      .prepare(
        `SELECT r2_key FROM hashar_media WHERE hashar_id IN (${own})
         UNION ALL SELECT avatar_key FROM users WHERE id = ?1 AND avatar_key IS NOT NULL`,
      )
      .bind(id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id),
    db.prepare('DELETE FROM email_otps WHERE user_id = ?1 OR email = (SELECT email FROM users WHERE id = ?1)').bind(id),
    db.prepare(`DELETE FROM comments WHERE hashar_id IN (${own}) OR user_id = ?1`).bind(id),
    db.prepare(`DELETE FROM hashar_media WHERE hashar_id IN (${own})`).bind(id),
    db.prepare(`DELETE FROM volunteers WHERE hashar_id IN (${own}) OR user_id = ?1`).bind(id),
    db.prepare('DELETE FROM hashars WHERE creator_id = ?1').bind(id),
    db.prepare('DELETE FROM users WHERE id = ?1').bind(id),
  ]);
  if (delUser.meta.changes !== 1) throw new NotFoundError(USER_NOT_FOUND);
  await deletePhotos(c.env.PHOTOS, media.results.map((m) => m.r2_key));
  return c.json({ ok: true });
});

// GET /api/admin/hashars?status=&q=&offset=&limit= — barcha hasharlar, yangilari birinchi
adminRoutes.get('/hashars', async (c) => {
  const db = c.env.DB;
  const uid = c.get('user').id;
  const { offset, limit } = paging(c);
  const where = [];
  const params = [];
  const status = c.req.query('status') || null;
  if (status) {
    if (status !== 'PENDING' && status !== 'COMPLETED') throw new ValidationError("Holat qiymati noto'g'ri");
    where.push('h.status = ?');
    params.push(status);
  }
  const q = searchQuery(c);
  if (q) {
    const like = likePattern(q);
    where.push(
      "(h.title LIKE ? ESCAPE '\\' OR h.address LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')",
    );
    params.push(like, like, like, like);
  }
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, total] = await db.batch([
    db.prepare(`${HASHAR_SELECT} ${cond} ORDER BY h.id DESC LIMIT ? OFFSET ?`).bind(uid, ...params, limit, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM hashars h JOIN users u ON u.id = h.creator_id ${cond}`).bind(...params),
  ]);
  return c.json({ items: list.results.map((r) => adminHasharDto(r, uid)), total: total.results[0].n });
});

// DELETE /api/admin/hashars/:id — istalgan holatdagi hashar; R2 rasmlari ham o'chiriladi
adminRoutes.delete('/hashars/:id', async (c) => {
  const db = c.env.DB;
  const id = parseId(c.req.param('id'), HASHAR_NOT_FOUND);
  const [media, , , , delHashar] = await db.batch([
    db.prepare('SELECT r2_key FROM hashar_media WHERE hashar_id = ?1').bind(id),
    db.prepare('DELETE FROM comments WHERE hashar_id = ?1').bind(id),
    db.prepare('DELETE FROM hashar_media WHERE hashar_id = ?1').bind(id),
    db.prepare('DELETE FROM volunteers WHERE hashar_id = ?1').bind(id),
    db.prepare('DELETE FROM hashars WHERE id = ?1').bind(id),
  ]);
  if (delHashar.meta.changes !== 1) throw new NotFoundError(HASHAR_NOT_FOUND);
  await deletePhotos(c.env.PHOTOS, media.results.map((m) => m.r2_key));
  return c.json({ ok: true });
});

// DELETE /api/admin/comments/:id — istalgan izohni o'chirish
adminRoutes.delete('/comments/:id', async (c) => {
  const id = parseId(c.req.param('id'), COMMENT_NOT_FOUND);
  if (!(await deleteComment(c.env.DB, id))) throw new NotFoundError(COMMENT_NOT_FOUND);
  return c.json({ ok: true });
});
