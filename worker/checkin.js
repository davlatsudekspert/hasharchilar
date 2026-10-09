// QR davomat: tashkilotchi hashar kuni (boshlanish vaqtidan 12 soat oldin — 12 soat keyin, Toshkent vaqti)
// server imzolagan, har 10 daqiqada yangilanadigan 6 xonali kodni ko'rsatadi; qo'shilgan ko'ngilli kodni
// skanerlaydi yoki qo'lda kiritadi → volunteers.checked_in_at. Reytingda har bir davomat +5.
//
// Kod = HOTP uslubida HMAC-SHA256(kalit, "checkin:<hashar_id>:<oyna>") dan 6 raqam, oyna = floor(ms / 600000).
// Joriy va oldingi oyna kodi qabul qilinadi (ekrandagi kod yangilangan paytda ham ishlaydi).
// Kalit: Worker secret CHECKIN_SECRET; bo'lmasa bazadagi tasodifiy kalit (settings.checkin_secret, bir marta
// yaratiladi, API orqali hech qachon qaytarilmaydi).
import { Hono } from 'hono';
import { isAdmin, requireAuth, requireVerifiedEmail } from './auth.js';
import { nowMs, sqlTime } from './clock.js';
import { assertVisible, getMeta } from './hashars.js';
import { avatarUrl } from './media.js';
import { siteOrigin } from './payments.js';
import { limitCheckin } from './ratelimit.js';
import { ConflictError, ForbiddenError, HttpError, ValidationError, parseId, readJson, toIso } from './validate.js';

export const WINDOW_MS = 10 * 60 * 1000;
export const OPEN_MS = 12 * 60 * 60 * 1000;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const CODE_RE = /^\d{6}$/;
const CLOSED_MESSAGE = "Davomat faqat hashar kuni ochiq: boshlanishidan 12 soat oldin va 12 soat keyingacha";

const enc = new TextEncoder();

/** Hashar vaqti 'YYYY-MM-DDTHH:MM' (Toshkent) → unix ms (UTC). */
export function hasharStartMs(dateTime) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(dateTime ?? ''));
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - TASHKENT_OFFSET_MS;
}

/** Davomat oynasi: { opens, closes } (ms). */
const checkinWindow = (h) => {
  const start = hasharStartMs(h.date_time);
  return { opens: start - OPEN_MS, closes: start + OPEN_MS };
};

const isOpen = (h, now) => {
  const w = checkinWindow(h);
  return now >= w.opens && now <= w.closes;
};

/** HMAC kaliti: env.CHECKIN_SECRET yoki bazadagi (bir marta yaratiladigan) tasodifiy kalit. */
async function checkinKey(env) {
  let secret = String(env.CHECKIN_SECRET ?? '').trim();
  if (!secret) {
    const db = env.DB;
    const random = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const [, row] = await db.batch([
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('checkin_secret', ?1)").bind(random),
      db.prepare("SELECT value FROM settings WHERE key = 'checkin_secret'"),
    ]);
    secret = row.results[0].value;
  }
  return crypto.subtle.importKey('raw', enc.encode(`hasharchilar-checkin:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** 6 xonali kod (RFC 4226 dagi kabi dinamik kesish). */
async function codeFor(key, hasharId, window) {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`checkin:${hasharId}:${window}`)));
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Doimiy vaqtli solishtirish (teng uzunlikdagi satrlar). */
function safeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Kod: bo'shliq/chiziqchasiz 6 raqam (QR dagi havoladan ?checkin=<kod> ham qabul qilinadi). */
function parseCode(raw) {
  let s = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  const fromUrl = /[?&]checkin=(\d{6})\b/.exec(s);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/[\s-]/g, '');
  if (!CODE_RE.test(s)) throw new ValidationError('Davomat kodi 6 ta raqamdan iborat');
  return s;
}

export const checkinRoutes = new Hono();

// GET /api/hashars/:id/checkin-code — faqat tashkilotchi, faqat davomat oynasida →
// {hashar_id, code, expires_at, refresh_in, window_seconds, url, opens_at, closes_at}
checkinRoutes.get('/hashars/:id/checkin-code', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const user = c.get('user');
  const db = c.env.DB;
  const h = await getMeta(db, id);
  if (h.creator_id !== user.id) {
    assertVisible(c, h, { allowAdmin: false });
    throw new ForbiddenError('Davomat kodini faqat tashkilotchi ochadi');
  }
  if (h.payment_status === 'unpaid') {
    throw new HttpError(409, "Avval hashar e'loni uchun to'lovni amalga oshiring", null, 'payment_required');
  }
  const now = nowMs(c);
  const w = checkinWindow(h);
  if (!isOpen(h, now)) throw new HttpError(409, CLOSED_MESSAGE, null, 'checkin_closed');
  const win = Math.floor(now / WINDOW_MS);
  const code = await codeFor(await checkinKey(c.env), id, win);
  const expires = (win + 1) * WINDOW_MS;
  return c.json({
    hashar_id: id,
    code,
    expires_at: new Date(expires).toISOString(),
    refresh_in: Math.max(1, Math.ceil((expires - now) / 1000)),
    window_seconds: WINDOW_MS / 1000,
    url: `${siteOrigin(c)}/#/hashar/${id}?checkin=${code}`,
    opens_at: new Date(w.opens).toISOString(),
    closes_at: new Date(w.closes).toISOString(),
  });
});

