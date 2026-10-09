// Email bilan ro'yxat, kirish, parolni tiklash, emailni tasdiqlash (OTP) va "email majburiy" qoidasi testi.
// Server EMAIL_MOCK=1 bilan ishga tushgan bo'lishi shart (xat yuborilmaydi, kod javobda `dev_code`):
//   npx wrangler dev --port 8787 --var ADMIN_PHONES:+998900000099 --var GEO_MOCK:1 --var EMAIL_MOCK:1
//   && npm run test:api
// Oxirgi bo'lim email xizmati O'CHIQ serverni (EMAIL_MOCK ham, RESEND_API_KEY ham yo'q) o'zi ishga tushiradi
// (vaqtinchalik papkada, Durable Object rejimida) — yoki NOEMAIL_URL bilan tayyor server beriladi.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDeployConfig, readConfig } from '../scripts/wrangler-config.mjs';
import { emailEnabled, otpEmail, sendEmail } from '../worker/email.js';
import {
  BASE,
  api,
  asAdmin,
  hasharForm,
  PNG_AFTER,
  randomEmail,
  randomIp,
  randomPhone,
  register,
  registerLegacy,
  setFee,
  verifyEmail,
} from './helpers.mjs';

// v4: bu fayldagi hasharlar darhol e'lon qilinsin (narx 0 — bepul)
await setFee(0);

