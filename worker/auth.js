// Autentifikatsiya: parol xeshi (PBKDF2), sessiyalar, middleware va /api/auth/*, /api/me/* marshrutlari.
// Email bilan ro'yxat / parolni tiklash / emailni tasdiqlash — bir martalik kodlar orqali (worker/otp.js).
import { Hono } from 'hono';
import { emailEnabled, isEmailMock, requireEmailService } from './email.js';
import { checkOtpSend, consumeOtp, createAndSendOtp, CODE_EXPIRED, otpResponse, otpTimings } from './otp.js';
import { limitAuth, limitLoginEmail, limitLoginPhone, limitProfile } from './ratelimit.js';
import { avatarUrl, deletePhotos, readPhoto, storePhoto } from './media.js';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  HttpError,
  ValidationError,
  PASSWORD_MAX,
  parseBio,
  parseDistrict,
  parseEmail,
  parseName,
  parseOtpCode,
  parsePassword,
  parsePhone,
  readForm,
  readJson,
  toIso,
} from './validate.js';

const ITERATIONS = 100000; // Workers'dagi PBKDF2 maksimumi
const SALT_BYTES = 16;
const HASH_BITS = 256;
const SESSION_DAYS = 90;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bayt base64url

const enc = new TextEncoder();
export const BLOCKED_MESSAGE = 'Hisobingiz bloklangan';
export const EMAIL_UNVERIFIED_MESSAGE = 'Avval emailingizni tasdiqlang';
const EMAIL_REQUIRED_MESSAGE = "Ilovani yangilang: ro'yxatdan o'tish endi email orqali";
const PHONE_TAKEN = "Bu telefon raqami allaqachon ro'yxatdan o'tgan";
const EMAIL_TAKEN = "Bu email allaqachon boshqa hisobga bog'langan";

// ---------- Kodlash yordamchilari ----------

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const toB64Url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Doimiy vaqtli solishtirish (uzunlik teng bo'lsa barcha baytlar tekshiriladi). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password, salt, iterations, bits) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bits);
  return new Uint8Array(out);
}

// ---------- Parol ----------

/** Parol xeshi: `pbkdf2$100000$<salt_b64>$<hash_b64>`. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS, HASH_BITS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Saqlangan xesh bilan solishtiradi (format buzilgan bo'lsa — false). */
export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  let salt, expected;
  try {
    salt = fromB64(parts[2]);
    expected = fromB64(parts[3]);
  } catch {
    return false;
  }
  if (expected.length < 16 || expected.length > 64) return false;
  const actual = await pbkdf2(password, salt, iterations, expected.length * 8);
  return timingSafeEqual(actual, expected);
}

// Foydalanuvchi topilmaganda ham bir xil vaqt sarflash uchun soxta xesh
const DUMMY_HASH = `pbkdf2$${ITERATIONS}$${'A'.repeat(22)}==$${'A'.repeat(43)}=`;

// ---------- Sessiyalar ----------

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** Yangi token (mijozga) va uning xeshi (DB ga). */
async function newToken() {
  const token = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, tokenHash: await sha256Hex(token) };
}

const insertSession = (db, tokenHash, userId) =>
  db
    .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+${SESSION_DAYS} days'))`)
    .bind(tokenHash, userId);

// Muddati o'tgan sessiyalarni tozalash (kirish/ro'yxatda yo'l-yo'lakay)
const purgeExpired = (db) => db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')");

