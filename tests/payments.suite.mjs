// v4: hashar e'lon qilish to'lovi — narx (admin sozlamasi), to'lanmagan hasharning ko'rinishi, Payme Merchant API
// (JSON-RPC), Click Shop API (prepare/complete, md5 imzo), qo'lda tasdiqlash (admin), narx 0 (bepul).
// tests/api.test.mjs oxirida ulanadi (npm run test:api). Server soxta kalitlar bilan ishga tushgan bo'lishi kerak
// (tests/helpers.mjs → PAY_TEST, README → Testlar); bo'lmasa Payme/Click bo'limlari o'tkaziladi
// (REQUIRE_PAYMENTS=1 — CI — bo'lsa xato).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BASE,
  PAY_TEST,
  RUN,
  PNG_AFTER,
  api,
  asAdmin,
  hasharForm,
  notifications,
  register,
  rnd,
  setFee,
} from './helpers.mjs';

const FEE = 5000;
const TIYIN = FEE * 100;
const NOTE = `Karta: 0000 0000 0000 0000 (test ${RUN}), izohda hashar raqamini yozing`;
const H12 = 12 * 3600e3;

const CONFIG = (await api('/api/config')).data;
const REQUIRE = process.env.REQUIRE_PAYMENTS === '1';
const NO_PAYME = CONFIG?.payments?.payme ? false : 'server Payme soxta kalitlarisiz ishga tushgan (README → Testlar)';
const NO_CLICK = CONFIG?.payments?.click ? false : 'server Click soxta kalitlarisiz ishga tushgan (README → Testlar)';

/** Hashar yaratish (rasmsiz) → 201 javob. */
async function createHashar(owner, over = {}) {
  const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `To'lov ${RUN} ${rnd(1e6)}`, ...over }, null) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

const get = (path, token) => api(path, { token });

/** Hashar ommaga (mehmonga) ko'rinadimi: tafsilot, ro'yxat, qidiruv. */
async function publicVisible(h) {
  const d = await get(`/api/hashars/${h.id}`);
  const list = await get(`/api/hashars?q=${encodeURIComponent(h.title)}`);
  assert.equal(list.status, 200);
  const inList = list.data.some((x) => x.id === h.id);
  assert.equal(d.status === 200, inList, `tafsilot (${d.status}) va ro'yxat (${inList}) bir xil bo'lsin`);
  return inList;
}

// ---------- Payme yordamchilari ----------

let rpcSeq = 0;
const basic = (login, key) => `Basic ${Buffer.from(`${login}:${key}`).toString('base64')}`;

/** JSON-RPC so'rov: { status, data, id }. */
async function payme(method, params, { key = PAY_TEST.paymeKey, login = 'Paycom', auth, now, raw, httpMethod = 'POST' } = {}) {
  const id = ++rpcSeq;
  const headers = { 'content-type': 'application/json' };
  const a = auth !== undefined ? auth : basic(login, key);
  if (a) headers.authorization = a;
  if (now) headers['x-test-now'] = String(now);
  const body = httpMethod === 'GET' ? undefined : raw ?? JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const r = await api('/api/payments/payme', { method: httpMethod, headers, form: body });
  assert.equal(r.status, 200, `Payme javobi HTTP 200 bo'lsin: ${r.status}`);
  assert.equal(r.data.jsonrpc, '2.0');
  return { ...r, id };
}

/** Muvaffaqiyatli natija. */
function ok(r) {
  assert.ok(r.data.result, JSON.stringify(r.data));
  assert.equal(r.data.error, undefined);
  assert.equal(r.data.id, r.id);
  return r.data.result;
}

/** Xato kodi va uch tildagi matn. */
function rpcError(r, code, data) {
  assert.ok(r.data.error, `xato kutilgan (${code}): ${JSON.stringify(r.data)}`);
  assert.equal(r.data.error.code, code, JSON.stringify(r.data));
  for (const l of ['uz', 'ru', 'en']) assert.ok(typeof r.data.error.message[l] === 'string' && r.data.error.message[l], l);
  if (data !== undefined) assert.equal(r.data.error.data, data);
  assert.equal(r.data.result, undefined);
}

const ptx = () => `pm${RUN}${Date.now().toString(36)}${rnd(1e9).toString(36)}`.slice(0, 40);
const acc = (h) => ({ hashar_id: String(h.id) });

// ---------- Click yordamchilari ----------

const md5 = (s) => createHash('md5').update(s).digest('hex');
let clickSeq = 0;
const ctid = () => String(Date.now() * 10 + (++clickSeq % 10)).slice(-12);

/** Imzolangan Click so'rov tanasi. action 0 — prepare, 1 — complete. */
function clickBody(action, { hasharId, transId = ctid(), amount = String(FEE), prepareId, error = '0', over = {}, secret = PAY_TEST.clickSecret, service = PAY_TEST.clickService } = {}) {
  const b = {
    click_trans_id: transId,
    service_id: service,
    click_paydoc_id: String(rnd(1e9)),
    merchant_trans_id: String(hasharId),
    amount,
    action: String(action),
    error,
    error_note: error === '0' ? 'Success' : 'Error',
    sign_time: '2026-10-09 12:00:00',
    ...(action === 1 ? { merchant_prepare_id: String(prepareId) } : {}),
    ...over,
  };
  const src = b.click_trans_id + b.service_id + secret + b.merchant_trans_id + (action === 1 ? b.merchant_prepare_id : '') + b.amount + b.action + b.sign_time;
  b.sign_string = over.sign_string ?? md5(src);
  return b;
}