const CODE_WRONG = "Kod noto'g'ri";
const CODE_EXPIRED = "Kod eskirgan, yangisini so'rang";
const UNVERIFIED = { error: 'Avval emailingizni tasdiqlang', code: 'email_unverified' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (path, json, opts = {}) => api(path, { method: 'POST', json, ...opts });
const start = (body, opts) => post('/api/auth/register/start', body, opts);
const verify = (email, code, opts) => post('/api/auth/register/verify', { email, code }, opts);
/** Boshqa 6 xonali kod (to'g'risidan farqli). */
const wrongCode = (code) => String((Number(code) + 1) % 1e6).padStart(6, '0');
const newUserBody = (over = {}) => ({ name: 'Email Test', phone: randomPhone(), email: randomEmail('reg'), password: 'parol123', ...over });

test('GET /api/config → email_enabled: true (EMAIL_MOCK)', async () => {
  const r = await api('/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.data.email_enabled, true, 'server EMAIL_MOCK:1 bilan ishga tushirilsin');
  // v4 maydonlari (batafsil — tests/payments.suite.mjs)
  assert.deepEqual(Object.keys(r.data).sort(), ['email_enabled', 'hashar_fee', 'manual_payment_note', 'payments']);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test("eski POST /api/auth/register → 410 email_required (email yoqilgan)", async () => {
  const r = await post('/api/auth/register', { name: 'Eski APK', phone: randomPhone(), password: 'parol123' });
  assert.equal(r.status, 410);
  assert.deepEqual(r.data, { error: "Ilovani yangilang: ro'yxatdan o'tish endi email orqali", code: 'email_required' });
});

test('CORS: faqat GET, POST, DELETE (yangi marshrutlar ham)', async () => {
  const r = await api('/api/auth/register/start', {
    method: 'OPTIONS',
    headers: { origin: 'https://localhost', 'access-control-request-method': 'POST' },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
});

describe("Ro'yxat: register/start → register/verify", () => {
  test('start validatsiyasi → 400', async () => {
    const cases = [
      [{ email: undefined }, /Email/],
      [{ email: 'yomon-email' }, /Email/],
      [{ email: 'a@b' }, /Email/],
      [{ phone: '12345' }, /Telefon/],
      [{ password: '123' }, /Parol/],
      [{ name: 'A' }, /Ism/],
    ];
    for (const [over, re] of cases) {
      const r = await start(newUserBody(over));
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.match(r.data.error, re);
    }
    assert.equal((await post('/api/auth/register/start', [])).status, 400);
  });

  test("to'liq oqim: kod, noto'g'ri kod, to'g'ri kod → 201, qayta ishlatib bo'lmaydi", async () => {
    const body = newUserBody({ email: `  ${randomEmail('Full').toUpperCase()} ` });
    const email = body.email.trim().toLowerCase();
    const s = await start(body);
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(s.data.ok, true);
    assert.equal(s.data.email, email, 'email trim + kichik harf');
    assert.equal(s.data.expires_in, 600);
    assert.equal(s.data.resend_in, 60);
    assert.match(s.data.dev_code, /^\d{6}$/);

    const bad = await verify(email, wrongCode(s.data.dev_code));
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error, CODE_WRONG);
    const malformed = await verify(email, '12ab');
    assert.equal(malformed.status, 400);

    // Email katta harf bilan va kod bo'shliq bilan ham qabul qilinadi
    const code = s.data.dev_code;
    const ok = await verify(email.toUpperCase(), `${code.slice(0, 3)} ${code.slice(3)}`);
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.match(ok.data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(ok.data.user.email, email);
    assert.equal(ok.data.user.email_verified, true);
    assert.equal(ok.data.user.phone, body.phone);
    assert.equal(ok.data.user.name, 'Email Test');
    assert.equal(ok.data.user.password_hash, undefined);

    const me = await api('/api/me', { token: ok.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, email);
    assert.equal(me.data.user.email_verified, true);

    const again = await verify(email, code);
    assert.equal(again.status, 400);
    assert.equal(again.data.error, CODE_EXPIRED, 'ishlatilgan kod qayta ishlamaydi');
  });

  test('band telefon / band email (har xil harf bilan) → 409', async () => {
    const u = await register('Band Hisob');
    const phoneTaken = await start(newUserBody({ phone: u.phone }));
    assert.equal(phoneTaken.status, 409);
    assert.match(phoneTaken.data.error, /telefon/i);
    const emailTaken = await start(newUserBody({ email: u.email.toUpperCase() }));
    assert.equal(emailTaken.status, 409);
    assert.match(emailTaken.data.error, /email/i);
  });

  test("verify'da qayta tekshiriladi: kod kutilayotganda telefon band bo'lsa → 409", async () => {
    const phone = randomPhone();
    const a = await start(newUserBody({ phone }));
    const b = await start(newUserBody({ phone }));
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal((await verify(a.data.email, a.data.dev_code)).status, 201);
    const second = await verify(b.data.email, b.data.dev_code);
    assert.equal(second.status, 409);
    assert.match(second.data.error, /telefon/i);
  });

  test("qayta yuborish oralig'i: 60 soniya ichida → 429 Retry-After", async () => {
    const body = newUserBody();
    assert.equal((await start(body)).status, 200);
    const r = await start(body);
    assert.equal(r.status, 429);
    const wait = Number(r.headers.get('retry-after'));
    assert.ok(wait >= 1 && wait <= 60, `retry-after=${wait}`);
    assert.match(r.data.error, /soniyadan/);
  });

  test("yangi kod eskisini bekor qiladi", async () => {
    const body = newUserBody();
    const nocd = { headers: { 'x-test-otp-cooldown': '0' } };
    const first = await start(body, nocd);
    const second = await start(body, nocd);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    if (first.data.dev_code !== second.data.dev_code) {
      const old = await verify(body.email, first.data.dev_code);
      assert.equal(old.status, 400, 'eski kod ishlamaydi');
    }
    assert.equal((await verify(body.email, second.data.dev_code)).status, 201);
  });

  test("5 ta noto'g'ri urinishdan keyin kod o'ladi (to'g'risi ham ishlamaydi)", async () => {
    const body = newUserBody();
    const s = await start(body);
    const bad = wrongCode(s.data.dev_code);
    for (let i = 1; i <= 5; i++) {
      const r = await verify(body.email, bad);
      assert.equal(r.status, 400, `urinish ${i}`);
      assert.equal(r.data.error, CODE_WRONG, `urinish ${i}`);
    }
    const dead = await verify(body.email, s.data.dev_code);
    assert.equal(dead.status, 400);
    assert.equal(dead.data.error, CODE_EXPIRED);
  });

  test("muddati o'tgan kod → 400 (TTL test sarlavhasi bilan 1 soniya)", async () => {
    const body = newUserBody();
    const s = await start(body, { headers: { 'x-test-otp-ttl': '1' } });
    assert.equal(s.status, 200);
    assert.equal(s.data.expires_in, 1);
    await sleep(2200);
    const r = await verify(body.email, s.data.dev_code);
    assert.equal(r.status, 400);
    assert.equal(r.data.error, CODE_EXPIRED);
  });

  test("bitta emailga soatiga 5 ta kod, 6-si → 429", async () => {
    const body = newUserBody();
    const nocd = { headers: { 'x-test-otp-cooldown': '0' } };
    for (let i = 1; i <= 5; i++) assert.equal((await start(body, nocd)).status, 200, `kod ${i}`);
    const r = await start(body, nocd);
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
  });

  test('bitta IP dan soatiga 20 ta kod, 21-si → 429', async () => {
    const ip = randomIp();
    for (let i = 1; i <= 20; i++) assert.equal((await start(newUserBody(), { ip })).status, 200, `kod ${i}`);
    const r = await start(newUserBody(), { ip });
    assert.equal(r.status, 429);
    // Boshqa IP ga ta'sir qilmaydi
    assert.equal((await start(newUserBody())).status, 200);
  });
});

describe('Kirish: telefon yoki email', () => {
  let u;
  before(async () => {
    u = await register('Kirish Email');
  });

  test("{login: email} katta-kichik harfdan qat'i nazar → 200", async () => {
    const r = await post('/api/auth/login', { login: `  ${u.email.toUpperCase()} `, password: u.password });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.user.id, u.user.id);
    assert.equal(r.data.user.email, u.email);
    assert.equal(r.data.user.email_verified, true);
  });

  test('{login: telefon} va eski {phone} → 200', async () => {
    const a = await post('/api/auth/login', { login: u.phone, password: u.password });
    assert.equal(a.status, 200);
    const b = await post('/api/auth/login', { phone: u.phone, password: u.password });
    assert.equal(b.status, 200);
    assert.equal(b.data.user.email, u.email);
  });

  test("noto'g'ri parol / noma'lum email → 401", async () => {
    const a = await post('/api/auth/login', { login: u.email, password: 'xato-parol' });
    assert.equal(a.status, 401);
    assert.equal(a.data.error, "Email yoki parol noto'g'ri");
    const b = await post('/api/auth/login', { login: randomEmail('yoq'), password: u.password });
    assert.equal(b.status, 401);
    assert.equal(b.data.error, "Email yoki parol noto'g'ri");
    const c = await post('/api/auth/login', { login: 'yomon@', password: 'x' });
    assert.equal(c.status, 401);
  });

  test("email bo'yicha limit: IP almashsa ham 10 urinishdan keyin 429", async () => {
    const email = randomEmail('brute');
    for (let i = 0; i < 10; i++) assert.equal((await post('/api/auth/login', { login: email, password: 'x' })).status, 401);
    assert.equal((await post('/api/auth/login', { login: email, password: 'x' })).status, 429);
  });
});

describe('Parolni tiklash: forgot → reset', () => {
  test("forgot: hisob bor-yo'qligi aytilmaydi (bir xil javob)", async () => {
    const u = await register('Forgot Bor');
    const known = await post('/api/auth/forgot', { email: u.email.toUpperCase() });
    const unknown = await post('/api/auth/forgot', { email: randomEmail('yoq') });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    const shape = ({ dev_code, email, ...rest }) => rest;
    assert.deepEqual(shape(known.data), shape(unknown.data));
    assert.deepEqual(shape(unknown.data), { ok: true, expires_in: 600, resend_in: 60 });
    assert.equal(unknown.data.dev_code, undefined, "mavjud bo'lmagan emailga kod yaratilmaydi");
    assert.match(known.data.dev_code, /^\d{6}$/, 'EMAIL_MOCK: kod faqat haqiqiy hisob uchun');
    // Qayta yuborish oralig'i ham ikkalasida bir xil
    assert.equal((await post('/api/auth/forgot', { email: u.email })).status, 429);
    assert.equal((await post('/api/auth/forgot', { email: unknown.data.email })).status, 429);
    // Noto'g'ri format — 400 (hisob borligiga bog'liq emas)
    assert.equal((await post('/api/auth/forgot', { email: 'yomon' })).status, 400);
  });

  test("reset: kod bilan yangi parol, barcha eski sessiyalar va eski parol bekor", async () => {
    const u = await register('Reset Egasi');
    const otherSession = await post('/api/auth/login', { login: u.email, password: u.password });
    assert.equal(otherSession.status, 200);
    const f = await post('/api/auth/forgot', { email: u.email });
    const code = f.data.dev_code;

    const shortPw = await post('/api/auth/reset', { email: u.email, code, new_password: '123' });
    assert.equal(shortPw.status, 400);
    const bad = await post('/api/auth/reset', { email: u.email, code: wrongCode(code), new_password: 'yangi-parol' });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error, CODE_WRONG);

    const ok = await post('/api/auth/reset', { email: u.email, code, new_password: 'yangi-parol' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.user.id, u.user.id);
    assert.match(ok.data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await api('/api/me', { token: ok.data.token })).status, 200, 'yangi sessiya ishlaydi');
    assert.equal((await api('/api/me', { token: u.token })).status, 401, 'eski sessiya bekor');
    assert.equal((await api('/api/me', { token: otherSession.data.token })).status, 401, 'boshqa qurilma sessiyasi ham');
    assert.equal((await post('/api/auth/login', { login: u.email, password: u.password })).status, 401, 'eski parol ishlamaydi');
    assert.equal((await post('/api/auth/login', { login: u.phone, password: 'yangi-parol' })).status, 200);
    const reuse = await post('/api/auth/reset', { email: u.email, code, new_password: 'boshqa-parol' });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.data.error, CODE_EXPIRED);
  });

  test("reset: kod so'ralmagan email → 400", async () => {
    const r = await post('/api/auth/reset', { email: randomEmail('yoq'), code: '123456', new_password: 'yangi-parol' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, CODE_EXPIRED);
  });
});

describe('Emailsiz (eski) hisob: email majburiy qoidasi', () => {
  let owner; // tasdiqlangan foydalanuvchi va uning hashari
  let hashar;
  let legacy;

  before(async () => {
    owner = await register('Hashar Egasi');
    const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm() });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    hashar = r.data;
    legacy = await registerLegacy('Eski Hisob');
  });

  test('eski hisob kiradi, /api/me: email null, email_verified false', async () => {
    const login = await post('/api/auth/login', { phone: legacy.phone, password: legacy.password });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.email, null);
    assert.equal(login.data.user.email_verified, false);
    const me = await api('/api/me', { token: legacy.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email_verified, false);
    // Ko'rish va profil — ruxsat etilgan
    assert.equal((await api('/api/hashars', { token: legacy.token })).status, 200);
    assert.equal((await api(`/api/hashars/${hashar.id}`, { token: legacy.token })).status, 200);
    const fd = new FormData();
    fd.set('bio', 'Hali email yo\'q');
    assert.equal((await api('/api/me/profile', { method: 'POST', token: legacy.token, form: fd })).status, 200);
  });

  test("har bir yozuvchi amal → 403 email_unverified", async () => {
    const t = legacy.token;
    const afterForm = () => {
      const fd = new FormData();
      fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
      return fd;
    };
    const calls = [
      ['hashar yaratish', () => api('/api/hashars', { method: 'POST', token: t, form: hasharForm() })],
      ["qo'shilish", () => api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: t })],
      ['chiqish', () => api(`/api/hashars/${hashar.id}/join`, { method: 'DELETE', token: t })],
      ['yakunlash', () => api(`/api/hashars/${hashar.id}/complete`, { method: 'POST', token: t, form: afterForm() })],
      ['izoh', () => api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: t, json: { body: 'Salom' } })],
      ["o'chirish", () => api(`/api/hashars/${hashar.id}`, { method: 'DELETE', token: t })],
    ];
    for (const [label, call] of calls) {
      const r = await call();
      assert.equal(r.status, 403, `${label}: ${JSON.stringify(r.data)}`);
      assert.deepEqual(r.data, UNVERIFIED, label);
    }
    // Mehmon baribir 401
    assert.equal((await api('/api/hashars', { method: 'POST', form: hasharForm() })).status, 401);
  });

  test("eski v2 APK (client belgisiz) → 403 app_update_required, 'Ilovani yangilang'", async () => {
    const t = legacy.token;
    const calls = [
      ["qo'shilish", () => api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: t, oldClient: true })],
      ['hashar yaratish', () => api('/api/hashars', { method: 'POST', token: t, form: hasharForm(), oldClient: true })],
      ['izoh', () => api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: t, json: { body: 'Salom' }, oldClient: true })],
    ];
    for (const [label, call] of calls) {
      const r = await call();
      assert.equal(r.status, 403, `${label}: ${JSON.stringify(r.data)}`);
      assert.equal(r.data.code, 'app_update_required', label);
      assert.match(r.data.error, /^Ilovani yangilang/, label);
    }
    // Noma'lum / eski versiya belgisi ham eski mijoz
    const v2 = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: t, oldClient: true, headers: { 'x-client': 'hasharchilar/2' } });
    assert.equal(v2.data.code, 'app_update_required');
    // Ko'rish eski mijozga ham ochiq
    assert.equal((await api('/api/me', { token: t, oldClient: true })).status, 200);
    // Versiya belgisi query'da — APK uchun CORS preflight faqat Authorization so'raydi (eski worker ham ruxsat beradi)
    const pre = await api('/api/hashars/1/join?client=3', {
      method: 'OPTIONS',
      headers: { origin: 'https://localhost', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://localhost');
    // Noto'g'ri query → eski mijoz; X-Client sarlavhasi ham qabul qilinadi (moslik)
    const badQ = await api(`/api/hashars/${hashar.id}/join?client=abc`, { method: 'POST', token: t, oldClient: true });
    assert.equal(badQ.data.code, 'app_update_required');
    const hdr = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: t, oldClient: true, headers: { 'x-client': 'hasharchilar/3' } });
    assert.equal(hdr.data.code, 'email_unverified', JSON.stringify(hdr.data));
    const q3 = await api(`/api/hashars/${hashar.id}/join?client=3`, { method: 'POST', token: t, oldClient: true });
    assert.equal(q3.data.code, 'email_unverified', JSON.stringify(q3.data));
  });

  test("me/email: start/verify → endi hamma amal ishlaydi, email bilan kirish ham", async () => {
    const email = randomEmail('legacy');
    const s = await post('/api/me/email/start', { email: email.toUpperCase() }, { token: legacy.token });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(s.data.email, email);
    assert.equal(s.data.resend_in, 60);
    assert.match(s.data.dev_code, /^\d{6}$/);
    const bad = await post('/api/me/email/verify', { code: wrongCode(s.data.dev_code) }, { token: legacy.token });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error, CODE_WRONG);
    // Boshqa foydalanuvchi bu kodni ishlata olmaydi (kod hisobga bog'langan)
    const foreign = await post('/api/me/email/verify', { code: s.data.dev_code }, { token: owner.token });
    assert.equal(foreign.status, 400);
    const v = await post('/api/me/email/verify', { code: s.data.dev_code }, { token: legacy.token });
    assert.equal(v.status, 200, JSON.stringify(v.data));
    assert.equal(v.data.user.email, email);
    assert.equal(v.data.user.email_verified, true);
    assert.equal(v.data.user.id, legacy.user.id);

    const t = legacy.token;
    const join = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: t });
    assert.equal(join.status, 200, JSON.stringify(join.data));
    const comment = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: t, json: { body: 'Endi boraman' } });
    assert.equal(comment.status, 201);
    assert.equal((await api(`/api/hashars/${hashar.id}/join`, { method: 'DELETE', token: t })).status, 200);
    const mine = await api('/api/hashars', { method: 'POST', token: t, form: hasharForm() });
    assert.equal(mine.status, 201);
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    assert.equal((await api(`/api/hashars/${mine.data.id}/complete`, { method: 'POST', token: t, form: fd })).status, 200);
    const another = await api('/api/hashars', { method: 'POST', token: t, form: hasharForm() });
    assert.equal((await api(`/api/hashars/${another.data.id}`, { method: 'DELETE', token: t })).status, 200);

    const login = await post('/api/auth/login', { login: email, password: legacy.password });
    assert.equal(login.status, 200);
  });

  test('me/email/start: band email → 409, o\'zining tasdiqlangan emaili → 400, mehmon → 401', async () => {
    const other = await registerLegacy('Yana Eski');
    const taken = await post('/api/me/email/start', { email: owner.email }, { token: other.token });
    assert.equal(taken.status, 409);
    const same = await post('/api/me/email/start', { email: owner.email }, { token: owner.token });
    assert.equal(same.status, 400);
    assert.equal((await post('/api/me/email/start', { email: randomEmail() })).status, 401);
    assert.equal((await post('/api/me/email/verify', { code: '123456' })).status, 401);
    assert.equal((await post('/api/me/email/start', { email: 'yomon' }, { token: other.token })).status, 400);
    // Kod so'ralmagan — 400
    const none = await post('/api/me/email/verify', { code: '123456' }, { token: other.token });
    assert.equal(none.status, 400);
    assert.equal(none.data.error, CODE_EXPIRED);
  });

  test("me/email: tasdiqlangan email boshqasiga almashtiriladi, eski email bo'shaydi", async () => {
    const u = await register('Email Almashtiruvchi');
    const next = randomEmail('next');
    const user = await verifyEmail(u.token, next);
    assert.equal(user.email, next);
    assert.equal((await post('/api/auth/login', { login: next, password: u.password })).status, 200);
    assert.equal((await post('/api/auth/login', { login: u.email, password: u.password })).status, 401);
    // Eski email endi ro'yxat uchun bo'sh
    assert.equal((await start(newUserBody({ email: u.email }))).status, 200);
  });
});

