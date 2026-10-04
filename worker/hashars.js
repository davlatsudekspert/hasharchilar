// Hashar marshrutlari: ro'yxat, tafsilot, yaratish, qatnashish, yakunlash, o'chirish.
import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { limitCreate, limitJoin } from './ratelimit.js';
import { deletePhotos, mediaUrl, readPhoto, storePhoto } from './media.js';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  cleanLine,
  likePattern,
  parseHasharFields,
  parseId,
  readForm,
  toIso,
} from './validate.js';

const LIST_LIMIT = 300;
const COMPLETED_MIN = 60; // umumiy ro'yxatda bajarilganlar uchun kafolatlangan joy
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // sanasidan 1 kun o'tgan PENDING — eskirgan
const NOT_FOUND = 'Hashar topilmadi';

/** Toshkent vaqti (UTC+5) 'YYYY-MM-DDTHH:MM', `offsetMs` siljish bilan. */
const tashkentNow = (offsetMs = 0) => new Date(Date.now() + 5 * 3600e3 + offsetMs).toISOString().slice(0, 16);

/**
 * HasharDTO uchun umumiy SELECT. Birinchi parametr (?) — joriy foydalanuvchi ID si
 * (mehmon uchun NULL → joined doim 0). creator_phone DTO ga faqat ruxsat bo'lsa qo'shiladi.
 */
export const HASHAR_SELECT = `
  SELECT h.id, h.title, h.description, h.address, h.lat, h.lng, h.date_time, h.items, h.status,
         h.creator_id, u.name AS creator_name, u.phone AS creator_phone, h.created_at, h.completed_at,
         (SELECT COUNT(*) FROM volunteers v WHERE v.hashar_id = h.id) AS volunteer_count,
         (SELECT m.r2_url FROM hashar_media m WHERE m.hashar_id = h.id AND m.photo_type = 'BEFORE'
            ORDER BY m.id DESC LIMIT 1) AS before_url,
         (SELECT m.r2_url FROM hashar_media m WHERE m.hashar_id = h.id AND m.photo_type = 'AFTER'
            ORDER BY m.id DESC LIMIT 1) AS after_url,
         EXISTS (SELECT 1 FROM volunteers v WHERE v.hashar_id = h.id AND v.user_id = ?) AS joined
  FROM hashars h JOIN users u ON u.id = h.creator_id`;

function parseJsonArray(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** DB qatori → HasharDTO (SPEC 5-bo'lim). */
export function toDto(r, userId) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    date_time: r.date_time,
    items: parseJsonArray(r.items),
    status: r.status,
    creator: { id: r.creator_id, name: r.creator_name },
    volunteer_count: r.volunteer_count,
    before_url: r.before_url || null,
    after_url: r.after_url || null,
    joined: Boolean(r.joined),
    is_owner: userId != null && r.creator_id === userId,
    created_at: toIso(r.created_at),
    completed_at: toIso(r.completed_at),
  };
}

const selectOne = (db, id, userId) => db.prepare(`${HASHAR_SELECT} WHERE h.id = ?`).bind(userId ?? null, id);

async function loadDto(db, id, userId) {
  const row = await selectOne(db, id, userId).first();
  if (!row) throw new NotFoundError(NOT_FOUND);
  return toDto(row, userId);
}

/** Holat/egalik tekshiruvlari uchun yengil so'rov. */
async function getMeta(db, id) {
  const h = await db.prepare('SELECT id, status, creator_id FROM hashars WHERE id = ?1').bind(id).first();
  if (!h) throw new NotFoundError(NOT_FOUND);
  return h;
}

const countVolunteers = (db, id) => db.prepare('SELECT COUNT(*) AS n FROM volunteers WHERE hashar_id = ?1').bind(id);

export const hasharRoutes = new Hono();