async function click(kind, body) {
  const r = await api(`/api/payments/click/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    form: new URLSearchParams(body).toString(),
  });
  assert.equal(r.status, 200);
  return r.data;
}


/** Content-Length siz (chunked) so'rov: tana oqim sifatida bo'laklab yuboriladi. */
async function chunked(path, text, headers = {}) {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream({
    start(ctrl) {
      for (let i = 0; i < bytes.length; i += 16 * 1024) ctrl.enqueue(bytes.slice(i, i + 16 * 1024));
      ctrl.close();
    },
  });
  const res = await fetch(BASE + path, { method: 'POST', headers, body, duplex: 'half' });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ======================================================================

describe("v4: hashar narxi, sozlamalar va to'lanmagan hasharning ko'rinishi", () => {
  let admin;
  let owner;
  let other;
  let h; // to'lanmagan

  before(async () => {
    admin = await asAdmin();
    await setFee(FEE, { manual_payment_note: NOTE });
    owner = await register(`To'lovchi ${RUN}`);
    other = await register(`Begona ${RUN}`);
  });

  test('REQUIRE_PAYMENTS=1 bo\'lsa Payme va Click sozlangan', () => {
    if (REQUIRE) assert.deepEqual(CONFIG.payments, { payme: true, click: true, manual: true }, 'server soxta to\'lov kalitlarisiz');
  });

  test('GET /api/config: narx, provayderlar, qo\'lda to\'lov izohi', async () => {
    const r = await get('/api/config');
    assert.equal(r.status, 200);
    assert.equal(r.data.hashar_fee, FEE);
    assert.equal(r.data.manual_payment_note, NOTE);
    assert.equal(r.data.payment_telegram, 'developer_alii'); // standart
    assert.deepEqual(Object.keys(r.data.payments).sort(), ['click', 'manual', 'payme']);
    assert.equal(r.data.payments.manual, true);
    for (const k of ['payme', 'click']) assert.equal(typeof r.data.payments[k], 'boolean');
  });

  test('admin sozlamalari: ruxsat, validatsiya, shakl (ichki kalit sizmaydi)', async () => {
    for (const method of ['GET', 'POST']) {
      assert.equal((await api('/api/admin/settings', { method, json: method === 'POST' ? { hashar_fee: 1 } : undefined })).status, 401);
      assert.equal((await api('/api/admin/settings', { method, token: other.token, json: method === 'POST' ? { hashar_fee: 1 } : undefined })).status, 403);
    }
    const g = await api('/api/admin/settings', { token: admin.token });
    assert.equal(g.status, 200);
    assert.deepEqual(Object.keys(g.data).sort(), ['hashar_fee', 'manual_payment_note', 'payme_test_mode', 'payment_telegram', 'payments']);
    assert.equal(g.data.hashar_fee, FEE);
    assert.equal(g.data.manual_payment_note, NOTE);
    assert.ok(!/checkin_secret|secret/i.test(JSON.stringify(g.data)));
    for (const bad of [{}, { hashar_fee: -1 }, { hashar_fee: 1.5 }, { hashar_fee: 'abc' }, { hashar_fee: 10_000_001 }, { hashar_fee: null },
      { manual_payment_note: 'x'.repeat(501) }, { manual_payment_note: 5 },
      { payment_telegram: 'ab' }, { payment_telegram: 'bad name' }, { payment_telegram: '1abcdef' }, { payment_telegram: 5 }]) {
      const r = await api('/api/admin/settings', { method: 'POST', token: admin.token, json: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(typeof r.data.error, 'string');
    }
    // Satr ko'rinishidagi son ham qabul qilinadi; izoh tozalanadi
    const s = await api('/api/admin/settings', { method: 'POST', token: admin.token, json: { hashar_fee: '7000', manual_payment_note: `  ${'й'.repeat(500)}  ` } });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(s.data.hashar_fee, 7000);
    assert.equal(s.data.manual_payment_note, 'й'.repeat(500));
    assert.equal((await get('/api/config')).data.hashar_fee, 7000);
    // Telegram: @ va t.me/ havolasi tozalanadi; bo'sh — o'chiq
    for (const [inp, out] of [['@Some_Admin1', 'Some_Admin1'], ['https://t.me/other_admin', 'other_admin'], ['', '']]) {
      const t = await api('/api/admin/settings', { method: 'POST', token: admin.token, json: { payment_telegram: inp } });
      assert.equal(t.status, 200, JSON.stringify(t.data));
      assert.equal(t.data.payment_telegram, out);
      assert.equal((await get('/api/config')).data.payment_telegram, out);
    }
    await api('/api/admin/settings', { method: 'POST', token: admin.token, json: { payment_telegram: 'developer_alii' } });
    await setFee(FEE, { manual_payment_note: NOTE });
  });

  test("yaratish: 201 + payment_status 'unpaid' + to'lov havolalari", async () => {
    h = await createHashar(owner);
    assert.equal(h.payment_status, 'unpaid');
    assert.equal(h.is_owner, true);
    assert.equal(h.payment.amount, FEE);
    assert.equal(h.payment.manual_note, NOTE);
    assert.equal(h.payment.telegram, 'developer_alii');
    const back = `${BASE}/#/hashar/${h.id}?tolov=1`;
    if (!NO_PAYME) {
      const m = /^https:\/\/(checkout|test)\.paycom\.uz\/([A-Za-z0-9+/=]+)$/.exec(h.payment.payme_url);
      assert.ok(m, h.payment.payme_url);
      assert.equal(Buffer.from(m[2], 'base64').toString('utf8'), `m=${PAY_TEST.paymeMerchant};ac.hashar_id=${h.id};a=${TIYIN};c=${back}`);
    } else assert.equal(h.payment.payme_url, undefined);
    if (!NO_CLICK) {
      const u = new URL(h.payment.click_url);
      assert.equal(u.origin + u.pathname, 'https://my.click.uz/services/pay');
      assert.deepEqual(Object.fromEntries(u.searchParams), {
        service_id: PAY_TEST.clickService,
        merchant_id: PAY_TEST.clickMerchant,
        amount: String(FEE),
        transaction_param: String(h.id),
        return_url: back,
      });
    } else assert.equal(h.payment.click_url, undefined);
    // Sayt (Origin) qaytish manzili: so'rov kelgan host — o'zi
    const viaSite = await api('/api/hashars', { method: 'POST', token: owner.token, headers: { origin: BASE }, form: hasharForm({}, null) });
    assert.equal(viaSite.status, 201);
    if (!NO_CLICK) assert.equal(new URL(viaSite.data.payment.click_url).searchParams.get('return_url'), `${BASE}/#/hashar/${viaSite.data.id}?tolov=1`);
    // APK (https://localhost) — tashqi brauzer saytga qaytadi, localhost'ga emas
    const viaApk = await api(`/api/hashars/${viaSite.data.id}/payment`, { token: owner.token, headers: { origin: 'https://localhost' } });
    if (!NO_CLICK) assert.ok(!new URL(viaApk.data.click_url).searchParams.get('return_url').startsWith('https://localhost'));
    assert.equal((await api(`/api/hashars/${viaSite.data.id}`, { method: 'DELETE', token: owner.token })).status, 200);
  });

  test("ko'rinish: mehmon va begonaga 404, egasi va adminga 200 (payment_status bilan)", async () => {
    assert.equal((await get(`/api/hashars/${h.id}`)).status, 404);
    const o = await get(`/api/hashars/${h.id}`, other.token);
    assert.equal(o.status, 404);
    assert.equal(o.data.error, 'Hashar topilmadi');
    const mine = await get(`/api/hashars/${h.id}`, owner.token);
    assert.equal(mine.status, 200);
    assert.equal(mine.data.payment_status, 'unpaid');
    const adm = await get(`/api/hashars/${h.id}`, admin.token);
    assert.equal(adm.status, 200);
    assert.equal(adm.data.payment_status, 'unpaid');
    assert.equal(await publicVisible(h), false);
  });

  test("ro'yxat / qidiruv / near / profil / izohlar: faqat egasiga", async () => {
    const q = `?q=${encodeURIComponent(h.title)}`;
    assert.ok(!(await get(`/api/hashars${q}`, other.token)).data.some((x) => x.id === h.id));
    assert.ok((await get(`/api/hashars${q}`, owner.token)).data.some((x) => x.id === h.id));
    assert.ok((await get('/api/hashars?mine=created', owner.token)).data.some((x) => x.id === h.id && x.payment_status === 'unpaid'));
    const near = `/api/hashars?near=${h.lat},${h.lng}&radius_km=1`;
    assert.ok(!(await get(near, other.token)).data.some((x) => x.id === h.id));
    assert.ok((await get(near, owner.token)).data.some((x) => x.id === h.id));
    const prof = await get(`/api/users/${owner.user.id}`, other.token);
    assert.ok(!prof.data.hashars.some((x) => x.id === h.id));
    assert.equal(prof.data.stats.created, 0, "to'lanmagan hashar statistikada yo'q");
    const self = await get(`/api/users/${owner.user.id}`, owner.token);
    assert.ok(self.data.hashars.some((x) => x.id === h.id));
    // Izohlar, qo'shilish, saqlash, yakunlash
    assert.equal((await get(`/api/hashars/${h.id}/comments`, other.token)).status, 404);
    assert.equal((await get(`/api/hashars/${h.id}/comments`, owner.token)).status, 200);
    assert.equal((await api(`/api/hashars/${h.id}/comments`, { method: 'POST', token: other.token, json: { body: 'Salom' } })).status, 404);
    assert.equal((await api(`/api/hashars/${h.id}/join`, { method: 'POST', token: other.token })).status, 404);
    assert.equal((await api(`/api/hashars/${h.id}/join`, { method: 'DELETE', token: other.token })).status, 404);
    assert.equal((await api(`/api/hashars/${h.id}/save`, { method: 'POST', token: other.token })).status, 404);
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    const done = await api(`/api/hashars/${h.id}/complete`, { method: 'POST', token: owner.token, form: fd });
    assert.equal(done.status, 409);
    assert.equal(done.data.code, 'payment_required');
  });

  test("statistika va reyting to'lanmagan hasharni hisoblamaydi", async () => {
    const before = (await get('/api/stats')).data;
    const extra = await createHashar(owner);
    const after = (await get('/api/stats')).data;
    assert.equal(after.hashars, before.hashars);
    assert.equal(after.upcoming, before.upcoming);
    const lb = await get('/api/leaderboard?period=month');
    assert.ok(!lb.data.some((e) => e.user.id === owner.user.id), "faqat to'lanmagan hasharlar — reytingda yo'q");
    assert.equal((await api(`/api/hashars/${extra.id}`, { method: 'DELETE', token: owner.token })).status, 200);
  });

  test("GET /api/hashars/:id/payment: egasi/admin; boshqalarga 404, mehmonga 401", async () => {
    assert.equal((await get(`/api/hashars/${h.id}/payment`)).status, 401);
    assert.equal((await get(`/api/hashars/${h.id}/payment`, other.token)).status, 404);
    assert.equal((await get('/api/hashars/999999999/payment', owner.token)).status, 404);
    for (const t of [owner.token, admin.token]) {
      const r = await get(`/api/hashars/${h.id}/payment`, t);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.hashar_id, h.id);
      assert.equal(r.data.status, 'unpaid');
      assert.equal(r.data.amount, FEE);
      assert.equal(r.data.currency, 'UZS');
      assert.equal(r.data.manual_note, NOTE);
      assert.equal(r.data.telegram, 'developer_alii');
      assert.deepEqual(r.data.providers, CONFIG.payments);
      assert.equal(r.data.payme_url, h.payment.payme_url);
      assert.equal(r.data.click_url, h.payment.click_url);
      assert.deepEqual(r.data.history, []);
    }
  });

  test("begona hech qachon payment_status ko'rmaydi (e'lon qilingan hasharda ham)", async () => {
    const list = await get('/api/hashars', other.token);
    for (const x of list.data) if (!x.is_owner) assert.equal(x.payment_status, undefined);
  });

  test("bir vaqtda ko'pi bilan 5 ta to'lanmagan hashar (409 unpaid_limit)", async () => {
    const u = await register(`Limit ${RUN}`);
    const made = [];
    for (let i = 0; i < 5; i++) made.push(await createHashar(u));
    const sixth = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm({}, null) });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.data.code, 'unpaid_limit');
    // Bittasi o'chirilsa — yana mumkin
    assert.equal((await api(`/api/hashars/${made[0].id}`, { method: 'DELETE', token: u.token })).status, 200);
    await createHashar(u);
  });

  // Regressiya: o'rnatilgan v3 APK `?client=3` yuboradi va unda to'lov sahifasi yo'q — u to'lanmagan (hech kimga
  // ko'rinmaydigan) hasharni "e'lon qilindi" deb ko'rsatardi. Narx > 0 da unga yaratish berilmaydi.
  test("eski v3 / v2 APK: narx > 0 da yaratish → 403 app_update_required, hech narsa yozilmaydi; v4 → 201", async () => {
    const u = await register(`Eski APK ${RUN}`);
    const mine = async () => (await get(`/api/users/${u.user.id}`, u.token)).data.hashars.map((x) => x.id);
    const olds = [
      ['v3 (?client=3)', { client: 3 }],
      ['v3 (X-Client: hasharchilar/3)', { oldClient: true, headers: { 'x-client': 'hasharchilar/3' } }],
      ['v2 (belgisiz)', { oldClient: true }],
    ];
    for (const [label, opts] of olds) {
      const r = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm({}, null), ...opts });
      assert.equal(r.status, 403, `${label}: ${JSON.stringify(r.data)}`);
      assert.equal(r.data.code, 'app_update_required', label);
      assert.equal(r.data.error, "Ilovani yangilang: hashar e'lon qilish endi to'lov orqali", label);
    }
    // Rasm bilan ham — saqlanmasdan oldin rad etiladi
    assert.equal((await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm(), client: 3 })).status, 403);
    assert.deepEqual(await mine(), [], 'eski mijoz hech qanday hashar yaratmadi');
    // Joriy mijoz (v4) — 201 'unpaid' + to'lov ma'lumoti
    const r4 = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm({}, null), client: 4 });
    assert.equal(r4.status, 201, JSON.stringify(r4.data));
    assert.equal(r4.data.payment_status, 'unpaid');
    assert.equal(r4.data.payment.amount, FEE);
    assert.deepEqual(await mine(), [r4.data.id]);
    // Eski mijozga boshqa amallar ochiq (ko'rish)
    assert.equal((await api(`/api/hashars/${r4.data.id}`, { token: u.token, client: 3 })).status, 200);
    assert.equal((await api(`/api/hashars/${r4.data.id}`, { method: 'DELETE', token: u.token, client: 3 })).status, 200);
  });
});

