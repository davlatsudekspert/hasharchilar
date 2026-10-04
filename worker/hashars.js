// Hashar marshrutlari: ro'yxat, tafsilot, yaratish, qatnashish, yakunlash, o'chirish.
import { Hono } from 'hono';
import { requireVerifiedEmail } from './auth.js';
import { limitCreate, limitJoin } from './ratelimit.js';
import { avatarUrl, deletePhotos, mediaUrl, readPhoto, storePhoto } from './media.js';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  cleanLine,
  CATEGORIES,
  likePattern,
  parseDate,
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
         h.creator_id, u.name AS creator_name, u.phone AS creator_phone, u.avatar_key AS creator_avatar_key,
         h.created_at, h.completed_at, h.category, h.max_volunteers,
         (SELECT COUNT(*) FROM volunteers v WHERE v.hashar_id = h.id) AS volunteer_count,
         (SELECT COUNT(*) FROM comments cm WHERE cm.hashar_id = h.id) AS comment_count,
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
    category: r.category,
    max_volunteers: r.max_volunteers ?? null,
    creator: { id: r.creator_id, name: r.creator_name, avatar_url: avatarUrl(r.creator_avatar_key) },
    volunteer_count: r.volunteer_count,
    comment_count: r.comment_count ?? 0,
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

const RADIUS_DEFAULT_KM = 50;
const RADIUS_MAX_KM = 1000;

/** ?category=greening yoki greening,repair → tekshirilgan ro'yxat (bo'sh — filtr yo'q). */
function parseCategoryList(raw) {
  if (!raw) return [];
  const list = [...new Set(String(raw).split(',').map((x) => x.trim()).filter(Boolean))];
  for (const x of list) if (!CATEGORIES.includes(x)) throw new ValidationError("Hashar turi noto'g'ri");
  return list;
}

/** ?near=lat,lng&radius_km= → { lat, lng, radius } yoki null. radius_km standart 50, 0.1..1000. */
function parseNear(rawNear, rawRadius) {
  if (!rawNear) return null;
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(rawNear));
  const lat = m ? Number(m[1]) : NaN;
  const lng = m ? Number(m[2]) : NaN;
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw new ValidationError("near qiymati noto'g'ri (lat,lng)");
  let radius = RADIUS_DEFAULT_KM;
  if (rawRadius != null && rawRadius !== '') {
    radius = /^\d{1,4}(?:\.\d+)?$/.test(String(rawRadius).trim()) ? Number(rawRadius) : NaN;
    if (!(radius >= 0.1 && radius <= RADIUS_MAX_KM)) {
      throw new ValidationError(`radius_km 0.1–${RADIUS_MAX_KM} oralig'ida bo'lsin`);
    }
  }
  return { lat, lng, radius };
}

