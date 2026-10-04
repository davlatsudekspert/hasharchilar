// API testlari uchun umumiy yordamchilar (tests/api.test.mjs, tests/admin.test.mjs, tests/email.test.mjs).
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

export const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
export const RUN = Math.random().toString(36).slice(2, 8); // shu yugurish uchun noyob belgi

// ---------- Yordamchilar ----------

export const rnd = (n) => Math.floor(Math.random() * n);
export const randomPhone = () => `+99890${String(rnd(1e7)).padStart(7, '0')}`;
export const randomIp = () => `10.${rnd(250) + 1}.${rnd(250) + 1}.${rnd(250) + 1}`;
/** Noyob soxta email (server EMAIL_MOCK=1 bilan — xat yuborilmaydi). */
export const randomEmail = (tag = 't') => `${tag}.${RUN}.${Date.now().toString(36)}${rnd(1e6).toString(36)}@example.com`;

/** Tashkent vaqti (UTC+5) bo'yicha `days` kun keyingi 'YYYY-MM-DDTHH:MM'. */
export function tashkentDate(days) {
  return new Date(Date.now() + 5 * 3600e3 + days * 86400e3).toISOString().slice(0, 16);
}

/** Haqiqiy PNG (w×h, bir rang) — zlib + CRC32 bilan yasaladi. */
export function makePng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const PNG_BEFORE = makePng(4, 3, [120, 113, 108]);
export const PNG_AFTER = makePng(4, 3, [5, 150, 105]);

/** fetch o'rami: JSON/FormData, token va IP. */
export async function api(path, { method = 'GET', token, ip, json, form, headers = {}, oldClient = false } = {}) {
  const h = { 'cf-connecting-ip': ip || randomIp(), ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  // v3 mijoz (src/lib/api.js) kabi `?client=3`; oldClient — belgisiz eski v2 APK
  if (token && !oldClient) path += `${path.includes('?') ? '&' : '?'}client=3`;
  let body;
  if (json !== undefined) {
    h['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetch(BASE + path, { method, headers: h, body });
  const buf = Buffer.from(await res.arrayBuffer());
  let data = null;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data, buf };
}

/**
 * Email orqali ro'yxat (register/start → dev_code → register/verify). Server EMAIL_MOCK=1 bilan ishga tushgan
 * bo'lishi shart (dev_code faqat shunda qaytadi). Natija: { token, user, phone, email, password }.
 */
export async function register(name = 'Test Foydalanuvchi', { phone = randomPhone(), email = randomEmail(), password = 'parol123' } = {}) {
  const start = await api('/api/auth/register/start', { method: 'POST', json: { name, phone, email, password } });
  assert.equal(
    start.status,
    200,
    `register/start: ${JSON.stringify(start.data)} — server EMAIL_MOCK siz? (wrangler dev ... --var EMAIL_MOCK:1)`,
  );
  assert.match(String(start.data.dev_code), /^\d{6}$/, 'dev_code yo\'q — server EMAIL_MOCK:1 bilan ishga tushirilsin');
  const r = await api('/api/auth/register/verify', { method: 'POST', json: { email, code: start.data.dev_code } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { token: r.data.token, user: r.data.user, phone, email: start.data.email, password };
}

/**
 * Emailsiz "eski" hisob (email joriy qilinishidan oldingi foydalanuvchilar kabi, email tasdiqlanmagan).
 * Faqat EMAIL_MOCK=1 serverda: test sarlavhasi `x-test-legacy-register` 410 ni chetlab o'tadi.
 */
export async function registerLegacy(name = 'Eski Foydalanuvchi', { phone = randomPhone(), password = 'parol123' } = {}) {
  const r = await api('/api/auth/register', {
    method: 'POST',
    json: { name, phone, password },
    headers: { 'x-test-legacy-register': '1' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.email_verified, false);
  return { token: r.data.token, user: r.data.user, phone, password };
}

/** Tizimga kirgan foydalanuvchi emailini tasdiqlaydi (me/email/start → dev_code → verify) → user. */
export async function verifyEmail(token, email = randomEmail('v')) {
  const s = await api('/api/me/email/start', { method: 'POST', token, json: { email } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const v = await api('/api/me/email/verify', { method: 'POST', token, json: { code: s.data.dev_code } });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.equal(v.data.user.email_verified, true);
  return v.data.user;
}

/** Hashar yaratish formasi (o'zgartirishlar bilan). */
export function hasharForm(over = {}, photo = { bytes: PNG_BEFORE, type: 'image/png', name: 'oldin.png' }) {
  const fields = {
    title: `Test hashar ${RUN}`,
    description: `Avtomatik test ${RUN} uchun tavsif`,
    address: 'Toshkent, Chilonzor',
    lat: '41.2995',
    lng: '69.2401',
    date_time: tashkentDate(30),
    items: JSON.stringify(["Qo'lqop", 'Belkurak']),
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  if (photo) fd.append('photo', new Blob([photo.bytes], { type: photo.type }), photo.name);
  return fd;
}

// ---------- Admin (server ADMIN_PHONES bilan ishga tushgan bo'lishi shart) ----------

export const ADMIN_PHONE = process.env.ADMIN_PHONE || '+998900000099';
export const ADMIN_PASSWORD = 'admin-test-123';

/**
 * ADMIN_PHONES dagi raqam bilan ro'yxat (email orqali) yoki kirish → { token, user }.
 * Hisob bor-u, email tasdiqlanmagan bo'lsa (eski baza) — email shu yerda tasdiqlanadi.
 */
export async function adminLogin() {
  const start = await api('/api/auth/register/start', {
    method: 'POST',
    json: { name: 'Test Admin', phone: ADMIN_PHONE, email: randomEmail('admin'), password: ADMIN_PASSWORD },
  });
  if (start.status === 200) {
    const reg = await api('/api/auth/register/verify', { method: 'POST', json: { email: start.data.email, code: start.data.dev_code } });
    if (reg.status === 201) return reg.data;
    // Parallel test fayli shu raqamni bir lahza oldin ro'yxatdan o'tkazgan — kiramiz
    assert.equal(reg.status, 409, JSON.stringify(reg.data));
  } else {
    assert.equal(start.status, 409, JSON.stringify(start.data));
  }
  const r = await api('/api/auth/login', { method: 'POST', json: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  assert.equal(r.status, 200, `admin test hisobiga kirib bo'lmadi: ${JSON.stringify(r.data)}`);
  if (!r.data.user.email_verified) r.data.user = await verifyEmail(r.data.token, randomEmail('admin'));
  return r.data;
}