// ======================================================================

describe('v4: Payme Merchant API (JSON-RPC)', { skip: NO_PAYME }, () => {
  let other;
  const started = Date.now() - 1000;
  // Har bir test o'z egasi bilan (hashar yaratish limiti 10 / soat, to'lanmaganlar ≤ 5)
  const newOwner = () => register(`Payme ${RUN} ${rnd(1e6)}`);

  before(async () => {
    await setFee(FEE);
    other = await register(`Payme kuzatuvchi ${RUN}`);
  });

  test('avtorizatsiya: kalitsiz / noto\'g\'ri kalit / login / sxema → -32504', async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    const params = { amount: TIYIN, account: acc(h) };
    for (const opts of [
      { auth: null },
      { key: 'notogri-kalit' },
      { key: `${PAY_TEST.paymeKey}x` },
      { key: PAY_TEST.paymeKey.slice(0, -1) },
      { login: 'Payme' },
      { auth: `Bearer ${Buffer.from(`Paycom:${PAY_TEST.paymeKey}`).toString('base64')}` },
      { auth: 'Basic !!!yaroqsiz!!!' },
      { auth: `Basic ${Buffer.from(`Paycom${PAY_TEST.paymeKey}`).toString('base64')}` },
    ]) {
      const r = await payme('CheckPerformTransaction', params, opts);
      rpcError(r, -32504);
      assert.equal(r.data.id, r.id, 'id qaytariladi');
    }
    // Kalitsiz so'rov buzilgan JSON bilan ham faqat -32504 oladi
    rpcError(await payme('x', {}, { auth: null, raw: '{yaroqsiz' }), -32504);
  });

  test('protokol xatolari: -32300 (GET), -32700, -32600, -32601', async () => {
    const g = await payme('', {}, { httpMethod: 'GET' });
    rpcError(g, -32300);
    rpcError(await payme('x', {}, { raw: '{yaroqsiz json' }), -32700);
    rpcError(await payme('x', {}, { raw: JSON.stringify({ jsonrpc: '2.0', id: 5, params: {} }) }), -32600);
    rpcError(await payme('x', {}, { raw: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'CheckTransaction', params: [] }) }), -32600);
    rpcError(await payme('x', {}, { raw: JSON.stringify([1, 2]) }), -32600);
    rpcError(await payme('ChangePassword', { password: 'x' }), -32601);
    rpcError(await payme('toString', {}), -32601);
    rpcError(await payme('CreateTransaction', { id: ptx(), amount: TIYIN, account: { hashar_id: '1' } }), -32600); // time yo'q
    rpcError(await payme('CancelTransaction', { id: ptx() }), -32600); // reason yo'q
    rpcError(await payme('GetStatement', { from: 'a', to: 1 }), -32600);
  });

  test("tana hajmi Content-Length siz (chunked) ham cheklanadi: 64 KB dan katta o'qilmaydi", async () => {
    const headers = { 'content-type': 'application/json', authorization: basic('Paycom', PAY_TEST.paymeKey) };
    // Kichik chunked so'rov odatdagidek ishlaydi
    const small = await chunked('/api/payments/payme', JSON.stringify({ jsonrpc: '2.0', id: 77, method: 'ChangePassword', params: { password: 'x' } }), headers);
    assert.equal(small.status, 200);
    assert.equal(small.data.error?.code, -32601, JSON.stringify(small.data));
    assert.equal(small.data.id, 77);
    // Katta (200 KB) chunked tana — to'g'ri JSON bo'lsa ham o'qilmaydi → -32700
    const big = JSON.stringify({ jsonrpc: '2.0', id: 78, method: 'CheckPerformTransaction', params: { pad: 'x'.repeat(200 * 1024) } });
    const r = await chunked('/api/payments/payme', big, headers);
    assert.equal(r.status, 200);
    assert.equal(r.data.error?.code, -32700, JSON.stringify(r.data).slice(0, 200));
    // Kalitsiz katta so'rov — faqat -32504
    const anon = await chunked('/api/payments/payme', big, { 'content-type': 'application/json' });
    assert.equal(anon.data.error?.code, -32504);
  });

  test('CheckPerformTransaction: summa, hisob, ruxsat', async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    rpcError(await payme('CheckPerformTransaction', { amount: TIYIN - 100, account: acc(h) }), -31001);
    rpcError(await payme('CheckPerformTransaction', { amount: FEE, account: acc(h) }), -31001); // so'mda yuborilgan
    rpcError(await payme('CheckPerformTransaction', { amount: TIYIN, account: {} }), -31050, 'hashar_id');
    rpcError(await payme('CheckPerformTransaction', { amount: TIYIN, account: { hashar_id: 'abc' } }), -31050, 'hashar_id');
    rpcError(await payme('CheckPerformTransaction', { amount: TIYIN, account: { hashar_id: '999999999' } }), -31050, 'hashar_id');
    assert.deepEqual(ok(await payme('CheckPerformTransaction', { amount: TIYIN, account: acc(h) })), { allow: true });
    // Raqam ko'rinishidagi hashar_id ham
    assert.deepEqual(ok(await payme('CheckPerformTransaction', { amount: TIYIN, account: { hashar_id: h.id } })), { allow: true });
  });

  test("to'liq ketma-ketlik: Check → Create → Perform (idempotent), hashar e'lon qilinadi", async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    const id = ptx();
    const time = Date.now();
    const created = ok(await payme('CreateTransaction', { id, time, amount: TIYIN, account: acc(h) }));
    assert.equal(created.state, 1);
    assert.match(created.transaction, /^\d+$/);
    assert.equal(typeof created.create_time, 'number');
    assert.ok(Math.abs(created.create_time - Date.now()) < 60_000);
    // Takroriy CreateTransaction — o'sha natija
    assert.deepEqual(ok(await payme('CreateTransaction', { id, time, amount: TIYIN, account: acc(h) })), created);
    // Boshqa tranzaksiya shu hasharga — band (-31050..-31099)
    const busy = await payme('CreateTransaction', { id: ptx(), time, amount: TIYIN, account: acc(h) });
    rpcError(busy, -31052);
    rpcError(await payme('CheckPerformTransaction', { amount: TIYIN, account: acc(h) }), -31052);
    const chk = ok(await payme('CheckTransaction', { id }));
    assert.deepEqual(chk, { create_time: created.create_time, perform_time: 0, cancel_time: 0, transaction: created.transaction, state: 1, reason: null });
    assert.equal(await publicVisible(h), false, "bajarilmaguncha e'lon qilinmaydi");

    const performed = ok(await payme('PerformTransaction', { id }));
    assert.equal(performed.state, 2);
    assert.equal(performed.transaction, created.transaction);
    assert.ok(performed.perform_time >= created.create_time);
    assert.deepEqual(ok(await payme('PerformTransaction', { id })), performed, 'takroriy Perform — o\'sha natija');
    const chk2 = ok(await payme('CheckTransaction', { id }));
    assert.equal(chk2.state, 2);
    assert.equal(chk2.perform_time, performed.perform_time);
    assert.equal(chk2.cancel_time, 0);

    assert.equal(await publicVisible(h), true, "to'langandan keyin e'lon qilinadi");
    const d = await get(`/api/hashars/${h.id}`, other.token);
    assert.equal(d.data.payment_status, undefined);
    assert.equal((await get(`/api/hashars/${h.id}`, owner.token)).data.payment_status, 'paid');
    // Egasiga bildirishnoma
    const n = await notifications(owner.token);
    const pn = n.items.find((x) => x.type === 'payment_confirmed' && x.hashar?.id === h.id);
    assert.ok(pn, JSON.stringify(n.items.slice(0, 3)));
    assert.equal(pn.data.provider, 'payme');
    assert.equal(pn.data.amount, FEE);
    assert.match(pn.text, /To'lov tasdiqlandi/);
    // To'lov tarixi
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.equal(pay.data.status, 'paid');
    assert.equal(pay.data.amount, FEE, "to'langan summa");
    assert.equal(pay.data.payme_url, undefined, "to'langan hasharda havola yo'q");
    assert.equal(pay.data.history.length, 1);
    assert.deepEqual(
      { provider: pay.data.history[0].provider, amount: pay.data.history[0].amount, amount_tiyin: pay.data.history[0].amount_tiyin, state: 2, status: pay.data.history[0].status },
      { provider: 'payme', amount: FEE, amount_tiyin: TIYIN, state: 2, status: 'paid' },
    );
    // To'langan hashar uchun yangi to'lov — -31051
    rpcError(await payme('CheckPerformTransaction', { amount: TIYIN, account: acc(h) }), -31051, 'hashar_id');
    rpcError(await payme('CreateTransaction', { id: ptx(), time: Date.now(), amount: TIYIN, account: acc(h) }), -31051);
  });

  test("bajarilgandan keyin bekor qilish (-2): hashar yana yashiriladi; yakunlangan hasharda -31007", async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    const id = ptx();
    ok(await payme('CreateTransaction', { id, time: Date.now(), amount: TIYIN, account: acc(h) }));
    const performed = ok(await payme('PerformTransaction', { id }));
    assert.equal(await publicVisible(h), true);
    const c1 = ok(await payme('CancelTransaction', { id, reason: 5 }));
    assert.equal(c1.state, -2);
    assert.equal(c1.transaction, performed.transaction);
    assert.ok(c1.cancel_time >= performed.perform_time);
    assert.deepEqual(ok(await payme('CancelTransaction', { id, reason: 5 })), c1, 'takroriy Cancel — o\'sha natija');
    const chk = ok(await payme('CheckTransaction', { id }));
    assert.deepEqual({ state: chk.state, reason: chk.reason, cancel_time: chk.cancel_time, perform_time: chk.perform_time },
      { state: -2, reason: 5, cancel_time: c1.cancel_time, perform_time: performed.perform_time });
    rpcError(await payme('PerformTransaction', { id }), -31008);
    assert.equal(await publicVisible(h), false, "to'lov qaytarilgach yashirin");
    assert.equal((await get(`/api/hashars/${h.id}`, owner.token)).data.payment_status, 'unpaid');
    const n = await notifications(owner.token);
    assert.ok(n.items.some((x) => x.type === 'payment_cancelled' && x.hashar?.id === h.id));
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.equal(pay.data.history[0].status, 'refunded');

    // Qayta to'lash mumkin; yakunlangandan keyin bekor qilib bo'lmaydi
    const id2 = ptx();
    ok(await payme('CreateTransaction', { id: id2, time: Date.now(), amount: TIYIN, account: acc(h) }));
    ok(await payme('PerformTransaction', { id: id2 }));
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    assert.equal((await api(`/api/hashars/${h.id}/complete`, { method: 'POST', token: owner.token, form: fd })).status, 200);
    rpcError(await payme('CancelTransaction', { id: id2, reason: 5 }), -31007);
    assert.equal(ok(await payme('CheckTransaction', { id: id2 })).state, 2);
    assert.equal(await publicVisible(h), true);
  });

  test('bajarishdan oldin bekor qilish (-1): Perform → -31008, yangi tranzaksiya mumkin', async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    const id = ptx();
    const created = ok(await payme('CreateTransaction', { id, time: Date.now(), amount: TIYIN, account: acc(h) }));
    const c = ok(await payme('CancelTransaction', { id, reason: 3 }));
    assert.equal(c.state, -1);
    assert.equal(c.transaction, created.transaction);
    assert.deepEqual(ok(await payme('CancelTransaction', { id, reason: 3 })), c);
    rpcError(await payme('PerformTransaction', { id }), -31008);
    rpcError(await payme('CreateTransaction', { id, time: Date.now(), amount: TIYIN, account: acc(h) }), -31008);
    const chk = ok(await payme('CheckTransaction', { id }));
    assert.deepEqual({ state: chk.state, reason: chk.reason, perform_time: chk.perform_time }, { state: -1, reason: 3, perform_time: 0 });
    assert.equal(await publicVisible(h), false);
    // Bekor qilingan tranzaksiya hasharni band qilmaydi
    assert.deepEqual(ok(await payme('CheckPerformTransaction', { amount: TIYIN, account: acc(h) })), { allow: true });
    const id2 = ptx();
    assert.equal(ok(await payme('CreateTransaction', { id: id2, time: Date.now(), amount: TIYIN, account: acc(h) })).state, 1);
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual(pay.data.history.map((x) => x.status), ['pending', 'cancelled']);
  });

  test('12 soatlik timeout: Perform → -31008, tranzaksiya reason 4 bilan bekor; band hasharni bo\'shatadi', async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    const id = ptx();
    const past = Date.now() - H12 - 60_000;
    ok(await payme('CreateTransaction', { id, time: past, amount: TIYIN, account: acc(h) }, { now: past }));
    rpcError(await payme('PerformTransaction', { id }), -31008);
    const chk = ok(await payme('CheckTransaction', { id }));
    assert.equal(chk.state, -1);
    assert.equal(chk.reason, 4);
    assert.ok(chk.cancel_time > 0);
    rpcError(await payme('CreateTransaction', { id, time: past, amount: TIYIN, account: acc(h) }), -31008);
    assert.equal(await publicVisible(h), false);

    // Muddati o'tgan kutilayotgan tranzaksiya yangi tranzaksiyaga xalaqit bermaydi (avtomatik bekor, reason 4)
    const h2 = await createHashar(owner);
    const old = ptx();
    ok(await payme('CreateTransaction', { id: old, time: past, amount: TIYIN, account: acc(h2) }, { now: past }));
    const fresh = ptx();
    assert.equal(ok(await payme('CreateTransaction', { id: fresh, time: Date.now(), amount: TIYIN, account: acc(h2) })).state, 1);
    assert.deepEqual((({ state, reason }) => ({ state, reason }))(ok(await payme('CheckTransaction', { id: old }))), { state: -1, reason: 4 });
    // Takroriy CreateTransaction muddati o'tgan (kutilayotgan) tranzaksiyada → bekor qilinadi va -31008
    const h4 = await createHashar(owner);
    const stale = ptx();
    ok(await payme('CreateTransaction', { id: stale, time: past, amount: TIYIN, account: acc(h4) }, { now: past }));
    rpcError(await payme('CreateTransaction', { id: stale, time: past, amount: TIYIN, account: acc(h4) }), -31008);
    assert.deepEqual((({ state, reason }) => ({ state, reason }))(ok(await payme('CheckTransaction', { id: stale }))), { state: -1, reason: 4 });
    // 12 soatdan sal kam — hali bajariladi
    const h3 = await createHashar(owner);
    const almost = ptx();
    const t3 = Date.now() - H12 + 120_000;
    ok(await payme('CreateTransaction', { id: almost, time: t3, amount: TIYIN, account: acc(h3) }, { now: t3 }));
    assert.equal(ok(await payme('PerformTransaction', { id: almost })).state, 2);
    for (const x of [h, h2, h4]) await api(`/api/hashars/${x.id}`, { method: 'DELETE', token: owner.token });
  });

  test("noto'g'ri summa / hisob CreateTransaction'da; topilmagan tranzaksiya -31003", async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    rpcError(await payme('CreateTransaction', { id: ptx(), time: Date.now(), amount: TIYIN + 1, account: acc(h) }), -31001);
    rpcError(await payme('CreateTransaction', { id: ptx(), time: Date.now(), amount: TIYIN, account: { hashar_id: '999999999' } }), -31050, 'hashar_id');
    rpcError(await payme('CreateTransaction', { id: ptx(), time: Date.now(), amount: TIYIN, account: { boshqa: '1' } }), -31050);
    const ghost = ptx();
    rpcError(await payme('PerformTransaction', { id: ghost }), -31003);
    rpcError(await payme('CancelTransaction', { id: ghost, reason: 1 }), -31003);
    rpcError(await payme('CheckTransaction', { id: ghost }), -31003);
    await api(`/api/hashars/${h.id}`, { method: 'DELETE', token: owner.token });
  });

  test("hashar o'chirilgan yoki boshqa usulda to'langan bo'lsa Perform → -31008 (pul yechilmaydi)", async () => {
    const owner = await newOwner();
    const admin = await asAdmin();
    const h = await createHashar(owner);
    const id = ptx();
    ok(await payme('CreateTransaction', { id, time: Date.now(), amount: TIYIN, account: acc(h) }));
    assert.equal((await api(`/api/admin/hashars/${h.id}/mark-paid`, { method: 'POST', token: admin.token, json: {} })).status, 200);
    rpcError(await payme('PerformTransaction', { id }), -31008);
    assert.equal(ok(await payme('CheckTransaction', { id })).state, 1);
    assert.equal(ok(await payme('CancelTransaction', { id, reason: 3 })).state, -1);
    assert.equal(await publicVisible(h), true, "qo'lda to'lov saqlanib qoladi");

    const g = await createHashar(owner);
    const gid = ptx();
    ok(await payme('CreateTransaction', { id: gid, time: Date.now(), amount: TIYIN, account: acc(g) }));
    assert.equal((await api(`/api/hashars/${g.id}`, { method: 'DELETE', token: owner.token })).status, 200);
    rpcError(await payme('PerformTransaction', { id: gid }), -31008);
    // O'chirilgan hashar bo'yicha to'lov tarixi saqlanadi (admin ro'yxatida)
    const list = await api(`/api/admin/payments?hashar_id=${g.id}`, { token: admin.token });
    assert.equal(list.status, 200);
    assert.equal(list.data.items.length, 1);
    assert.equal(list.data.items[0].hashar.deleted, true);
  });

  test('GetStatement: oraliqdagi tranzaksiyalar, vaqt bo\'yicha tartib', async () => {
    const owner = await newOwner();
    const h = await createHashar(owner);
    const base = 946684800000 + rnd(1e6) * 1000; // shu yugurish uchun noyob oraliq (Payme `time`)
    const a = ptx();
    const b = ptx();
    ok(await payme('CreateTransaction', { id: a, time: base + 10, amount: TIYIN, account: acc(h) }));
    ok(await payme('CancelTransaction', { id: a, reason: 3 }));
    ok(await payme('CreateTransaction', { id: b, time: base + 5, amount: TIYIN, account: acc(h) }));
    ok(await payme('PerformTransaction', { id: b }));
    const st = ok(await payme('GetStatement', { from: base, to: base + 100 }));
    assert.equal(st.transactions.length, 2);
    assert.deepEqual(st.transactions.map((x) => x.id), [b, a], 'time bo\'yicha o\'sish');
    const [tb, ta] = st.transactions;
    assert.deepEqual(Object.keys(tb).sort(), ['account', 'amount', 'cancel_time', 'create_time', 'id', 'perform_time', 'reason', 'state', 'time', 'transaction']);
    assert.deepEqual({ time: tb.time, amount: tb.amount, account: tb.account, state: tb.state, reason: tb.reason, cancel_time: tb.cancel_time },
      { time: base + 5, amount: TIYIN, account: { hashar_id: String(h.id) }, state: 2, reason: null, cancel_time: 0 });
    assert.ok(tb.perform_time > 0);
    assert.deepEqual({ state: ta.state, reason: ta.reason, perform_time: ta.perform_time }, { state: -1, reason: 3, perform_time: 0 });
    assert.deepEqual(ok(await payme('GetStatement', { from: base + 6, to: base + 9 })), { transactions: [] });
    rpcError(await payme('GetStatement', { from: base + 100, to: base }), -32600);
    // Hozirgi vaqt oralig'ida — bu testlar yaratgan boshqa tranzaksiyalar ham bor
    const now = ok(await payme('GetStatement', { from: started, to: Date.now() + 1000 }));
    assert.ok(now.transactions.length >= 3);
    for (const [i, t] of now.transactions.entries()) {
      assert.ok(t.time >= started);
      if (i) assert.ok(now.transactions[i - 1].time <= t.time);
    }
  });
});

