// Autentifikatsiya: parol xeshi (PBKDF2), sessiyalar, middleware va /api/auth/* marshrutlari.
import { Hono } from 'hono';
import { limitAuth, limitLoginPhone } from './ratelimit.js';
import {
  AuthError,
  ConflictError,
  ValidationError,
  PASSWORD_MAX,
  parseName,
  parsePassword,
  parsePhone,
  readJson,
  toIso,
} from './validate.js';

const ITERATIONS = 100000; // Workers'dagi PBKDF2 maksimumi
const SALT_BYTES = 16;
const HASH_BITS = 256;
const SESSION_DAYS = 90;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bayt base64url

const enc = new TextEncoder();

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
      `SELECT u.id, u.name, u.phone, u.created_at, (s.expires_at <= datetime('now')) AS expired
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
  return { id: row.id, name: row.name, phone: row.phone, created_at: row.created_at };
}

/** Mijozga qaytariladigan foydalanuvchi obyekti. */
export const userDto = (u) => ({ id: u.id, name: u.name, phone: u.phone, created_at: toIso(u.created_at) });

// ---------- Middleware ----------

/** `Authorization: Bearer <token>` bo'lsa foydalanuvchini c.get('user') ga qo'yadi (bo'lmasa mehmon). */
export async function optionalAuth(c, next) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(c.req.header('authorization') || '');
  if (m) {
    const tokenHash = TOKEN_RE.test(m[1]) ? await sha256Hex(m[1]) : null;
    const user = tokenHash ? await getSessionUser(c.env.DB, tokenHash) : null;
    if (user) {
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
    throw new AuthError(c.get('authFailed') ? 'Sessiya muddati tugagan. Qaytadan kiring' : 'Avval tizimga kiring');
  }
  await next();
}

// ---------- Marshrutlar: /api/auth/*, /api/me ----------

export const authRoutes = new Hono();

// POST /api/auth/register — {name, phone, password} → 201 {token, user}
authRoutes.post('/auth/register', async (c) => {
  await limitAuth(c);
  const body = await readJson(c);
  const name = parseName(body.name);
  const phone = parsePhone(body.phone);
  const password = parsePassword(body.password);
  const db = c.env.DB;

  const exists = await db.prepare('SELECT 1 FROM users WHERE phone = ?1').bind(phone).first();
  if (exists) throw new ConflictError("Bu telefon raqami allaqachon ro'yxatdan o'tgan");

  const passwordHash = await hashPassword(password);
  const { token, tokenHash } = await newToken();
  let user;
  try {
    // Foydalanuvchi va sessiya bitta tranzaksiyada
    const [ins] = await db.batch([
      db
        .prepare('INSERT INTO users (phone, name, password_hash) VALUES (?1, ?2, ?3) RETURNING id, name, phone, created_at')
        .bind(phone, name, passwordHash),
      db
        .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at)
                  SELECT ?1, id, datetime('now', '+${SESSION_DAYS} days') FROM users WHERE phone = ?2`)
        .bind(tokenHash, phone),
    ]);
    user = ins.results[0];
  } catch (err) {
    // Parallel ro'yxatdan o'tishda UNIQUE buzilishi
    if (/UNIQUE/i.test(String(err?.message))) throw new ConflictError("Bu telefon raqami allaqachon ro'yxatdan o'tgan");
    throw err;
  }
  return c.json({ token, user: userDto(user) }, 201);
});

// POST /api/auth/login — {phone, password} → {token, user}
authRoutes.post('/auth/login', async (c) => {
  await limitAuth(c);
  const body = await readJson(c);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) throw new ValidationError('Parolni kiriting');
  const db = c.env.DB;

  // Noto'g'ri formatdagi telefon ham "noto'g'ri ma'lumot" (SPEC 5: 401), mavjud bo'lmagan raqam kabi
  let phone = null;
  try {
    phone = parsePhone(body.phone);
  } catch {
    phone = null;
  }
  // Bitta raqamga parol tanlash: IP almashtirilsa ham telefon bo'yicha limit ishlaydi
  if (phone) await limitLoginPhone(c, phone);

  const row = phone
    ? await db.prepare('SELECT id, name, phone, created_at, password_hash FROM users WHERE phone = ?1').bind(phone).first()
    : null;
  // Foydalanuvchi bo'lmasa ham PBKDF2 bajariladi (vaqt orqali raqam borligini bilib bo'lmasin)
  const ok = await verifyPassword(password.slice(0, PASSWORD_MAX + 1), row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok || password.length > PASSWORD_MAX) throw new AuthError("Telefon yoki parol noto'g'ri");

  const { token, tokenHash } = await newToken();
  await db.batch([purgeExpired(db), insertSession(db, tokenHash, row.id)]);
  return c.json({ token, user: userDto(row) });
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
    user: userDto(user),
    stats: { created: stats.created, joined: stats.joined, completed: stats.completed },
  });
});