/** Ikki nuqta orasidagi masofa (km), haversine formulasi. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

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

  // v3 filtrlari: category (bir yoki vergul bilan bir nechta), from/to (YYYY-MM-DD), near + radius_km
  const categories = parseCategoryList(c.req.query('category'));
  if (categories.length) {
    where.push(`h.category IN (${categories.map(() => '?').join(', ')})`);
    params.push(...categories);
  }
  const from = c.req.query('from') ? parseDate(c.req.query('from'), '"from" sanasi') : null;
  const to = c.req.query('to') ? parseDate(c.req.query('to'), '"to" sanasi') : null;
  if (from && to && from > to) throw new ValidationError('"from" sanasi "to" dan keyin bo\'lmasin');
  if (from) {
    where.push('h.date_time >= ?');
    params.push(`${from}T00:00`);
  }
  if (to) {
    where.push('h.date_time <= ?');
    params.push(`${to}T23:59`);
  }
  const near = parseNear(c.req.query('near'), c.req.query('radius_km'));
  if (near) {
    // Avval SQL da to'rtburchak (indekssiz, lekin arzon), keyin JS da aniq haversine masofa
    const dLat = near.radius / 111.32;
    const dLng = near.radius / (111.32 * Math.max(0.01, Math.cos((near.lat * Math.PI) / 180)));
    where.push('h.lat BETWEEN ? AND ? AND h.lng BETWEEN ? AND ?');
    params.push(near.lat - dLat, near.lat + dLat, near.lng - dLng, near.lng + dLng);
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
  const rows = [...pending, ...completed];
  if (!near) return c.json(rows.map((r) => toDto(r, uid)));

  // near: radius ichidagilar, eng yaqini birinchi (teng masofada — oldingi tartib saqlanadi)
  const out = [];
  for (const [i, r] of rows.entries()) {
    const d = haversineKm(near.lat, near.lng, r.lat, r.lng);
    if (d <= near.radius) out.push({ i, d, dto: { ...toDto(r, uid), distance_km: Math.round(d * 100) / 100 } });
  }
  out.sort((a, b) => a.d - b.d || a.i - b.i);
  return c.json(out.map((x) => x.dto));
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
        `SELECT u.id, u.name, u.avatar_key FROM volunteers v JOIN users u ON u.id = v.user_id
         WHERE v.hashar_id = ?1 ORDER BY v.joined_at, v.id LIMIT 1000`,
      )
      .bind(id),
  ]);
  const row = one.results[0];
  if (!row) throw new NotFoundError(NOT_FOUND);
  const dto = toDto(row, uid);
  // Tashkilotchi telefoni faqat qatnashuvchi yoki egasiga ko'rinadi
  if (dto.is_owner || dto.joined) dto.creator.phone = row.creator_phone;
  dto.volunteers = vols.results.map((v) => ({ id: v.id, name: v.name, avatar_url: avatarUrl(v.avatar_key) }));
  return c.json(dto);
});

// POST /api/hashars — multipart: title, description, address, lat, lng, date_time, items, photo?
hasharRoutes.post('/', requireVerifiedEmail, async (c) => {
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
        `INSERT INTO hashars (creator_id, title, description, address, lat, lng, date_time, items, category, max_volunteers)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) RETURNING id`,
      )
      .bind(user.id, f.title, f.description, f.address, f.lat, f.lng, f.date_time, JSON.stringify(f.items), f.category, f.max_volunteers),
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
hasharRoutes.post('/:id/join', requireVerifiedEmail, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  await limitJoin(c, uid);
  const h = await getMeta(db, id);
  if (h.status === 'COMPLETED') throw new ConflictError('Bu hashar allaqachon yakunlangan');

  const [, cnt, mem] = await db.batch([
    // Shartlar qayta tekshiriladi (bitta tranzaksiya): parallel yakunlash/o'chirish va joy chegarasi
    db
      .prepare(
        `INSERT OR IGNORE INTO volunteers (hashar_id, user_id)
         SELECT ?1, ?2 FROM hashars h
         WHERE h.id = ?1 AND h.status = 'PENDING'
           AND (h.max_volunteers IS NULL
                OR (SELECT COUNT(*) FROM volunteers v WHERE v.hashar_id = ?1) < h.max_volunteers)`,
      )
      .bind(id, uid),
    countVolunteers(db, id),
    db.prepare('SELECT 1 AS ok FROM volunteers WHERE hashar_id = ?1 AND user_id = ?2').bind(id, uid),
  ]);
  if (!mem.results.length) {
    const now = await db.prepare('SELECT status FROM hashars WHERE id = ?1').bind(id).first();
    if (!now) throw new NotFoundError(NOT_FOUND);
    if (now.status === 'COMPLETED') throw new ConflictError('Bu hashar allaqachon yakunlangan');
    throw new ConflictError('Joy qolmadi');
  }
  return c.json({ joined: true, volunteer_count: cnt.results[0].n });
});

// DELETE /api/hashars/:id/join — chiqish (egasi chiqa olmaydi)
hasharRoutes.delete('/:id/join', requireVerifiedEmail, async (c) => {
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
hasharRoutes.post('/:id/complete', requireVerifiedEmail, async (c) => {
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
hasharRoutes.delete('/:id', requireVerifiedEmail, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  const h = await getMeta(db, id);
  if (h.creator_id !== uid) throw new ForbiddenError("Faqat tashkilotchi o'chira oladi");
  if (h.status === 'COMPLETED') throw new ConflictError("Yakunlangan hasharni o'chirib bo'lmaydi");

  const { results: media } = await db.prepare('SELECT r2_key FROM hashar_media WHERE hashar_id = ?1').bind(id).all();
  // Bog'liq qatorlar oldindan o'chiriladi: meta.changes (o'chirilgan hashar soni) FK kaskadi bilan ortib ketmasin
  const [, , , delHashar] = await db.batch([
    // Tranzaksiya: hashar PENDING bo'lsagina hammasi o'chadi
    db
      .prepare("DELETE FROM comments WHERE hashar_id = ?1 AND EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND status = 'PENDING')")
      .bind(id),
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
            (SELECT COUNT(DISTINCT user_id) FROM volunteers) AS volunteers,
            (SELECT COUNT(*) FROM hashars WHERE status = 'PENDING' AND date_time >= ?1) AS upcoming,
            (SELECT COUNT(DISTINCT lower(district)) FROM users WHERE district <> '' AND blocked_at IS NULL) AS districts`,
  )
    .bind(tashkentNow())
    .first();
  return c.json({
    hashars: row.hashars,
    completed: row.completed,
    volunteers: row.volunteers,
    upcoming: row.upcoming,
    districts: row.districts,
  });
}