/** Token xeshi bo'yicha foydalanuvchi; muddati o'tgan sessiya o'chiriladi va null qaytadi. */
async function getSessionUser(db, tokenHash) {
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.phone, u.role, u.blocked_at, u.created_at, u.bio, u.district, u.avatar_key,
              u.email, u.email_verified_at, (s.expires_at <= datetime('now')) AS expired
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?1`,
    )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  if (row.expired) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
    return null;
  }
  const { expired, ...user } = row;
  return user;
}

// ---------- Administratorlar ----------

// ADMIN_PHONES (Worker secret, vergul bilan): normallashtirilgan to'plam; env qiymati o'zgarmasa qayta hisoblanmaydi
let adminCache = { raw: null, phones: new Set() };

/** env.ADMIN_PHONES dagi yaroqli raqamlar (+998XXXXXXXXX); noto'g'rilari e'tiborsiz qoldiriladi. */
export function adminPhones(env) {
  const raw = String(env?.ADMIN_PHONES ?? '');
  if (raw !== adminCache.raw) {
    const phones = new Set();
    for (const part of raw.split(/[,;\n]/)) {
      if (!part.trim()) continue;
      try {
        phones.add(parsePhone(part));
      } catch {
        // yaroqsiz raqam — o'tkazib yuboriladi
      }
    }
    adminCache = { raw, phones };
  }
  return adminCache.phones;
}

/** Telefon ADMIN_PHONES da bormi (bunday admin'ni paneldan bloklab/o'chirib bo'lmaydi). */
export const isEnvAdmin = (phone, env) => adminPhones(env).has(phone);

/** Administratormi: DB dagi rol yoki ADMIN_PHONES. */
export const isAdmin = (user, env) => Boolean(user) && (user.role === 'admin' || isEnvAdmin(user.phone, env));

/**
 * Foydalanuvchining O'ZIGA qaytariladigan obyekt (/api/me, kirish, ro'yxat, profil).
 * email faqat shu yerda (va admin ro'yxatida) — ommaviy javoblarda hech qachon.
 */
export const userDto = (u, env) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email ?? null,
  email_verified: Boolean(u.email_verified_at),
  created_at: toIso(u.created_at),
  is_admin: isAdmin(u, env),
  bio: u.bio ?? '',
  district: u.district ?? '',
  avatar_url: avatarUrl(u.avatar_key),
});

// Foydalanuvchi obyekti uchun ustunlar (userDto ga kerakli hammasi)
const USER_COLS = 'id, name, phone, email, email_verified_at, role, blocked_at, created_at, bio, district, avatar_key';

// ---------- Middleware ----------

/** `Authorization: Bearer <token>` bo'lsa foydalanuvchini c.get('user') ga qo'yadi (bo'lmasa mehmon). */
export async function optionalAuth(c, next) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(c.req.header('authorization') || '');
  if (m) {
    const tokenHash = TOKEN_RE.test(m[1]) ? await sha256Hex(m[1]) : null;
    const user = tokenHash ? await getSessionUser(c.env.DB, tokenHash) : null;
    if (user?.blocked_at) {
      // Bloklangan foydalanuvchi mehmon hisoblanadi; requireAuth 403 qaytaradi
      c.set('blocked', true);
    } else if (user) {
      c.set('user', user);
      c.set('tokenHash', tokenHash);
    } else {
      c.set('authFailed', true);
    }
  }
  await next();
}

/** Kirish majburiy bo'lgan marshrutlar uchun. */
export async function requireAuth(c, next) {
  if (!c.get('user')) {
    if (c.get('blocked')) throw new ForbiddenError(BLOCKED_MESSAGE);
    throw new AuthError(c.get('authFailed') ? 'Sessiya muddati tugagan. Qaytadan kiring' : 'Avval tizimga kiring');
  }
  await next();
}

/**
 * Kontent yaratadigan / boshqalarga ta'sir qiladigan amallar (hashar yaratish, qo'shilish, chiqish, yakunlash,
 * o'chirish, izoh): kirish + (email xizmati yoqilgan bo'lsa) tasdiqlangan email. Aks holda 403
 * `{error, code: 'email_unverified'}`. Profil, email qo'shish va admin moderatsiyasi bunga kirmaydi.
 */
export async function requireVerifiedEmail(c, next) {
  await requireAuth(c, async () => {
    if (emailEnabled(c.env) && !c.get('user').email_verified_at) {
      throw new HttpError(403, EMAIL_UNVERIFIED_MESSAGE, null, 'email_unverified');
    }
    await next();
  });
}

/** UNIQUE buzilishi → 409 (qaysi maydon band ekaniga qarab); boshqa xato — o'zgarishsiz. */
function conflictFrom(err) {
  const msg = String(err?.message);
  if (!/UNIQUE/i.test(msg)) return err;
  return new ConflictError(/users\.email/.test(msg) ? EMAIL_TAKEN : PHONE_TAKEN);
}

/** Telefon / email bandligini tekshiradi (409). `exceptId` — o'zi (email almashtirishda). */
async function assertFree(db, { phone = null, email = null, exceptId = 0 }) {
  const row = await db
    .prepare(
      `SELECT (SELECT 1 FROM users WHERE phone = ?1 AND id <> ?3) AS phone,
              (SELECT 1 FROM users WHERE email = ?2 AND id <> ?3) AS email`,
    )
    .bind(phone, email, exceptId)
    .first();
  if (row.phone) throw new ConflictError(PHONE_TAKEN);
  if (row.email) throw new ConflictError(EMAIL_TAKEN);
}

/** Ro'yxat payload'i (register kodi bilan saqlangan JSON). */
function readRegisterPayload(raw) {
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.name === 'string' && typeof p.phone === 'string' && typeof p.password_hash === 'string') return p;
  } catch {
    // buzilgan
  }
  return null;
}

// ---------- Marshrutlar: /api/auth/*, /api/me ----------

export const authRoutes = new Hono();

// POST /api/auth/register — {name, phone, password} → 201 {token, user} (eski APK'lar uchun).
// Email xizmati yoqilgan bo'lsa — 410 {code: 'email_required'}: ro'yxat faqat register/start + register/verify orqali.
// Xizmat o'chiq bo'lsa (RESEND_API_KEY yo'q va EMAIL_MOCK emas) — avvalgidek ishlaydi (sayt "qulflanib" qolmasin).
// Test uchun (FAQAT EMAIL_MOCK=1): `x-test-legacy-register: 1` — emailsiz "eski" hisob yaratish.
authRoutes.post('/auth/register', async (c) => {
  const legacyTest = isEmailMock(c.env) && c.req.header('x-test-legacy-register') === '1';
  if (emailEnabled(c.env) && !legacyTest) throw new HttpError(410, EMAIL_REQUIRED_MESSAGE, null, 'email_required');
  await limitAuth(c);
  const body = await readJson(c);
  const name = parseName(body.name);
  const phone = parsePhone(body.phone);
  const password = parsePassword(body.password);
  const db = c.env.DB;

  const exists = await db.prepare('SELECT 1 FROM users WHERE phone = ?1').bind(phone).first();
  if (exists) throw new ConflictError(PHONE_TAKEN);

  const passwordHash = await hashPassword(password);
  const { token, tokenHash } = await newToken();
  let user;
  try {
    // Foydalanuvchi va sessiya bitta tranzaksiyada
    const [ins] = await db.batch([
      db
        .prepare(`INSERT INTO users (phone, name, password_hash) VALUES (?1, ?2, ?3) RETURNING ${USER_COLS}`)
        .bind(phone, name, passwordHash),
      db
        .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at)
                  SELECT ?1, id, datetime('now', '+${SESSION_DAYS} days') FROM users WHERE phone = ?2`)
        .bind(tokenHash, phone),
    ]);
    user = ins.results[0];
  } catch (err) {
    // Parallel ro'yxatdan o'tishda UNIQUE buzilishi
    throw conflictFrom(err);
  }
  return c.json({ token, user: userDto(user, c.env) }, 201);
});

