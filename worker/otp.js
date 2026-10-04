// Emailga yuboriladigan bir martalik kodlar (OTP): yaratish, saqlash, limitlar, tekshirish.
//
// Qoidalar:
//   - 6 raqam, crypto.getRandomValues (rejection sampling — teng taqsimot);
//   - bazada faqat sha256(purpose|email|code) hex; muddati 10 daqiqa;
//   - 5 ta noto'g'ri urinishdan keyin kod o'ladi; ishlatilgan kod qayta ishlamaydi;
//   - shu email+maqsad uchun yangi kod eskilarini bekor qiladi;
//   - qayta yuborish: email+maqsad bo'yicha 60 soniyada bir marta (429 + Retry-After);
//     bitta emailga 5 ta / soat, bitta IP dan 20 ta / soat;
//   - solishtirish doimiy vaqtda.
// Testlar uchun (FAQAT EMAIL_MOCK=1 bo'lganda): `x-test-otp-ttl` / env OTP_TTL_SEC — kod muddati,
// `x-test-otp-cooldown` — qayta yuborish oralig'i (soniya). Production'da e'tiborsiz qoldiriladi.
import { isEmailMock, otpEmail, sendEmail } from './email.js';
import { clearCooldown, cooldown, limitOtpEmail, limitOtpIp } from './ratelimit.js';
import { ValidationError } from './validate.js';

export const OTP_TTL_SEC = 600;
export const OTP_COOLDOWN_SEC = 60;
export const OTP_MAX_ATTEMPTS = 5;
const PURGE_AFTER_SEC = 24 * 60 * 60; // eski kod qatorlari bir kundan keyin o'chiriladi

export const CODE_WRONG = "Kod noto'g'ri";
export const CODE_EXPIRED = "Kod eskirgan, yangisini so'rang";