describe('Admin: emaili tasdiqlanmagan administrator moderatsiya qila oladi', () => {
  let admin; // ADMIN_PHONES (tasdiqlangan)
  let mod; // eski hisob, admin qilingan, email tasdiqlanmagan

  before(async () => {
    admin = await asAdmin();
    mod = await registerLegacy('Moderator Eski');
    const r = await post(`/api/admin/users/${mod.user.id}/role`, { role: 'admin' }, { token: admin.token });
    assert.equal(r.status, 200, `server ADMIN_PHONES bilan ishga tushirilsin: ${JSON.stringify(r.data)}`);
  });

  test("admin marshrutlari ishlaydi, oddiy yozuvchi amallar esa 403", async () => {
    const me = await api('/api/me', { token: mod.token });
    assert.equal(me.data.user.is_admin, true);
    assert.equal(me.data.user.email_verified, false);
    assert.equal((await api('/api/admin/overview', { token: mod.token })).status, 200);

    const target = await register('Moderatsiya Nishoni');
    const list = await api(`/api/admin/users?q=${encodeURIComponent(target.email)}`, { token: mod.token });
    assert.equal(list.status, 200);
    assert.equal(list.data.items.length, 1, 'email bo\'yicha qidiruv');
    assert.equal(list.data.items[0].email, target.email);
    assert.equal(list.data.items[0].email_verified, true);

    const h = await api('/api/hashars', { method: 'POST', token: target.token, form: hasharForm() });
    const cm = await api(`/api/hashars/${h.data.id}/comments`, { method: 'POST', token: target.token, json: { body: 'Spam' } });
    assert.equal((await api(`/api/admin/comments/${cm.data.id}`, { method: 'DELETE', token: mod.token })).status, 200);
    assert.equal((await api(`/api/admin/users/${target.user.id}/block`, { method: 'POST', token: mod.token })).status, 200);
    assert.equal((await api(`/api/admin/users/${target.user.id}/unblock`, { method: 'POST', token: mod.token })).status, 200);
    assert.equal((await api(`/api/admin/hashars/${h.data.id}`, { method: 'DELETE', token: mod.token })).status, 200);

    const own = await api('/api/hashars', { method: 'POST', token: mod.token, form: hasharForm() });
    assert.equal(own.status, 403);
    assert.deepEqual(own.data, UNVERIFIED);
  });

  test("admin foydalanuvchini o'chirsa — email bo'shaydi, kutilayotgan kodlari ham o'chadi", async () => {
    const victim = await register("O'chiriladigan Email");
    const pending = await post('/api/me/email/start', { email: randomEmail('pending') }, { token: victim.token });
    assert.equal(pending.status, 200);
    assert.equal((await api(`/api/admin/users/${victim.user.id}`, { method: 'DELETE', token: admin.token })).status, 200);
    assert.equal((await post('/api/auth/login', { login: victim.email, password: victim.password })).status, 401);
    const again = await start(newUserBody({ email: victim.email, phone: victim.phone }));
    assert.equal(again.status, 200, JSON.stringify(again.data));
  });
});