// ======================================================================

describe('v4: Click Shop API (prepare / complete)', { skip: NO_CLICK }, () => {
  let owner;

  before(async () => {
    await setFee(FEE);
    owner = await register(`Click ${RUN}`);
  });

  test("prepare: imzo, action, maydonlar, service_id, hashar, summa", async () => {
    const h = await createHashar(owner);
    const bad = clickBody(0, { hasharId: h.id });
    assert.equal((await click('prepare', { ...bad, sign_string: md5('boshqa') })).error, -1);
    assert.equal((await click('prepare', clickBody(0, { hasharId: h.id, secret: 'notogri' }))).error, -1);
    const b = clickBody(0, { hasharId: h.id, amount: '1000' });
    assert.equal((await click('prepare', { ...b, amount: String(FEE) })).error, -1, 'imzolangandan keyin summa o\'zgartirilgan');
    assert.equal((await click('prepare', clickBody(1, { hasharId: h.id, prepareId: 1 }))).error, -3, 'prepare ga action=1');
    const missing = clickBody(0, { hasharId: h.id });
    delete missing.sign_time;
    assert.equal((await click('prepare', missing)).error, -8);
    assert.equal((await click('prepare', {})).error, -8);
    assert.equal((await click('prepare', clickBody(0, { hasharId: h.id, service: '999' }))).error, -8);
    assert.equal((await click('prepare', clickBody(0, { hasharId: 999999999 }))).error, -5);
    assert.equal((await click('prepare', clickBody(0, { hasharId: 'abc' }))).error, -5);
    const wrong = await click('prepare', clickBody(0, { hasharId: h.id, amount: '4999' }));
    assert.equal(wrong.error, -2);
    assert.equal(wrong.error_note, 'Incorrect parameter amount');
    assert.equal(wrong.merchant_prepare_id, null);
    await api(`/api/hashars/${h.id}`, { method: 'DELETE', token: owner.token });
  });

  test("tana hajmi Content-Length siz (chunked) ham cheklanadi", async () => {
    const h = await createHashar(owner);
    const form = { 'content-type': 'application/x-www-form-urlencoded' };
    // Kichik chunked forma — imzo tekshiruvigacha yetadi (noto'g'ri imzo → -1)
    const small = await chunked('/api/payments/click/prepare', new URLSearchParams({ ...clickBody(0, { hasharId: h.id }), sign_string: md5('boshqa') }).toString(), form);
    assert.equal(small.data.error, -1, JSON.stringify(small.data));
    // To'g'ri imzoli, lekin 64 KB dan katta chunked tana — o'qilmaydi (-8)
    const big = new URLSearchParams({ ...clickBody(0, { hasharId: h.id }), pad: 'x'.repeat(100 * 1024) }).toString();
    const r = await chunked('/api/payments/click/prepare', big, form);
    assert.equal(r.status, 200);
    assert.equal(r.data.error, -8, JSON.stringify(r.data));
    await api(`/api/hashars/${h.id}`, { method: 'DELETE', token: owner.token });
  });

  test("prepare → complete → e'lon; takroriy prepare idempotent, takroriy complete -4", async () => {
    const h = await createHashar(owner);
    const transId = ctid();
    const p = await click('prepare', clickBody(0, { hasharId: h.id, transId, amount: `${FEE}.00` }));
    assert.equal(p.error, 0, JSON.stringify(p));
    assert.equal(p.error_note, 'Success');
    assert.equal(p.click_trans_id, Number(transId));
    assert.equal(p.merchant_trans_id, String(h.id));
    assert.ok(Number.isInteger(p.merchant_prepare_id) && p.merchant_prepare_id > 0);
    const again = await click('prepare', clickBody(0, { hasharId: h.id, transId }));
    assert.equal(again.error, 0);
    assert.equal(again.merchant_prepare_id, p.merchant_prepare_id);
    assert.equal(await publicVisible(h), false);

    // complete: imzo, prepare id, summa
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId, prepareId: p.merchant_prepare_id, secret: 'x' }))).error, -1);
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId, prepareId: 999999999 }))).error, -6);
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId: ctid(), prepareId: p.merchant_prepare_id }))).error, -6);
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId, prepareId: p.merchant_prepare_id, amount: '6000' }))).error, -2);
    assert.equal((await click('complete', clickBody(0, { hasharId: h.id, transId }))).error, -3, 'complete ga action=0');

    const c = await click('complete', clickBody(1, { hasharId: h.id, transId, prepareId: p.merchant_prepare_id }));
    assert.deepEqual(c, {
      click_trans_id: Number(transId),
      merchant_trans_id: String(h.id),
      merchant_confirm_id: p.merchant_prepare_id,
      error: 0,
      error_note: 'Success',
    });
    assert.equal(await publicVisible(h), true);
    const n = await notifications(owner.token);
    assert.ok(n.items.some((x) => x.type === 'payment_confirmed' && x.hashar?.id === h.id && x.data.provider === 'click'));
    const rep = await click('complete', clickBody(1, { hasharId: h.id, transId, prepareId: p.merchant_prepare_id }));
    assert.equal(rep.error, -4);
    assert.equal(rep.error_note, 'Already paid');
    assert.equal((await click('prepare', clickBody(0, { hasharId: h.id, transId }))).error, -4);
    assert.equal((await click('prepare', clickBody(0, { hasharId: h.id }))).error, -4, "yangi to'lov to'langan hasharga");
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.equal(pay.data.status, 'paid');
    assert.deepEqual(pay.data.history.map((x) => [x.provider, x.status, x.amount]), [['click', 'paid', FEE]]);
  });

  test("Click xatosi bilan complete → -9 (bekor), keyin yangi to'lov ishlaydi", async () => {
    const h = await createHashar(owner);
    const t1 = ctid();
    const p = await click('prepare', clickBody(0, { hasharId: h.id, transId: t1 }));
    assert.equal(p.error, 0);
    const c = await click('complete', clickBody(1, { hasharId: h.id, transId: t1, prepareId: p.merchant_prepare_id, error: '-5017' }));
    assert.equal(c.error, -9);
    assert.equal(c.error_note, 'Transaction cancelled');
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId: t1, prepareId: p.merchant_prepare_id }))).error, -9);
    assert.equal((await click('prepare', clickBody(0, { hasharId: h.id, transId: t1 }))).error, -9);
    assert.equal(await publicVisible(h), false);
    const t2 = ctid();
    const p2 = await click('prepare', clickBody(0, { hasharId: h.id, transId: t2 }));
    assert.equal(p2.error, 0);
    assert.notEqual(p2.merchant_prepare_id, p.merchant_prepare_id);
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId: t2, prepareId: p2.merchant_prepare_id }))).error, 0);
    assert.equal(await publicVisible(h), true);
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual(pay.data.history.map((x) => x.status), ['paid', 'cancelled']);
  });

  test("ikki prepare, biri complete — ikkinchisining complete'i -4 (ikki marta to'lanmaydi)", async () => {
    const h = await createHashar(owner);
    const [ta, tb] = [ctid(), ctid()];
    const pa = await click('prepare', clickBody(0, { hasharId: h.id, transId: ta }));
    const pb = await click('prepare', clickBody(0, { hasharId: h.id, transId: tb }));
    assert.equal(pa.error, 0);
    assert.equal(pb.error, 0);
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId: ta, prepareId: pa.merchant_prepare_id }))).error, 0);
    assert.equal((await click('complete', clickBody(1, { hasharId: h.id, transId: tb, prepareId: pb.merchant_prepare_id }))).error, -4);
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual(pay.data.history.map((x) => x.status).sort(), ['cancelled', 'paid']);
  });
});