// GET /api/hashars?status=&mine=&q=
hasharRoutes.get('/', async (c) => {
  const user = c.get('user');
  const uid = user?.id ?? null;
  const where = [];
  const params = [uid];

  const status = c.req.query('status') || null; // holat filtri pastda (har holat alohida so'rov)
  if (status && status !== 'PENDING' && status !== 'COMPLETED') throw new ValidationError("Holat qiymati noto'g'ri");

  const mine = c.req.query('mine');
  if (mine) {
    if (!user) throw new AuthError();
    if (mine === 'created') {
      where.push('h.creator_id = ?');
      params.push(uid);
    } else if (mine === 'joined') {
      // Qo'shilganlarim — o'zim yaratganlardan tashqari
      where.push('h.creator_id <> ? AND EXISTS (SELECT 1 FROM volunteers mv WHERE mv.hashar_id = h.id AND mv.user_id = ?)');
      params.push(uid, uid);
    } else {
      throw new ValidationError("mine qiymati noto'g'ri");
    }
  }

  const q = cleanLine(c.req.query('q')).slice(0, 100);
  if (q) {
    const like = likePattern(q);
    where.push("(h.title LIKE ? ESCAPE '\\' OR h.address LIKE ? ESCAPE '\\' OR h.description LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }

  // Har bir holat alohida tanlanadi: aks holda yakunlanmay qolgan eski PENDING'lar 300 lik
  // limitni to'ldirib, kelgusi va bajarilgan hasharlarni ro'yxatdan siqib chiqaradi.
  const db = c.env.DB;
  const cond = (s) => `WHERE ${[`h.status = '${s}'`, ...where].join(' AND ')}`;
  const cutoff = tashkentNow(-STALE_AFTER_MS); // shundan oldingi PENDING — "eskirgan"
  const stmts = [];
  if (status !== 'COMPLETED') {
    // Tanlov: avval kelgusilar (yaqini birinchi), keyin eskirganlar (eng yangisi birinchi)
    stmts.push(
      db
        .prepare(
          `${HASHAR_SELECT} ${cond('PENDING')}
           ORDER BY (h.date_time < ?) ASC,
                    CASE WHEN h.date_time >= ? THEN h.date_time END ASC,
                    h.date_time DESC, h.id DESC
           LIMIT ${LIST_LIMIT}`,
        )
        .bind(...params, cutoff, cutoff),
    );
  }
  if (status !== 'PENDING') {
    stmts.push(
      db
        .prepare(
          `${HASHAR_SELECT} ${cond('COMPLETED')}
           ORDER BY COALESCE(h.completed_at, h.created_at) DESC, h.id DESC
           LIMIT ${LIST_LIMIT}`,
        )
        .bind(...params),
    );
  }
  const res = await db.batch(stmts);
  let pending = status === 'COMPLETED' ? [] : res[0].results;
  let completed = status === 'PENDING' ? [] : res[res.length - 1].results;

  // Ikkalasi ham kerak bo'lsa: bajarilganlarga kamida COMPLETED_MIN joy (galereya bo'sh qolmasin)
  if (!status) {
    const cTake = Math.min(completed.length, Math.max(COMPLETED_MIN, LIST_LIMIT - pending.length));
    completed = completed.slice(0, cTake);
    pending = pending.slice(0, LIST_LIMIT - cTake);
  }

  // Chiqish tartibi (SPEC): PENDING sana bo'yicha o'sish, keyin COMPLETED eng yangisi
  pending.sort((a, b) => (a.date_time < b.date_time ? -1 : a.date_time > b.date_time ? 1 : b.id - a.id));
  return c.json([...pending, ...completed].map((r) => toDto(r, uid)));
});

// GET /api/hashars/:id — DTO + volunteers + (ruxsat bo'lsa) creator.phone
hasharRoutes.get('/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user')?.id ?? null;
  const db = c.env.DB;
  const [one, vols] = await db.batch([
    selectOne(db, id, uid),
    db
      .prepare(
        `SELECT u.id, u.name FROM volunteers v JOIN users u ON u.id = v.user_id
         WHERE v.hashar_id = ?1 ORDER BY v.joined_at, v.id LIMIT 1000`,
      )
      .bind(id),
  ]);
  const row = one.results[0];
  if (!row) throw new NotFoundError(NOT_FOUND);
  const dto = toDto(row, uid);
  // Tashkilotchi telefoni faqat qatnashuvchi yoki egasiga ko'rinadi
  if (dto.is_owner || dto.joined) dto.creator.phone = row.creator_phone;
  dto.volunteers = vols.results.map((v) => ({ id: v.id, name: v.name }));
  return c.json(dto);
});