// POST /api/hashars/:id/checkin — {code} → {checked_in: true, checked_in_at}. Faqat qo'shilgan ko'ngilli
// (tashkilotchi emas); takroriy so'rov — o'sha vaqt qaytadi (idempotent). Limit: 20 urinish / soat.
checkinRoutes.post('/hashars/:id/checkin', requireVerifiedEmail, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  const code = parseCode((await readJson(c)).code);
  await limitCheckin(c, uid);
  const h = await getMeta(db, id);
  assertVisible(c, h, { allowAdmin: false });
  if (h.creator_id === uid) throw new ConflictError("Tashkilotchi davomatdan o'tmaydi — kodni ko'ngillilarga ko'rsating");
  const mem = await db.prepare('SELECT checked_in_at FROM volunteers WHERE hashar_id = ?1 AND user_id = ?2').bind(id, uid).first();
  if (!mem) throw new HttpError(403, "Avval hasharga qo'shiling", null, 'not_joined');
  if (mem.checked_in_at) return c.json({ checked_in: true, checked_in_at: toIso(mem.checked_in_at), already: true });

  const now = nowMs(c);
  if (!isOpen(h, now)) throw new HttpError(409, CLOSED_MESSAGE, null, 'checkin_closed');
  const key = await checkinKey(c.env);
  const win = Math.floor(now / WINDOW_MS);
  const [cur, prev] = await Promise.all([codeFor(key, id, win), codeFor(key, id, win - 1)]);
  // Ikkalasi ham tekshiriladi (qaysi biri mos kelgani vaqtdan bilinmasin)
  const ok = safeEqual(code, cur) | safeEqual(code, prev);
  if (!ok) throw new HttpError(400, "Kod noto'g'ri yoki eskirgan. Tashkilotchidagi QR kodni qayta skanerlang", null, 'checkin_invalid');

  const row = await db
    .prepare(
      `UPDATE volunteers SET checked_in_at = COALESCE(checked_in_at, ?3)
       WHERE hashar_id = ?1 AND user_id = ?2 RETURNING checked_in_at`,
    )
    .bind(id, uid, sqlTime(now))
    .first();
  if (!row) throw new HttpError(403, "Avval hasharga qo'shiling", null, 'not_joined'); // shu orada chiqib ketgan
  return c.json({ checked_in: true, checked_in_at: toIso(row.checked_in_at) });
});

// GET /api/hashars/:id/checkins — tashkilotchi yoki admin: kim kelgani
// → {total, checked_in, items: [{user: {id, name, avatar_url}, joined_at, checked_in_at}]} (kelganlar birinchi)
checkinRoutes.get('/hashars/:id/checkins', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const user = c.get('user');
  const db = c.env.DB;
  const h = await getMeta(db, id);
  if (h.creator_id !== user.id && !isAdmin(user, c.env)) {
    assertVisible(c, h, { allowAdmin: false });
    throw new ForbiddenError("Davomat ro'yxatini faqat tashkilotchi ko'radi");
  }
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.avatar_key, v.joined_at, v.checked_in_at
       FROM volunteers v JOIN users u ON u.id = v.user_id
       WHERE v.hashar_id = ?1 AND v.user_id <> ?2
       ORDER BY (v.checked_in_at IS NULL), v.checked_in_at, v.joined_at, v.id LIMIT 1000`,
    )
    .bind(id, h.creator_id)
    .all();
  const items = results.map((r) => ({
    user: { id: r.id, name: r.name, avatar_url: avatarUrl(r.avatar_key) },
    joined_at: toIso(r.joined_at),
    checked_in_at: toIso(r.checked_in_at),
  }));
  return c.json({ total: items.length, checked_in: items.filter((x) => x.checked_in_at).length, items });
});