const enc = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Doimiy vaqtli satr solishtirish (uzunligi teng bo'lsa barcha belgilar tekshiriladi). */
function safeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 000000..999999 teng ehtimollik bilan (2^32 ni 10^6 ga bo'linadigan chegaradan yuqorisi tashlanadi). */
export function generateCode() {
  const limit = Math.floor(0x100000000 / 1e6) * 1e6;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1e6).padStart(6, '0');
}

export const otpHash = (purpose, email, code) => sha256Hex(`${purpose}|${email}|${code}`);

/** Test uchun son (faqat EMAIL_MOCK=1): header yoki env; aks holda null. */
function testOverride(c, header, envKey) {
  if (!isEmailMock(c.env)) return null;
  const raw = c.req.header(header) ?? (envKey ? c.env[envKey] : undefined);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3600 ? n : null;
}

const otpTtl = (c) => testOverride(c, 'x-test-otp-ttl', 'OTP_TTL_SEC') || OTP_TTL_SEC;
const otpCooldown = (c) => testOverride(c, 'x-test-otp-cooldown', null) ?? OTP_COOLDOWN_SEC;
const cooldownKey = (purpose, email) => `otp-cd:${purpose}:${email}`;

/** Kod muddati va qayta yuborish oralig'i (soniya) — javoblar uchun. */
export const otpTimings = (c) => ({ ttl: otpTtl(c), cooldown: otpCooldown(c) });

/**
 * Yuborishdan oldingi limitlar: qayta yuborish oralig'i, email va IP bo'yicha soatlik limit.
 * Foydalanuvchi bor-yo'qligidan qat'i nazar bir xil qo'llanadi (forgot: hisob borligini bilib bo'lmasin).
 */
export async function checkOtpSend(c, email, purpose) {
  await cooldown(c.env.DB, cooldownKey(purpose, email), otpCooldown(c));
  await limitOtpEmail(c, email);
  await limitOtpIp(c);
}

/**
 * Yangi kod: shu email+maqsad (verify'da — shu foydalanuvchi) uchun eski kodlar bekor qilinadi, yangisi
 * saqlanadi va xat yuboriladi. background=true — xat javobni kutmasdan yuboriladi (forgot: vaqt bo'yicha
 * hisob borligini bilib bo'lmasin). Natija: { code, ttl, cooldown }.
 */
export async function createAndSendOtp(c, { email, purpose, userId = null, payload = null, background = false }) {
  const db = c.env.DB;
  const code = generateCode();
  const now = nowSec();
  const ttl = otpTtl(c);
  const codeHash = await otpHash(purpose, email, code);
  const [, , ins] = await db.batch([
    db
      .prepare(
        `UPDATE email_otps SET consumed_at = ?4, payload = NULL
         WHERE purpose = ?1 AND consumed_at IS NULL AND (email = ?2 OR (?3 IS NOT NULL AND user_id = ?3))`,
      )
      .bind(purpose, email, userId, now),
    db.prepare('DELETE FROM email_otps WHERE created_at < ?1').bind(now - PURGE_AFTER_SEC),
    db
      .prepare(
        `INSERT INTO email_otps (email, purpose, user_id, code_hash, payload, expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`,
      )
      .bind(email, purpose, userId, codeHash, payload, now + ttl, now),
  ]);
  const id = ins.results[0].id;
  const msg = otpEmail(code, purpose);
  const send = () => sendEmail(c.env, { to: email, ...msg });

  if (background) {
    const p = send().catch(() => {}); // xato sendEmail ichida (faqat status) loglanadi
    try {
      c.executionCtx.waitUntil(p);
    } catch {
      await p; // executionCtx yo'q muhit
    }
  } else {
    try {
      await send();
    } catch (err) {
      // Yetib bormagan kod ishlamasin; qayta urinish darhol mumkin bo'lsin
      await db.prepare('DELETE FROM email_otps WHERE id = ?1').bind(id).run();
      await clearCooldown(db, cooldownKey(purpose, email));
      throw err;
    }
  }
  return { code, ttl, cooldown: otpCooldown(c) };
}

/** Kod yuborilgandagi javob (dev_code — faqat EMAIL_MOCK=1). */
export function otpResponse(c, email, issued, extra = {}) {
  const out = { ok: true, email, expires_in: issued.ttl, resend_in: issued.cooldown, ...extra };
  if (isEmailMock(c.env) && issued.code) out.dev_code = issued.code;
  return out;
}

/**
 * Kodni tekshiradi va ishlatadi. Topilmasa / muddati o'tgan / 5 urinish tugagan / ishlatilgan — 400 CODE_EXPIRED,
 * noto'g'ri — 400 CODE_WRONG (urinish hisoblanadi). Natija: kod qatori (email, user_id, payload).
 * `userId` berilsa (verify) — shu foydalanuvchining oxirgi kodi, aks holda emailniki.
 */
export async function consumeOtp(db, { purpose, email = null, userId = null, code }) {
  const byUser = userId != null;
  const row = await db
    .prepare(
      `SELECT id, email, user_id, code_hash, payload, attempts, expires_at FROM email_otps
       WHERE purpose = ?1 AND ${byUser ? 'user_id' : 'email'} = ?2 AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(purpose, byUser ? userId : email)
    .first();
  const now = nowSec();
  if (!row || row.expires_at <= now || row.attempts >= OTP_MAX_ATTEMPTS) throw new ValidationError(CODE_EXPIRED);

  // Urinish oldindan band qilinadi (atomar): parallel so'rovlar bilan ham 5 tadan ortiq solishtirib bo'lmaydi
  const slot = await db
    .prepare(
      `UPDATE email_otps SET attempts = attempts + 1
       WHERE id = ?1 AND consumed_at IS NULL AND attempts < ?2 AND expires_at > ?3
       RETURNING attempts`,
    )
    .bind(row.id, OTP_MAX_ATTEMPTS, now)
    .first();
  if (!slot) throw new ValidationError(CODE_EXPIRED);

  const expected = await otpHash(purpose, row.email, code);
  if (!safeEqual(expected, row.code_hash)) throw new ValidationError(CODE_WRONG);

  const done = await db
    .prepare('UPDATE email_otps SET consumed_at = ?2, payload = NULL WHERE id = ?1 AND consumed_at IS NULL RETURNING id')
    .bind(row.id, now)
    .first();
  if (!done) throw new ValidationError(CODE_EXPIRED);
  // Kod ishlatildi — shu email+maqsad uchun qayta yuborish oralig'i kerak emas (soatlik limit qoladi)
  await clearCooldown(db, cooldownKey(purpose, row.email));
  return row;
}