test("email ommaviy javoblarda hech qachon ko'rinmaydi", async () => {
  const u = await register('Ommaviy Email');
  const h = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm() });
  assert.equal(h.status, 201);
  await api(`/api/hashars/${h.data.id}/comments`, { method: 'POST', token: u.token, json: { body: 'Salom hammaga' } });
  const viewer = await register('Kuzatuvchi');
  await api(`/api/hashars/${h.data.id}/join`, { method: 'POST', token: viewer.token });
  const responses = [
    h,
    await api(`/api/users/${u.user.id}`),
    await api(`/api/users/${u.user.id}`, { token: viewer.token }),
    await api(`/api/hashars/${h.data.id}`),
    await api(`/api/hashars/${h.data.id}`, { token: viewer.token }),
    await api(`/api/hashars/${h.data.id}/comments`, { token: viewer.token }),
    await api('/api/hashars'),
    await api('/api/leaderboard'),
    await api('/api/leaderboard?period=month'),
    await api('/api/stats'),
  ];
  for (const r of responses) {
    assert.equal(r.status < 300, true);
    const text = r.buf.toString('utf8');
    assert.ok(!text.includes(u.email), `email sizib chiqdi: ${text.slice(0, 200)}`);
    assert.ok(!text.includes(viewer.email));
    assert.ok(!/"email(_verified)?"\s*:/.test(text), `email maydoni: ${text.slice(0, 200)}`);
  }
});