// POST /api/hashars — multipart: title, description, address, lat, lng, date_time, items, photo?
hasharRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const form = await readForm(c);
  const f = parseHasharFields(form);
  const photo = await readPhoto(form.get('photo'));
  // Limit faqat to'g'ri so'rovlarga qo'llanadi (xato to'ldirilgan forma kvotani yemaydi)
  await limitCreate(c, user.id);

  const key = photo ? await storePhoto(c.env.PHOTOS, photo, 'before') : null;
  // Batch — bitta tranzaksiya, D1 yozuvlarni ketma-ket bajaradi: "eng oxirgi hashar" = hozir qo'shilgani
  const lastId = '(SELECT MAX(id) FROM hashars WHERE creator_id = ?1)';
  const stmts = [
    db
      .prepare(
        `INSERT INTO hashars (creator_id, title, description, address, lat, lng, date_time, items)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`,
      )
      .bind(user.id, f.title, f.description, f.address, f.lat, f.lng, f.date_time, JSON.stringify(f.items)),
    // Tashkilotchi avtomatik qatnashuvchi
    db.prepare(`INSERT INTO volunteers (hashar_id, user_id) VALUES (${lastId}, ?1)`).bind(user.id),
  ];
  if (key) {
    stmts.push(
      db
        .prepare(`INSERT INTO hashar_media (hashar_id, photo_type, r2_key, r2_url) VALUES (${lastId}, 'BEFORE', ?2, ?3)`)
        .bind(user.id, key, mediaUrl(key)),
    );
  }

  let id;
  try {
    const [ins] = await db.batch(stmts);
    id = ins.results[0].id;
  } catch (err) {
    if (key) await deletePhotos(c.env.PHOTOS, [key]);
    // Sxema CHECK'i (validatsiyadan o'tib ketgan chekka holat) — 500 emas, 400
    if (/CHECK constraint failed/i.test(String(err?.message))) throw new ValidationError("Ma'lumotlar noto'g'ri. Tekshirib, qayta urinib ko'ring");
    throw err;
  }
  return c.json(await loadDto(db, id, user.id), 201);
});

// POST /api/hashars/:id/join — idempotent
hasharRoutes.post('/:id/join', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  await limitJoin(c, uid);
  const h = await getMeta(db, id);
  if (h.status === 'COMPLETED') throw new ConflictError('Bu hashar allaqachon yakunlangan');

  const [, cnt] = await db.batch([
    // Shart qayta tekshiriladi: parallel yakunlash/o'chirishdan himoya
    db
      .prepare(
        `INSERT OR IGNORE INTO volunteers (hashar_id, user_id)
         SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND status = 'PENDING')`,
      )
      .bind(id, uid),
    countVolunteers(db, id),
  ]);
  return c.json({ joined: true, volunteer_count: cnt.results[0].n });
});

// DELETE /api/hashars/:id/join — chiqish (egasi chiqa olmaydi)
hasharRoutes.delete('/:id/join', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  await limitJoin(c, uid);
  const h = await getMeta(db, id);
  if (h.creator_id === uid) throw new ConflictError("Tashkilotchi o'z hasharidan chiqa olmaydi");
  if (h.status === 'COMPLETED') throw new ConflictError("Yakunlangan hashardan chiqib bo'lmaydi");

  const [, cnt] = await db.batch([
    db.prepare('DELETE FROM volunteers WHERE hashar_id = ?1 AND user_id = ?2').bind(id, uid),
    countVolunteers(db, id),
  ]);
  return c.json({ joined: false, volunteer_count: cnt.results[0].n });
});

