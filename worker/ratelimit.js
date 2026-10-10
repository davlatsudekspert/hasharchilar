// D1 asosidagi oddiy limitlagich (fixed window).
import { HttpError, RateLimitError } from './validate.js';

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

/** Izoh yozish: foydalanuvchi bo'yicha 20 ta / soat. */
export function limitComment(c, userId) {
  return rateLimit(
    c.env.DB,
    `comment:${userId}`,
    20,
    60 * 60,
    "Bir soatda ko'pi bilan 20 ta izoh yozish mumkin. Birozdan so'ng urinib ko'ring",
  );
}

/** Profilni yangilash (avatar yuklash): foydalanuvchi bo'yicha 20 ta / soat. */
export function limitProfile(c, userId) {
  return rateLimit(
    c.env.DB,
    `profile:${userId}`,
    20,
    60 * 60,
    "Profil juda ko'p yangilandi. Birozdan so'ng qayta urinib ko'ring",
  );
}

/** Manzil qidirish / koordinata → manzil: IP bo'yicha 30 ta / daqiqa (Nominatim qoidalari). */
export function limitGeo(c) {
  return rateLimit(
    c.env.DB,
    `geo:${clientIp(c)}`,
    30,
    60,
    "Manzil qidiruvi juda ko'p. Bir daqiqadan so'ng qayta urinib ko'ring",
  );
}

/**
 * Butun ilova uchun umumiy "navbat": `key` bo'yicha ikki chaqiruv orasida kamida `gapMs` ms (barcha IP lar uchun bitta).
 * Joy band bo'lsa — bo'shaguncha kutadi (ko'pi bilan `waitMs`), ulgurmasa 503 (Retry-After).
 * Bitta atomar UPSERT: shart (oxirgi chaqiruvdan gapMs o'tgan) bajarilmasa qator yangilanmaydi va RETURNING bo'sh.
 * window_start bu yerda millisekund (boshqa kalitlarda soniya) — eski yozuvlarni tozalash (soniya bo'yicha) unga tegmaydi.
 */
export async function upstreamGate(db, key, { gapMs, waitMs, message }) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const now = Date.now();
    const row = await db
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
         ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1
           WHERE rate_limits.window_start <= ?3
         RETURNING window_start`,
      )
      .bind(key, now, now - gapMs)
      .first();
    if (row) return;
    const cur = await db.prepare('SELECT window_start FROM rate_limits WHERE key = ?1').bind(key).first();
    const freeAt = (cur ? Number(cur.window_start) : now) + gapMs;
    const wait = Math.max(20, freeAt - Date.now()) + Math.floor(Math.random() * 40); // jitter: kutayotganlar bir vaqtda urilmasin
    if (Date.now() + wait > deadline) throw new HttpError(503, message, { 'retry-after': String(Math.max(1, Math.ceil(gapMs / 1000) + 1)) });
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** Kirish: bitta emailga 10 urinish / 15 daqiqa (telefon bilan bir xil hisob turi). */
export function limitLoginEmail(c, email) {
  return rateLimit(c.env.DB, `login:${email}`, 10, 15 * 60, AUTH_MESSAGE);
}

// ---------- Email kodlari (OTP) ----------

/**
 * Qayta yuborish oralig'i: `key` bo'yicha oxirgi yuborishdan `cooldownSec` o'tmagan bo'lsa — 429 (Retry-After).
 * O'tgan bo'lsa yangi vaqt yoziladi. Bitta atomar UPSERT: shart bajarilmasa qator yangilanmaydi va RETURNING bo'sh.
 */
export async function cooldown(db, key, cooldownSec) {
  if (!(cooldownSec > 0)) return;
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1
         WHERE rate_limits.window_start <= ?3
       RETURNING window_start`,
    )
    .bind(key, now, now - cooldownSec)
    .first();
  if (row) return;
  const cur = await db.prepare('SELECT window_start FROM rate_limits WHERE key = ?1').bind(key).first();
  const wait = Math.max(1, (cur ? cur.window_start + cooldownSec : now + cooldownSec) - now);
  throw new RateLimitError(`Yangi kodni ${wait} soniyadan so'ng so'rashingiz mumkin`, wait);
}

/** Qayta yuborish oralig'ini bekor qiladi (xat yuborilmay qolganda darhol qayta urinish mumkin bo'lsin). */
export function clearCooldown(db, key) {
  return db.prepare('DELETE FROM rate_limits WHERE key = ?1').bind(key).run();
}

/** Bitta emailga ko'pi bilan 5 ta kod / soat (barcha maqsadlar bo'yicha umumiy). */
export function limitOtpEmail(c, email) {
  return rateLimit(
    c.env.DB,
    `otp-mail:${email}`,
    5,
    60 * 60,
    "Bu emailga juda ko'p kod yuborildi. Bir soatdan so'ng qayta urinib ko'ring",
  );
}

/** Bitta IP dan ko'pi bilan 20 ta kod / soat. */
export function limitOtpIp(c) {
  return rateLimit(
    c.env.DB,
    `otp-ip:${clientIp(c)}`,
    20,
    60 * 60,
    "Juda ko'p kod so'raldi. Bir soatdan so'ng qayta urinib ko'ring",
  );
}

// ---------- v4: saqlash, bildirishnomalar, davomat ----------

/** Saqlash / saqlanganlardan olib tashlash: foydalanuvchi bo'yicha 120 ta / soat. */
export function limitSave(c, userId) {
  return rateLimit(
    c.env.DB,
    `save:${userId}`,
    120,
    60 * 60,
    "Juda ko'p saqlash amali. Birozdan so'ng qayta urinib ko'ring",
  );
}

/** Bildirishnomalarni o'qilgan deb belgilash: foydalanuvchi bo'yicha 300 ta / soat. */
export function limitNotifyRead(c, userId) {
  return rateLimit(
    c.env.DB,
    `notif-read:${userId}`,
    300,
    60 * 60,
    "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring",
  );
}

/** QR davomat kodi yuborish: foydalanuvchi bo'yicha 20 urinish / soat (kodni taxmin qilishdan himoya). */
export function limitCheckin(c, userId) {
  return rateLimit(
    c.env.DB,
    `checkin:${userId}`,
    20,
    60 * 60,
    "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring",
  );
}

/** Shikoyat yuborish: foydalanuvchi bo'yicha 20 ta / soat (spamdan himoya). */
export function limitReport(c, userId) {
  return rateLimit(
    c.env.DB,
    `report:${userId}`,
    20,
    60 * 60,
    "Juda ko'p shikoyat yuborildi. Birozdan so'ng qayta urinib ko'ring",
  );
}

/** Bloklash / blokdan chiqarish: foydalanuvchi bo'yicha 60 ta / soat. */
export function limitBlock(c, userId) {
  return rateLimit(
    c.env.DB,
    `block:${userId}`,
    60,
    60 * 60,
    "Juda ko'p so'rov. Birozdan so'ng qayta urinib ko'ring",
  );
}
