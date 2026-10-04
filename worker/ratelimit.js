// D1 asosidagi oddiy limitlagich (fixed window).
import { RateLimitError } from './validate.js';

/** IPv6 manzilni /64 prefiksga qisqartiradi (bitta abonent butun /64 tarmoqqa ega). */
function ipv6Prefix64(ip) {
  const addr = ip.split('%')[0].toLowerCase(); // zona (%eth0) olib tashlanadi
  const [head, tail] = addr.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  // '::' o'rniga yetishmagan nol guruhlar qo'yiladi
  const groups = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${groups
    .slice(0, 4)
    .map((g) => (g || '0').replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * Mijoz IP manzili (Cloudflare beradi; lokal dev'da 'local').
 * IPv6 — /64 prefiks bo'yicha (aks holda bitta VPS cheksiz manzil almashtira oladi);
 * IPv4-mapped (::ffff:1.2.3.4) — oddiy IPv4 sifatida.
 */
export function clientIp(c) {
  const ip = (c.req.header('cf-connecting-ip') || '').trim();
  if (!ip) return 'local';
  if (!ip.includes(':')) return ip;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  return ipv6Prefix64(ip);
}

/**
 * `key` bo'yicha hisoblagichni bitta atomar UPSERT bilan oshiradi.
 * Oyna ichida `limit` dan oshsa — 429 (Retry-After bilan).
 */
export async function rateLimit(db, key, limit, windowSec, message) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start
                      THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first();

  // Vaqti-vaqti bilan eski yozuvlarni tozalash (~2% so'rovlarda)
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(now - 86400).run();
  }

  if (row.count > limit) throw new RateLimitError(message, windowStart + windowSec - now);
}

const AUTH_MESSAGE = "Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring";

/**
 * Kirish/ro'yxat: IP bo'yicha 30 urinish / 15 daqiqa (umumiy hisob).
 * SPEC'da 10 edi — CGNAT ortidagi ko'p foydalanuvchi bitta IP ni bo'lishadi; parol tanlashdan
 * asosiy himoya endi telefon bo'yicha limit (limitLoginPhone).
 */
export function limitAuth(c) {
  return rateLimit(c.env.DB, `auth:${clientIp(c)}`, 30, 15 * 60, AUTH_MESSAGE);
}

/** Kirish: bitta telefon raqamiga 10 urinish / 15 daqiqa (IP dan qat'i nazar). */
export function limitLoginPhone(c, phone) {
  return rateLimit(c.env.DB, `login:${phone}`, 10, 15 * 60, AUTH_MESSAGE);
}

/** Hashar e'lon qilish: foydalanuvchi bo'yicha 10 ta / soat. */
export function limitCreate(c, userId) {
  return rateLimit(
    c.env.DB,
    `create:${userId}`,
    10,
    60 * 60,
    "Bir soatda ko'pi bilan 10 ta hashar e'lon qilish mumkin. Birozdan so'ng urinib ko'ring",
  );
}

/** Qatnashish/chiqish: foydalanuvchi bo'yicha 30 ta / soat (telefon raqamlarini yig'ishdan himoya). */
export function limitJoin(c, userId) {
  return rateLimit(
    c.env.DB,
    `join:${userId}`,
    30,
    60 * 60,
    "Juda ko'p qo'shilish/chiqish. Birozdan so'ng qayta urinib ko'ring",
  );
}