// ======================================================================

describe("v4: qo'lda tasdiqlash va admin to'lovlar ro'yxati", () => {
  let admin;
  let owner;
  let plain;

  before(async () => {
    admin = await asAdmin();
    await setFee(FEE);
    owner = await register(`Qo'lda ${RUN}`);
    plain = await register(`Oddiy ${RUN}`);
  });

  test('mark-paid: ruxsat, validatsiya, tasdiqlash, takror 409', async () => {
    const h = await createHashar(owner);
    const path = `/api/admin/hashars/${h.id}/mark-paid`;
    assert.equal((await api(path, { method: 'POST', json: {} })).status, 401);
    assert.equal((await api(path, { method: 'POST', token: plain.token, json: {} })).status, 403);
    assert.equal((await api(path, { method: 'POST', token: owner.token, json: {} })).status, 403, "egasi o'zini tasdiqlay olmaydi");
    assert.equal((await api('/api/admin/hashars/999999999/mark-paid', { method: 'POST', token: admin.token, json: {} })).status, 404);
    assert.equal((await api(path, { method: 'POST', token: admin.token, json: { note: 'x'.repeat(501) } })).status, 400);
    assert.equal((await api(path, { method: 'POST', token: admin.token, json: { amount: -5 } })).status, 400);
    const r = await api(path, { method: 'POST', token: admin.token, json: { note: '  Karta orqali tushdi  ', amount: 6000 } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.ok, true);
    assert.equal(r.data.hashar.payment_status, 'paid');
    assert.equal(r.data.hashar.creator.phone, owner.phone);
    assert.deepEqual(
      (({ provider, amount, amount_tiyin, state, status, note }) => ({ provider, amount, amount_tiyin, state, status, note }))(r.data.payment),
      { provider: 'manual', amount: 6000, amount_tiyin: 600000, state: 1, status: 'paid', note: 'Karta orqali tushdi' },
    );
    assert.equal(await publicVisible(h), true);
    // Regressiya: holat sahifasida haqiqatan to'langan summa (joriy narx emas)
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual({ status: pay.data.status, amount: pay.data.amount }, { status: 'paid', amount: 6000 });
    const again = await api(path, { method: 'POST', token: admin.token, json: {} });
    assert.equal(again.status, 409);
    const n = await notifications(owner.token);
    const pn = n.items.find((x) => x.type === 'payment_confirmed' && x.hashar?.id === h.id);
    assert.ok(pn);
    assert.equal(pn.data.provider, 'manual');
    assert.equal(pn.actor, null);
    // Narx standart (summa yuborilmasa)
    const h2 = await createHashar(owner);
    const r2 = await api(`/api/admin/hashars/${h2.id}/mark-paid`, { method: 'POST', token: admin.token }); // tanasiz POST ham
    assert.equal(r2.data.payment.amount, FEE);
    assert.equal(r2.data.payment.note, null);
    // Narx keyin o'zgarsa ham to'langan summa o'zgarmaydi
    await setFee(7000);
    assert.equal((await get(`/api/hashars/${h2.id}/payment`, owner.token)).data.amount, FEE);
    await setFee(FEE);
  });

  test("waive: to'lovsiz e'lon ('waived'), 'published' bildirishnomasi", async () => {
    const h = await createHashar(owner);
    const r = await api(`/api/admin/hashars/${h.id}/mark-paid`, { method: 'POST', token: admin.token, json: { waive: true } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.hashar.payment_status, 'waived');
    assert.equal(r.data.payment, null);
    assert.equal(await publicVisible(h), true);
    const wp = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual({ status: wp.data.status, amount: wp.data.amount }, { status: 'waived', amount: null }, "to'lov yo'q — summa ham yo'q");
    const n = await notifications(owner.token);
    const pub = n.items.find((x) => x.type === 'published' && x.hashar?.id === h.id);
    assert.ok(pub);
    assert.match(pub.text, /e'lon qilindi/);
    assert.equal((await api(`/api/admin/hashars/${h.id}/mark-paid`, { method: 'POST', token: admin.token, json: { waive: true } })).status, 409);
    // Summa 0 — 0 so'mlik "to'lov" yozilmaydi, bepul e'lon (waive) qilinadi
    const z = await createHashar(owner);
    const rz = await api(`/api/admin/hashars/${z.id}/mark-paid`, { method: 'POST', token: admin.token, json: { amount: 0 } });
    assert.equal(rz.status, 200, JSON.stringify(rz.data));
    assert.equal(rz.data.hashar.payment_status, 'waived');
    assert.equal(rz.data.payment, null);
    assert.deepEqual((await get(`/api/hashars/${z.id}/payment`, owner.token)).data.history, []);
  });

  test("GET /api/admin/payments: filtrlar, shakl, xulosa; hashars?payment=; overview", async () => {
    assert.equal((await get('/api/admin/payments')).status, 401);
    assert.equal((await get('/api/admin/payments', plain.token)).status, 403);
    const all = await get('/api/admin/payments?limit=100', admin.token);
    assert.equal(all.status, 200);
    assert.equal(typeof all.data.total, 'number');
    assert.ok(all.data.items.length >= 2);
    assert.deepEqual(Object.keys(all.data.summary).sort(), ['paid_amount', 'paid_count']);
    const it = all.data.items[0];
    for (const k of ['id', 'provider', 'amount', 'amount_tiyin', 'state', 'status', 'created_at', 'performed_at', 'cancelled_at', 'reason', 'note', 'provider_tx_id', 'admin_id', 'hashar', 'user']) {
      assert.ok(k in it, k);
    }
    const manual = await get(`/api/admin/payments?provider=manual&status=paid&q=${encodeURIComponent(owner.phone)}`, admin.token);
    assert.equal(manual.data.items.length, 2);
    assert.ok(manual.data.items.every((x) => x.provider === 'manual' && x.status === 'paid' && x.admin_id === admin.user.id));
    assert.deepEqual(manual.data.summary, { paid_count: 2, paid_amount: 6000 + FEE });
    assert.equal(manual.data.total, 2);
    const anyManual = await get('/api/admin/payments?provider=manual', admin.token);
    assert.ok(anyManual.data.items.every((x) => x.provider === 'manual'));
    const mine = await get(`/api/admin/payments?q=${encodeURIComponent(owner.phone)}`, admin.token);
    assert.ok(mine.data.items.length >= 2 && mine.data.items.every((x) => x.user.id === owner.user.id));
    for (const bad of ['provider=bitcoin', 'status=yomon', 'hashar_id=abc']) {
      assert.ok([400, 404].includes((await get(`/api/admin/payments?${bad}`, admin.token)).status), bad);
    }
    // Regressiya: Object.prototype kalitlari — 500 emas, 400
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      for (const param of ['status', 'provider']) {
        const r = await get(`/api/admin/payments?${param}=${key}`, admin.token);
        assert.equal(r.status, 400, `${param}=${key}: ${JSON.stringify(r.data)}`);
      }
    }
    const unpaid = await createHashar(owner);
    const hl = await get('/api/admin/hashars?payment=unpaid&limit=100', admin.token);
    assert.equal(hl.status, 200);
    assert.ok(hl.data.items.some((x) => x.id === unpaid.id));
    assert.ok(hl.data.items.every((x) => x.payment_status === 'unpaid'));
    assert.equal((await get('/api/admin/hashars?payment=yomon', admin.token)).status, 400);
    const ov = await get('/api/admin/overview', admin.token);
    for (const k of ['unpaid', 'payments_paid', 'revenue']) assert.equal(typeof ov.data[k], 'number', k);
    assert.ok(ov.data.unpaid >= 1);
    assert.ok(ov.data.recent_hashars.every((x) => typeof x.payment_status === 'string'));
  });
});

// ======================================================================

describe("v4: narx 0 — bepul e'lon", () => {
  let owner;

  before(async () => {
    owner = await register(`Bepul ${RUN}`);
  });

  after(async () => {
    await setFee(0); // keyingi testlar (va fayllar) uchun
  });

  test("narx 0: yangi hashar darhol 'paid', payment yo'q, hamma ko'radi; eski v3 APK ham yarata oladi", async () => {
    await setFee(0);
    assert.equal((await get('/api/config')).data.hashar_fee, 0);
    const h = await createHashar(owner);
    assert.equal(h.payment_status, 'paid');
    assert.equal(h.payment, undefined);
    assert.equal(await publicVisible(h), true);
    const pay = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual({ status: pay.data.status, amount: pay.data.amount, payme: pay.data.payme_url, click: pay.data.click_url },
      { status: 'paid', amount: null, payme: undefined, click: undefined }, "to'lov yozuvi yo'q — summa null");
    // Narx 0 — to'lov sahifasi kerak emas: v3 APK ham e'lon qila oladi
    const v3 = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({}, null), client: 3 });
    assert.equal(v3.status, 201, JSON.stringify(v3.data));
    assert.equal(v3.data.payment_status, 'paid');
  });

  // Regressiya: narx 0 ga tushirilgandan keyin egasi "0 so'm — To'lov kutilmoqda" ekranida qolib ketardi
  test("narx 0 ga tushganda to'lanmaganlar ommaviy e'lon qilinmaydi; egasi to'lov sahifasini ochsa — bepul e'lon (bitta 'published')", async () => {
    const admin = await asAdmin();
    await setFee(FEE);
    const opened = await createHashar(owner);
    const left = await createHashar(owner);
    await setFee(0);
    // Spam himoyasi: hech kim ochmagan to'lanmagan hashar yashirin qoladi; admin ko'rishi e'lon qilmaydi
    assert.equal(await publicVisible(opened), false);
    const adm = await get(`/api/hashars/${opened.id}/payment`, admin.token);
    assert.deepEqual({ status: adm.data.status, payme: adm.data.payme_url }, { status: 'unpaid', payme: undefined });
    assert.equal(await publicVisible(opened), false);
    // Egasi ochdi → 'waived', havola va "0 so'm" yo'q, hamma ko'radi
    const bp = await get(`/api/hashars/${opened.id}/payment`, owner.token);
    assert.equal(bp.status, 200, JSON.stringify(bp.data));
    assert.deepEqual({ status: bp.data.status, amount: bp.data.amount, payme: bp.data.payme_url, click: bp.data.click_url },
      { status: 'waived', amount: null, payme: undefined, click: undefined });
    assert.deepEqual(bp.data.history, []);
    assert.equal(await publicVisible(opened), true);
    const published = async () => (await notifications(owner.token)).items.filter((x) => x.type === 'published' && x.hashar?.id === opened.id);
    assert.equal((await published()).length, 1);
    // Takroriy ochish — idempotent
    assert.equal((await get(`/api/hashars/${opened.id}/payment`, owner.token)).data.status, 'waived');
    assert.equal((await published()).length, 1);
    // Ochilmagani o'z holicha; Payme uni 0 so'mga qabul qilmaydi
    assert.equal(await publicVisible(left), false);
    if (!NO_PAYME) rpcError(await payme('CheckPerformTransaction', { amount: TIYIN, account: acc(left) }), -31001);
    // Narx qaytsa — e'lon qilingani to'lov so'ramaydi, ochilmagani yana to'lovni kutadi
    await setFee(FEE);
    assert.equal((await get(`/api/hashars/${opened.id}/payment`, owner.token)).data.status, 'waived');
    const lp = await get(`/api/hashars/${left.id}/payment`, owner.token);
    assert.deepEqual({ status: lp.data.status, amount: lp.data.amount }, { status: 'unpaid', amount: FEE });
    assert.equal((await api(`/api/hashars/${left.id}`, { method: 'DELETE', token: owner.token })).status, 200);
  });

  test("narx 0 da to'lov qaytarilsa (Payme -2) — egasi ochganda bepul e'lon, '0 so'm to'lang' yo'q", { skip: NO_PAYME }, async () => {
    await setFee(FEE);
    const h = await createHashar(owner);
    const id = ptx();
    ok(await payme('CreateTransaction', { id, time: Date.now(), amount: TIYIN, account: acc(h) }));
    ok(await payme('PerformTransaction', { id }));
    await setFee(0);
    assert.equal(ok(await payme('CancelTransaction', { id, reason: 5 })).state, -2);
    assert.equal(await publicVisible(h), false, "qaytarilgan to'lov — hashar yashirindi");
    const p = await get(`/api/hashars/${h.id}/payment`, owner.token);
    assert.deepEqual({ status: p.data.status, amount: p.data.amount }, { status: 'waived', amount: null });
    assert.deepEqual(p.data.history.map((x) => x.status), ['refunded']);
    assert.equal(await publicVisible(h), true);
  });
});