// POST /api/auth/register/start — {name, phone, email, password} → kod emailga yuboriladi.
// → {ok, email, expires_in, resend_in} (+ dev_code faqat EMAIL_MOCK=1). Telefon/email band — 409.
authRoutes.post('/auth/register/start', async (c) => {
  requireEmailService(c.env);
  await limitAuth(c);
  const body = await readJson(c);
  const name = parseName(body.name);
  const email = parseEmail(body.email);
  const phone = parsePhone(body.phone);
  const password = parsePassword(body.password);
  await assertFree(c.env.DB, { phone, email });
  // Limitlar parol xeshidan oldin (PBKDF2 qimmat): qayta yuborish oralig'i, email/IP soatlik limit
  await checkOtpSend(c, email, 'register');
  const payload = JSON.stringify({ name, phone, password_hash: await hashPassword(password) });
  const issued = await createAndSendOtp(c, { email, purpose: 'register', payload });
  return c.json(otpResponse(c, email, issued));
});

// POST /api/auth/register/verify — {email, code} → 201 {token, user}. Hisob shu yerda yaratiladi (email tasdiqlangan).
authRoutes.post('/auth/register/verify', async (c) => {
  requireEmailService(c.env);
  await limitAuth(c);
  const body = await readJson(c);
  const email = parseEmail(body.email);
  const code = parseOtpCode(body.code);
  const db = c.env.DB;
  const otp = await consumeOtp(db, { purpose: 'register', email, code });
  const p = readRegisterPayload(otp.payload);
  if (!p) throw new ValidationError(CODE_EXPIRED);
  // Kod kutilayotgan paytda telefon yoki email boshqa hisobga o'tgan bo'lishi mumkin
  await assertFree(db, { phone: p.phone, email });

  const { token, tokenHash } = await newToken();
  let user;
  try {
    const [ins] = await db.batch([
      db
        .prepare(
          `INSERT INTO users (phone, name, password_hash, email, email_verified_at)
           VALUES (?1, ?2, ?3, ?4, datetime('now')) RETURNING ${USER_COLS}`,
        )
        .bind(p.phone, p.name, p.password_hash, email),
      db
        .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at)
                  SELECT ?1, id, datetime('now', '+${SESSION_DAYS} days') FROM users WHERE phone = ?2`)
        .bind(tokenHash, p.phone),
    ]);
    user = ins.results[0];
  } catch (err) {
    throw conflictFrom(err);
  }
  return c.json({ token, user: userDto(user, c.env) }, 201);
});

// POST /api/auth/login — {login, password} (login — telefon yoki email) yoki eski {phone, password} → {token, user}
authRoutes.post('/auth/login', async (c) => {
  await limitAuth(c);
  const body = await readJson(c);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) throw new ValidationError('Parolni kiriting');
  const db = c.env.DB;

  const raw = typeof body.login === 'string' && body.login.trim() ? body.login : body.phone;
  const byEmail = typeof raw === 'string' && raw.includes('@');
  // Noto'g'ri formatdagi telefon/email ham "noto'g'ri ma'lumot" (SPEC 5: 401), mavjud bo'lmagan hisob kabi
  let key = null;
  try {
    key = byEmail ? parseEmail(raw) : parsePhone(raw);
  } catch {
    key = null;
  }
  // Bitta hisobga parol tanlash: IP almashtirilsa ham telefon/email bo'yicha limit ishlaydi
  if (key) await (byEmail ? limitLoginEmail(c, key) : limitLoginPhone(c, key));

  const row = key
    ? await db
        .prepare(
          `SELECT ${USER_COLS}, password_hash FROM users
           WHERE ${byEmail ? 'email = ?1 AND email_verified_at IS NOT NULL' : 'phone = ?1'}`,
        )
        .bind(key)
        .first()
    : null;
  // Foydalanuvchi bo'lmasa ham PBKDF2 bajariladi (vaqt orqali hisob borligini bilib bo'lmasin)
  const ok = await verifyPassword(password.slice(0, PASSWORD_MAX + 1), row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok || password.length > PASSWORD_MAX) {
    throw new AuthError(byEmail ? "Email yoki parol noto'g'ri" : "Telefon yoki parol noto'g'ri");
  }
  // Bloklanganlik faqat to'g'ri paroldan keyin aytiladi
  if (row.blocked_at) throw new ForbiddenError(BLOCKED_MESSAGE);

  const { token, tokenHash } = await newToken();
  await db.batch([purgeExpired(db), insertSession(db, tokenHash, row.id)]);
  return c.json({ token, user: userDto(row, c.env) });
});

// POST /api/auth/forgot — {email} → doim 200 {ok, email, expires_in, resend_in} (hisob borligi aytilmaydi).
// Kod faqat shu email tasdiqlangan (bloklanmagan) hisob bo'lsa yuboriladi; limitlar har doim bir xil qo'llanadi.
// Xat fonda yuboriladi — javob vaqti ham hisob borligini bildirmasin. dev_code — faqat EMAIL_MOCK=1.
authRoutes.post('/auth/forgot', async (c) => {
  requireEmailService(c.env);
  await limitAuth(c);
  const body = await readJson(c);
  const email = parseEmail(body.email);
  await checkOtpSend(c, email, 'reset');
  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?1 AND email_verified_at IS NOT NULL AND blocked_at IS NULL',
  )
    .bind(email)
    .first();
  const issued = user
    ? await createAndSendOtp(c, { email, purpose: 'reset', userId: user.id, background: true })
    : { ...otpTimings(c), code: null };
  return c.json(otpResponse(c, email, issued));
});

// POST /api/auth/reset — {email, code, new_password} → {token, user}. Barcha eski sessiyalar o'chiriladi.
authRoutes.post('/auth/reset', async (c) => {
  requireEmailService(c.env);
  await limitAuth(c);
  const body = await readJson(c);
  const email = parseEmail(body.email);
  const code = parseOtpCode(body.code);
  const password = parsePassword(body.new_password); // kod urinishi sarflanishidan oldin
  const db = c.env.DB;
  const otp = await consumeOtp(db, { purpose: 'reset', email, code });
  // Kod yuborilgandan keyin email boshqa hisobga o'tgan / olib tashlangan bo'lsa — kod yaroqsiz
  const user = await db
    .prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?1 AND email = ?2`)
    .bind(otp.user_id, email)
    .first();
  if (!user) throw new ValidationError(CODE_EXPIRED);
  if (user.blocked_at) throw new ForbiddenError(BLOCKED_MESSAGE);

  const passwordHash = await hashPassword(password);
  const { token, tokenHash } = await newToken();
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?2 WHERE id = ?1').bind(user.id, passwordHash),
    db.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(user.id),
    insertSession(db, tokenHash, user.id),
  ]);
  return c.json({ token, user: userDto(user, c.env) });
});