// POST /api/hashars/:id/complete — multipart photo (AFTER, majburiy); faqat egasi
hasharRoutes.post('/:id/complete', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  const h = await getMeta(db, id);
  if (h.creator_id !== uid) throw new ForbiddenError('Faqat tashkilotchi yakunlay oladi');
  if (h.status === 'COMPLETED') throw new ConflictError('Bu hashar allaqachon yakunlangan');

  const form = await readForm(c);
  const photo = await readPhoto(form.get('photo'));
  if (!photo) throw new ValidationError('"Keyin" rasmini yuklang');
  const key = await storePhoto(c.env.PHOTOS, photo, 'after');

  let upd;
  try {
    [upd] = await db.batch([
      db
        .prepare("UPDATE hashars SET status = 'COMPLETED', completed_at = datetime('now') WHERE id = ?1 AND status = 'PENDING'")
        .bind(id),
      // Faqat shu so'rov yakunlagan bo'lsa (AFTER rasm hali yo'q bo'lsa) qo'shiladi
      db
        .prepare(
          `INSERT INTO hashar_media (hashar_id, photo_type, r2_key, r2_url)
           SELECT ?1, 'AFTER', ?2, ?3
           WHERE EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND status = 'COMPLETED')
             AND NOT EXISTS (SELECT 1 FROM hashar_media WHERE hashar_id = ?1 AND photo_type = 'AFTER')`,
        )
        .bind(id, key, mediaUrl(key)),
    ]);
  } catch (err) {
    await deletePhotos(c.env.PHOTOS, [key]);
    throw err;
  }
  if (upd.meta.changes !== 1) {
    // Parallel so'rov allaqachon yakunlagan
    await deletePhotos(c.env.PHOTOS, [key]);
    throw new ConflictError('Bu hashar allaqachon yakunlangan');
  }
  return c.json(await loadDto(db, id, uid));
});

// DELETE /api/hashars/:id — faqat egasi va faqat PENDING; R2 rasmlari ham o'chiriladi
hasharRoutes.delete('/:id', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  const h = await getMeta(db, id);
  if (h.creator_id !== uid) throw new ForbiddenError("Faqat tashkilotchi o'chira oladi");
  if (h.status === 'COMPLETED') throw new ConflictError("Yakunlangan hasharni o'chirib bo'lmaydi");

  const { results: media } = await db.prepare('SELECT r2_key FROM hashar_media WHERE hashar_id = ?1').bind(id).all();
  const [, , delHashar] = await db.batch([
    // Tranzaksiya: hashar PENDING bo'lsagina hammasi o'chadi
    db
      .prepare("DELETE FROM hashar_media WHERE hashar_id = ?1 AND EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND status = 'PENDING')")
      .bind(id),
    db
      .prepare("DELETE FROM volunteers WHERE hashar_id = ?1 AND EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND status = 'PENDING')")
      .bind(id),
    db.prepare("DELETE FROM hashars WHERE id = ?1 AND status = 'PENDING'").bind(id),
  ]);
  if (delHashar.meta.changes !== 1) throw new ConflictError("Yakunlangan hasharni o'chirib bo'lmaydi");

  await deletePhotos(c.env.PHOTOS, media.map((m) => m.r2_key));
  return c.json({ ok: true });
});

// GET /api/stats — bosh sahifa uchun umumiy raqamlar
export async function getStats(c) {
  const row = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM hashars) AS hashars,
            (SELECT COUNT(*) FROM hashars WHERE status = 'COMPLETED') AS completed,
            (SELECT COUNT(DISTINCT user_id) FROM volunteers) AS volunteers`,
  ).first();
  return c.json({ hashars: row.hashars, completed: row.completed, volunteers: row.volunteers });
}