// ---------- worker/email.js (Resend chaqiruvi — soxta fetch bilan, tarmoqsiz) ----------

describe('worker/email.js: Resend so\'rovi va shablon', () => {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  let calls;
  let logs;
  const useFetch = (impl) => {
    calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return impl(url, init);
    };
  };
  before(() => {
    logs = [];
    console.error = (...a) => logs.push(a.join(' '));
  });
  after(() => {
    globalThis.fetch = realFetch;
    console.error = realError;
  });

  test('emailEnabled: kalit yoki EMAIL_MOCK=1', () => {
    assert.equal(emailEnabled({}), false);
    assert.equal(emailEnabled({ EMAIL_MOCK: '0' }), false);
    assert.equal(emailEnabled({ EMAIL_MOCK: '1' }), true);
    assert.equal(emailEnabled({ RESEND_API_KEY: 're_x' }), true);
  });

  test("POST api.resend.com/emails: Bearer kalit, JSON {from, to[], subject, html, text}", async () => {
    useFetch(() => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    const msg = otpEmail('012345', 'register');
    const out = await sendEmail({ RESEND_API_KEY: 're_secret_test' }, { to: 'a@b.uz', ...msg });
    assert.deepEqual(out, { id: 'abc' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.authorization, 'Bearer re_secret_test');
    assert.ok(calls[0].init.signal, 'timeout signal');
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'text', 'to']);
    assert.equal(body.from, 'Hasharchilar <no-reply@nfcstore.uz>');
    assert.deepEqual(body.to, ['a@b.uz']);
    await sendEmail({ RESEND_API_KEY: 'k', RESEND_FROM: 'Hasharchilar <no-reply@hasharchilar.uz>' }, { to: 'a@b.uz', ...msg });
    assert.equal(JSON.parse(calls[1].init.body).from, 'Hasharchilar <no-reply@hasharchilar.uz>');
  });

  test("Resend xato bersa / tarmoq yo'q → 502, logda kalit yo'q", async () => {
    useFetch(() => new Response('{"message":"invalid"}', { status: 403 }));
    await assert.rejects(sendEmail({ RESEND_API_KEY: 're_secret_test' }, { to: 'a@b.uz', ...otpEmail('1', 'reset') }), (err) => {
      assert.equal(err.status, 502);
      assert.equal(err.message, "Email yuborilmadi, birozdan keyin qayta urinib ko'ring");
      return true;
    });
    useFetch(() => Promise.reject(new TypeError('fetch failed')));
    await assert.rejects(sendEmail({ RESEND_API_KEY: 're_secret_test' }, { to: 'a@b.uz', ...otpEmail('1', 'reset') }), { status: 502 });
    assert.ok(logs.some((l) => l.includes('403')), 'status loglanadi');
    assert.ok(!logs.some((l) => l.includes('re_secret_test') || l.includes('a@b.uz')), 'kalit / manzil loglanmaydi');
  });

  test("EMAIL_MOCK=1 — Resend chaqirilmaydi; kalitsiz — 503", async () => {
    useFetch(() => new Response('{}'));
    await sendEmail({ EMAIL_MOCK: '1', RESEND_API_KEY: 'k' }, { to: 'a@b.uz', ...otpEmail('1', 'verify') });
    assert.equal(calls.length, 0);
    await assert.rejects(sendEmail({}, { to: 'a@b.uz', ...otpEmail('1', 'verify') }), { status: 503 });
  });

  test("shablon: o'zbekcha, kod katta monospace, 10 daqiqa, e'tiborsiz qoldiring", () => {
    for (const purpose of ['register', 'reset', 'verify']) {
      const m = otpEmail('048213', purpose);
      assert.match(m.subject, /048213/);
      assert.match(m.html, /hasharchilar/);
      assert.match(m.html, /monospace[^"]*;font-size:34px/);
      assert.match(m.html, />048213</);
      for (const part of [m.html, m.text]) {
        assert.ok(part.includes('Kod 10 daqiqa amal qiladi'));
        assert.ok(part.includes("Agar bu siz bo'lmasangiz, xatni e'tiborsiz qoldiring"));
        assert.ok(part.includes('048213'));
      }
    }
    assert.match(otpEmail('1', 'reset').html, /Parolni tiklash/);
  });
});

// ---------- Email xizmati o'chiq server ----------

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Haqiqiy Worker (DO rejimi), EMAIL_MOCK va RESEND_API_KEY siz, vaqtinchalik papkada → { url, stop }. */
async function startNoEmailServer(dir) {
  const base = buildDeployConfig(readConfig(join(ROOT, 'wrangler.jsonc')), { storage: 'do' });
  if (!existsSync(join(ROOT, 'dist'))) mkdirSync(join(ROOT, 'dist'));
  const cfg = {
    ...base,
    name: 'hasharchilar-noemail-test',
    main: join(ROOT, base.main),
    assets: { ...base.assets, directory: join(ROOT, base.assets.directory) },
  };
  const cfgPath = join(dir, 'wrangler.json');
  writeFileSync(cfgPath, JSON.stringify(cfg));
  const [port, inspector] = [await freePort(), await freePort()];
  const args = [WRANGLER, 'dev', '--config', cfgPath, '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(inspector), '--persist-to', join(dir, 'state'), '--log-level', 'warn'];
  const child = spawn(process.execPath, args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '' },
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((r) => child.once('exit', r));
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // to'xtagan
    }
    await Promise.race([exited, sleep(5000)]);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // to'xtagan
    }
  };
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(`${url}/api/health`)).ok) return { url, stop };
    } catch {
      // hali tayyor emas
    }
    await sleep(500);
  }
  await stop();
  throw new Error(`wrangler dev (email o'chiq) ishga tushmadi:\n${log.slice(-3000)}`);
}