// POST /api/auth/logout — joriy sessiyani o'chiradi
authRoutes.post('/auth/logout', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(c.get('tokenHash')).run();
  return c.json({ ok: true });
});

// GET /api/me — profil va shaxsiy statistika
authRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const stats = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM hashars WHERE creator_id = ?1) AS created,
       (SELECT COUNT(*) FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
          WHERE v.user_id = ?1 AND h.creator_id <> ?1) AS joined,
       (SELECT COUNT(*) FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
          WHERE v.user_id = ?1 AND h.status = 'COMPLETED') AS completed`,
  )
    .bind(user.id)
    .first();
  return c.json({
    user: userDto(user, c.env),
    stats: { created: stats.created, joined: stats.joined, completed: stats.completed },
  });
});

// POST /api/me/profile — multipart: name?, bio?, district?, avatar? (rasm ≤ 5 MB), remove_avatar? ('1')
// Yuborilmagan maydon o'zgarmaydi. Avatar almashtirilsa/o'chirilsa eski fayl R2 dan o'chiriladi.
authRoutes.post('/me/profile', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const form = await readForm(c);
  const has = (k) => typeof form.get(k) === 'string';
  const sets = [];
  const params = [];
  const set = (col, val) => {
    params.push(val);
    sets.push(`${col} = ?${params.length + 1}`); // ?1 — foydalanuvchi ID si
  };
  if (has('name')) set('name', parseName(form.get('name')));
  if (has('bio')) set('bio', parseBio(form.get('bio')));
  if (has('district')) set('district', parseDistrict(form.get('district')));
  const photo = await readPhoto(form.get('avatar'));
  const removeAvatar = !photo && ['1', 'true'].includes(String(form.get('remove_avatar') ?? ''));
  if (!sets.length && !photo && !removeAvatar) throw new ValidationError("O'zgartirish uchun ma'lumot yuborilmadi");
  // Limit faqat to'g'ri so'rovlarga qo'llanadi
  await limitProfile(c, user.id);

  const key = photo ? await storePhoto(c.env.PHOTOS, photo, 'avatars') : null;
  if (photo || removeAvatar) set('avatar_key', key);
  let old;
  try {
    // Bitta tranzaksiya: eski avatar kaliti aynan shu yangilanishdan oldingi qiymat
    [old] = await db.batch([
      db.prepare('SELECT avatar_key FROM users WHERE id = ?1').bind(user.id),
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?1`).bind(user.id, ...params),
    ]);
  } catch (err) {
    if (key) await deletePhotos(c.env.PHOTOS, [key]);
    if (/CHECK constraint failed/i.test(String(err?.message))) throw new ValidationError("Ma'lumotlar noto'g'ri");
    throw err;
  }
  const oldKey = old.results[0]?.avatar_key;
  if ((photo || removeAvatar) && oldKey && oldKey !== key) await deletePhotos(c.env.PHOTOS, [oldKey]);
  const row = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?1`).bind(user.id).first();
  return c.json({ user: userDto(row, c.env) });
});

// POST /api/me/password — {current_password, new_password} → {ok: true}
// Joriy parol tekshiriladi (kirishdagi kabi limit: IP va telefon bo'yicha — umumiy hisob, chunki bu ham
// parol tanlash imkoniyati). Muvaffaqiyatda joriy sessiyadan boshqa barcha sessiyalar o'chiriladi.
// Parollar hech qachon log'ga yozilmaydi.
authRoutes.post('/me/password', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  await limitAuth(c);
  const body = await readJson(c);
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  if (!current) throw new ValidationError('Joriy parolni kiriting');
  const next = parsePassword(body.new_password);
  await limitLoginPhone(c, user.phone);

  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?1').bind(user.id).first();
  const ok = row && (await verifyPassword(current.slice(0, PASSWORD_MAX + 1), row.password_hash));
  if (!ok || current.length > PASSWORD_MAX) throw new AuthError("Joriy parol noto'g'ri");

  const passwordHash = await hashPassword(next);
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?2 WHERE id = ?1').bind(user.id, passwordHash),
    db.prepare('DELETE FROM sessions WHERE user_id = ?1 AND token_hash <> ?2').bind(user.id, c.get('tokenHash')),
  ]);
  return c.json({ ok: true });
});

// POST /api/me/email/start — {email} → tasdiqlash kodi shu emailga ({ok, email, expires_in, resend_in}, + dev_code
// faqat EMAIL_MOCK=1). Email boshqa hisobda bo'lsa — 409. Kod shu foydalanuvchiga bog'lanadi.
authRoutes.post('/me/email/start', requireAuth, async (c) => {
  requireEmailService(c.env);
  const user = c.get('user');
  const body = await readJson(c);
  const email = parseEmail(body.email);
  if (user.email === email && user.email_verified_at) throw new ValidationError('Bu email allaqachon tasdiqlangan');
  await assertFree(c.env.DB, { email, exceptId: user.id });
  await checkOtpSend(c, email, 'verify');
  const issued = await createAndSendOtp(c, { email, purpose: 'verify', userId: user.id });
  return c.json(otpResponse(c, email, issued));
});

// POST /api/me/email/verify — {code} → {user} (email va email_verified_at yoziladi)
authRoutes.post('/me/email/verify', requireAuth, async (c) => {
  requireEmailService(c.env);
  await limitAuth(c);
  const user = c.get('user');
  const code = parseOtpCode((await readJson(c)).code);
  const db = c.env.DB;
  const otp = await consumeOtp(db, { purpose: 'verify', userId: user.id, code });
  try {
    await db
      .prepare("UPDATE users SET email = ?2, email_verified_at = datetime('now') WHERE id = ?1")
      .bind(user.id, otp.email)
      .run();
  } catch (err) {
    throw conflictFrom(err);
  }
  const row = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?1`).bind(user.id).first();
  return c.json({ user: userDto(row, c.env) });
});