describe("Email xizmati o'chiq (RESEND_API_KEY yo'q, EMAIL_MOCK emas)", () => {
  let dir;
  let server;
  let url;
  // Token bilan — joriy mijoz kabi `?client=4`; `client: 0` — belgisiz eski v2 APK
  const call = async (path, { method = 'GET', token, json, form, client = 4 } = {}) => {
    const headers = { 'cf-connecting-ip': randomIp() };
    if (token) headers.authorization = `Bearer ${token}`;
    if (token && client) path += `${path.includes('?') ? '&' : '?'}client=${client}`;
    let body;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) body = form;
    const res = await fetch(url + path, { method, headers, body });
    return { status: res.status, data: await res.json().catch(() => null) };
  };

  before(async () => {
    if (process.env.NOEMAIL_URL) {
      url = process.env.NOEMAIL_URL.replace(/\/+$/, '');
      return;
    }
    dir = mkdtempSync(join(tmpdir(), 'hc-noemail-'));
    server = await startNoEmailServer(dir);
    url = server.url;
  });

  after(async () => {
    await server?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("config false; eski ro'yxat ishlaydi; email marshrutlari 503; yozuvchi amallar cheklanmaydi", async () => {
    assert.notEqual(url, BASE);
    const cfg = await call('/api/config');
    // v4: narx standart 5000 so'm; to'lov kalitlari yo'q — faqat qo'lda to'lov
    assert.deepEqual(cfg.data, {
      email_enabled: false,
      hashar_fee: 5000,
      payments: { payme: false, click: false, manual: true },
      manual_payment_note: '',
    });

    const phone = randomPhone();
    const reg = await call('/api/auth/register', { method: 'POST', json: { name: 'Emailsiz', phone, password: 'parol123' } });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    assert.equal(reg.data.user.email_verified, false);
    assert.equal(reg.data.user.email, null);

    const disabled = { error: 'Email xizmati sozlanmagan' };
    for (const [path, json, token] of [
      ['/api/auth/register/start', { name: 'X Y', phone: randomPhone(), email: randomEmail(), password: 'parol123' }],
      ['/api/auth/register/verify', { email: randomEmail(), code: '123456' }],
      ['/api/auth/forgot', { email: randomEmail() }],
      ['/api/auth/reset', { email: randomEmail(), code: '123456', new_password: 'parol123' }],
      ['/api/me/email/start', { email: randomEmail() }, reg.data.token],
      ['/api/me/email/verify', { code: '123456' }, reg.data.token],
    ]) {
      const r = await call(path, { method: 'POST', json, token });
      assert.equal(r.status, 503, path);
      assert.deepEqual(r.data, disabled, path);
    }

    // Regressiya: email o'chiq bo'lsa ham eski v2 (belgisiz) / v3 APK narx > 0 da hashar yarata olmaydi — to'lov
    // sahifasi yo'q, yashirin to'lanmagan hasharni "e'lon qilindi" deb ko'rsatardi
    for (const client of [0, 3]) {
      const old = await call('/api/hashars', { method: 'POST', token: reg.data.token, form: hasharForm(), client });
      assert.equal(old.status, 403, `client=${client}: ${JSON.stringify(old.data)}`);
      assert.equal(old.data.code, 'app_update_required');
    }
    // Email tasdiqlanmagan bo'lsa ham hashar yaratish va izoh yozish mumkin (qoida faqat email yoqilganda)
    const h = await call('/api/hashars', { method: 'POST', token: reg.data.token, form: hasharForm() });
    assert.equal(h.status, 201, JSON.stringify(h.data));
    // v4: standart narx — hashar to'languncha e'lon qilinmaydi; provayderlar sozlanmagan → havolalar yo'q
    assert.equal(h.data.payment_status, 'unpaid');
    assert.deepEqual(h.data.payment, { amount: 5000 });
    assert.equal((await call(`/api/hashars/${h.data.id}`)).status, 404, "to'lanmagan hashar mehmonga ko'rinmaydi");
    // Kalitsiz Payme / Click callback'lari hech narsa qilmaydi
    const pm = await fetch(`${url}/api/payments/payme`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from('Paycom:').toString('base64')}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'CheckPerformTransaction', params: { amount: 500000, account: { hashar_id: String(h.data.id) } } }),
    });
    assert.equal((await pm.json()).error.code, -32504);
    const ck = await fetch(`${url}/api/payments/click/prepare`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ click_trans_id: '1', service_id: '1', merchant_trans_id: String(h.data.id), amount: '5000', action: '0', sign_time: 'x', sign_string: 'x' }),
    });
    assert.equal((await ck.json()).error, -8);
    const cm = await call(`/api/hashars/${h.data.id}/comments`, { method: 'POST', token: reg.data.token, json: { body: 'Salom' } });
    assert.equal(cm.status, 201);
    const login = await call('/api/auth/login', { method: 'POST', json: { login: phone, password: 'parol123' } });
    assert.equal(login.status, 200);
  });
});
