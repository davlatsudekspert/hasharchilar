// hasharchilar API testi — `wrangler dev` (lokal D1 yoki Durable Object + R2) ga qarshi.
// Ishga tushirish: npx wrangler dev --port 8787 --var ADMIN_PHONES:+998900000099 --var GEO_MOCK:1 --var EMAIL_MOCK:1
//   && npm run test:api
// (admin panel testlari — tests/admin.test.mjs, email/OTP — tests/email.test.mjs)
// DO rejimi: STORAGE=do (wrangler dev --config wrangler.deploy.json, generatsiya: --storage do).
// Bo'sh bo'lmagan bazada ham qayta ishlaydi: har safar tasodifiy telefonlar va IP lar.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE, PNG_AFTER, PNG_BEFORE, RUN, api, hasharForm, randomEmail, randomIp, randomPhone, register, rnd, setFee, tashkentDate } from './helpers.mjs';

// v4: hashar e'lon qilish narxi standart 5000 so'm (to'lanmagan hashar ommaga ko'rinmaydi). Bu fayldagi v1–v3
// testlari hashar darhol e'lon qilinishini kutadi — narx 0 (bepul). To'lov testlari: tests/payments.suite.mjs.
await setFee(0);

const IS_LOCAL_SERVER = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
const STORAGE = process.env.STORAGE === 'do' ? 'do' : 'd1'; // serverdagi baza turi

// ---------- Testlar ----------

test('GET /api/health', async () => {
  const r = await api('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
});

test("noma'lum /api marshruti → 404 JSON", async () => {
  const r = await api('/api/yoq-marshrut');
  assert.equal(r.status, 404);
  assert.equal(typeof r.data.error, 'string');
});

describe('Autentifikatsiya', () => {
  const ip = randomIp();
  const phone = randomPhone();
  const email = randomEmail('auth');
  let token;

  // Ro'yxat — email orqali (register/start → kod → register/verify); batafsil: tests/email.test.mjs
  test("ro'yxat → 201, telefon normallashadi, email tasdiqlangan", async () => {
    const local = phone.slice(4); // 9 xonali
    const spaced = `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
    const s = await api('/api/auth/register/start', {
      method: 'POST',
      ip,
      json: { name: '  Aziz  Test ', phone: spaced, email: ` ${email.toUpperCase()} `, password: 'parol123' },
    });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(s.data.email, email);
    const r = await api('/api/auth/register/verify', { method: 'POST', ip, json: { email, code: s.data.dev_code } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(r.data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.data.user.phone, phone);
    assert.equal(r.data.user.name, 'Aziz Test');
    assert.equal(r.data.user.email, email);
    assert.equal(r.data.user.email_verified, true);
    assert.equal(typeof r.data.user.id, 'number');
    assert.equal(r.data.user.password_hash, undefined);
    assert.equal(r.data.user.is_admin, false, 'oddiy foydalanuvchi admin emas');
  });

  test('band telefon → 409', async () => {
    const r = await api('/api/auth/register/start', { method: 'POST', ip, json: { name: 'Boshqa', phone, email: randomEmail(), password: 'parol123' } });
    assert.equal(r.status, 409);
    assert.ok(r.data.error);
  });

  test("noto'g'ri telefon → 400", async () => {
    const r = await api('/api/auth/register/start', { method: 'POST', ip, json: { name: 'Test', phone: '12345', email: randomEmail(), password: 'parol123' } });
    assert.equal(r.status, 400);
  });

  test('qisqa parol → 400', async () => {
    const r = await api('/api/auth/register/start', { method: 'POST', ip, json: { name: 'Test', phone: randomPhone(), email: randomEmail(), password: '123' } });
    assert.equal(r.status, 400);
  });

  test('kirish → token', async () => {
    const r = await api('/api/auth/login', { method: 'POST', ip, json: { phone, password: 'parol123' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.data.user.phone, phone);
    token = r.data.token;
  });

  test("noto'g'ri parol → 401", async () => {
    const r = await api('/api/auth/login', { method: 'POST', ip, json: { phone, password: 'xato-parol' } });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, "Telefon yoki parol noto'g'ri");
  });

  test('GET /api/me', async () => {
    const r = await api('/api/me', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.phone, phone);
    assert.deepEqual(r.data.stats, { created: 0, joined: 0, completed: 0 });
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  test('GET /api/me tokensiz / yaroqsiz token → 401', async () => {
    assert.equal((await api('/api/me')).status, 401);
    assert.equal((await api('/api/me', { token: 'A'.repeat(43) })).status, 401);
  });

  test('chiqish tokenni bekor qiladi', async () => {
    const r = await api('/api/auth/logout', { method: 'POST', token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true });
    assert.equal((await api('/api/me', { token })).status, 401);
  });
});

test("kirish: noto'g'ri formatdagi telefon ham 401 (SPEC 5)", async () => {
  const r = await api('/api/auth/login', { method: 'POST', json: { phone: '123', password: 'x' } });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, "Telefon yoki parol noto'g'ri");
});

test('kirish limiti telefon bo\'yicha: IP almashtirilsa ham 10 urinishdan keyin 429', async () => {
  const phone = randomPhone();
  for (let i = 0; i < 10; i++) {
    const r = await api('/api/auth/login', { method: 'POST', json: { phone, password: 'xato-parol' } }); // har safar yangi IP
    assert.equal(r.status, 401, `urinish ${i + 1}`);
  }
  const r = await api('/api/auth/login', { method: 'POST', json: { phone, password: 'xato-parol' } });
  assert.equal(r.status, 429);
  assert.ok(r.data.error);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  // Boshqa raqamga ta'sir qilmaydi
  const other = await api('/api/auth/login', { method: 'POST', json: { phone: randomPhone(), password: 'xato-parol' } });
  assert.equal(other.status, 401);
});

test('kirish limiti IP bo\'yicha: IPv6 /64 bitta hisob, 30 urinishdan keyin 429', async () => {
  const net = `2001:db8:${rnd(0xffff).toString(16)}:${rnd(0xffff).toString(16)}`;
  for (let i = 0; i < 30; i++) {
    // /64 ichidagi har xil manzillar, har xil raqamlar
    const r = await api('/api/auth/login', { method: 'POST', ip: `${net}::${(i + 1).toString(16)}`, json: { phone: randomPhone(), password: 'xato-parol' } });
    assert.equal(r.status, 401, `urinish ${i + 1}`);
  }
  const r = await api('/api/auth/login', { method: 'POST', ip: `${net}:ffff::1`, json: { phone: randomPhone(), password: 'xato-parol' } });
  assert.equal(r.status, 429);
  // Boshqa /64 tarmoq va IPv4 ga ta'sir qilmaydi
  const otherNet = await api('/api/auth/login', { method: 'POST', ip: `2001:db8:ffff:${rnd(0xffff).toString(16)}::1`, json: { phone: randomPhone(), password: 'x' } });
  assert.equal(otherNet.status, 401);
  const v4 = await api('/api/auth/login', { method: 'POST', json: { phone: randomPhone(), password: 'x' } });
  assert.equal(v4.status, 401);
});

describe('Hasharlar', () => {
  let owner; // yaratuvchi
  let stranger; // begona foydalanuvchi
  let hashar; // yaratilgan HasharDTO

  before(async () => {
    owner = await register('Ega Testov');
    stranger = await register('Begona Testov');
  });

  test('tokensiz yaratish → 401', async () => {
    const r = await api('/api/hashars', { method: 'POST', form: hasharForm() });
    assert.equal(r.status, 401);
  });

  test("yaratish (multipart + PNG) → 201 HasharDTO", async () => {
    const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm() });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    hashar = r.data;
    assert.equal(typeof hashar.id, 'number');
    assert.equal(hashar.title, `Test hashar ${RUN}`);
    assert.equal(hashar.status, 'PENDING');
    assert.deepEqual(hashar.items, ["Qo'lqop", 'Belkurak']);
    assert.equal(hashar.lat, 41.2995);
    assert.equal(hashar.lng, 69.2401);
    assert.deepEqual(hashar.creator, { id: owner.user.id, name: 'Ega Testov', avatar_url: null });
    assert.equal(hashar.volunteer_count, 1);
    // v3 maydonlari: standart kategoriya, cheklovsiz, izohsiz
    assert.equal(hashar.category, 'cleaning');
    assert.equal(hashar.max_volunteers, null);
    assert.equal(hashar.comment_count, 0);
    assert.equal(hashar.distance_km, undefined);
    assert.equal(hashar.joined, true);
    assert.equal(hashar.is_owner, true);
    assert.match(hashar.before_url, /^\/api\/media\/before\/[0-9a-f-]{36}\.png$/);
    assert.equal(hashar.after_url, null);
    assert.equal(hashar.completed_at, null);
    assert.ok(hashar.created_at);
  });

  test("validatsiya: o'tmish sana, lat, MIME, sarlavha → 400", async () => {
    const cases = [
      hasharForm({ date_time: tashkentDate(-2) }),
      hasharForm({ date_time: '2027-02-30T10:00' }),
      hasharForm({ date_time: '2027-10-11 09:00' }),
      hasharForm({ lat: '123' }),
      hasharForm({ lng: 'abc' }),
      hasharForm({ title: 'ab' }),
      // Emoji: JS .length 3–4, lekin 2 belgi (SQLite CHECK bilan bir xil hisob) → 500 emas, 400
      hasharForm({ title: 'a🌳' }),
      hasharForm({ title: '🌳🌳' }),
      hasharForm({ items: 'not-json' }),
      hasharForm({}, { bytes: Buffer.from('salom dunyo'), type: 'text/plain', name: 'a.txt' }),
      hasharForm({}, { bytes: Buffer.from('<html>soxta</html>'), type: 'image/png', name: 'soxta.png' }),
    ];
    for (const [i, form] of cases.entries()) {
      const r = await api('/api/hashars', { method: 'POST', token: owner.token, form });
      assert.equal(r.status, 400, `holat ${i}: ${JSON.stringify(r.data)}`);
      assert.equal(typeof r.data.error, 'string');
    }
  });

  test('media: rasm baytlari va header lar', async () => {
    const r = await api(hashar.before_url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('cache-control'), /immutable/);
    assert.ok(r.buf.equals(PNG_BEFORE));
    assert.equal((await api('/api/media/secret/x.png')).status, 404);
    assert.equal((await api('/api/media/before/..%2Fapp.apk')).status, 404);
  });

  test("ro'yxat: mehmon joined=false, ega is_owner=true", async () => {
    const guest = await api('/api/hashars');
    assert.equal(guest.status, 200);
    assert.ok(Array.isArray(guest.data));
    const g = guest.data.find((x) => x.id === hashar.id);
    assert.ok(g, "yangi hashar ro'yxatda");
    assert.equal(g.joined, false);
    assert.equal(g.is_owner, false);
    assert.equal(g.creator.phone, undefined);

    const mine = await api('/api/hashars', { token: owner.token });
    const m = mine.data.find((x) => x.id === hashar.id);
    assert.equal(m.joined, true);
    assert.equal(m.is_owner, true);
  });

  test('filtrlar: status, mine, q', async () => {
    const pending = await api('/api/hashars?status=PENDING');
    assert.ok(pending.data.every((x) => x.status === 'PENDING'));
    assert.ok(pending.data.some((x) => x.id === hashar.id));

    const completed = await api('/api/hashars?status=COMPLETED');
    assert.ok(completed.data.every((x) => x.status === 'COMPLETED'));
    assert.ok(!completed.data.some((x) => x.id === hashar.id));

    assert.equal((await api('/api/hashars?status=YOMON')).status, 400);
    assert.equal((await api('/api/hashars?mine=created')).status, 401);

    const created = await api('/api/hashars?mine=created', { token: owner.token });
    assert.deepEqual(created.data.map((x) => x.id), [hashar.id]);
    const strangerCreated = await api('/api/hashars?mine=created', { token: stranger.token });
    assert.deepEqual(strangerCreated.data, []);

    const q = await api(`/api/hashars?q=${encodeURIComponent(`hashar ${RUN}`)}`);
    assert.deepEqual(q.data.map((x) => x.id), [hashar.id]);
    const qDesc = await api(`/api/hashars?q=${encodeURIComponent(`test ${RUN} uchun`)}`);
    assert.ok(qDesc.data.some((x) => x.id === hashar.id));
    // % va _ ekranlanadi: '%RUN' so'zma-so'z qidiriladi
    const qEsc = await api(`/api/hashars?q=${encodeURIComponent(`%${RUN}`)}`);
    assert.deepEqual(qEsc.data, []);
    const qLong = await api(`/api/hashars?q=${encodeURIComponent('o‘'.repeat(60))}`);
    assert.equal(qLong.status, 200);
  });

  test("tafsilot: begonaga telefon ko'rinmaydi, qo'shilgach ko'rinadi", async () => {
    const before1 = await api(`/api/hashars/${hashar.id}`, { token: stranger.token });
    assert.equal(before1.status, 200);
    assert.equal(before1.data.creator.phone, undefined);
    assert.deepEqual(before1.data.volunteers, [{ id: owner.user.id, name: 'Ega Testov', avatar_url: null }]);

    const join = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: stranger.token });
    assert.equal(join.status, 200);
    assert.deepEqual(join.data, { joined: true, volunteer_count: 2 });

    const again = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: stranger.token });
    assert.deepEqual(again.data, { joined: true, volunteer_count: 2 }, 'idempotent');

    const after1 = await api(`/api/hashars/${hashar.id}`, { token: stranger.token });
    assert.equal(after1.data.joined, true);
    assert.equal(after1.data.is_owner, false);
    assert.equal(after1.data.creator.phone, owner.phone);
    assert.equal(after1.data.volunteers.length, 2);

    const asOwner = await api(`/api/hashars/${hashar.id}`, { token: owner.token });
    assert.equal(asOwner.data.creator.phone, owner.phone);

    const guest = await api(`/api/hashars/${hashar.id}`);
    assert.equal(guest.data.creator.phone, undefined);
    assert.equal(guest.data.joined, false);

    assert.equal((await api('/api/hashars/99999999')).status, 404);
    assert.equal((await api('/api/hashars/abc')).status, 404);
  });

  test("mine=joined va /api/me statistikasi", async () => {
    const joined = await api('/api/hashars?mine=joined', { token: stranger.token });
    assert.deepEqual(joined.data.map((x) => x.id), [hashar.id]);
    const ownerJoined = await api('/api/hashars?mine=joined', { token: owner.token });
    assert.ok(!ownerJoined.data.some((x) => x.id === hashar.id), "o'z hashari qo'shilganlarda emas");
    const me = await api('/api/me', { token: stranger.token });
    assert.deepEqual(me.data.stats, { created: 0, joined: 1, completed: 0 });
  });

  test('chiqish; ega chiqa olmaydi → 409', async () => {
    const leave = await api(`/api/hashars/${hashar.id}/join`, { method: 'DELETE', token: stranger.token });
    assert.equal(leave.status, 200);
    assert.deepEqual(leave.data, { joined: false, volunteer_count: 1 });
    const ownerLeave = await api(`/api/hashars/${hashar.id}/join`, { method: 'DELETE', token: owner.token });
    assert.equal(ownerLeave.status, 409);
    // Qayta qo'shilamiz (keyingi testlar uchun)
    const rejoin = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: stranger.token });
    assert.equal(rejoin.data.volunteer_count, 2);
  });

  test('yakunlash: begona → 403, rasmsiz → 400', async () => {
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    const r1 = await api(`/api/hashars/${hashar.id}/complete`, { method: 'POST', token: stranger.token, form: fd });
    assert.equal(r1.status, 403);
    const r2 = await api(`/api/hashars/${hashar.id}/complete`, { method: 'POST', token: owner.token, form: new FormData() });
    assert.equal(r2.status, 400);
    assert.equal((await api(`/api/hashars/${hashar.id}/complete`, { method: 'POST', form: fd })).status, 401);
  });

  test('yakunlash → COMPLETED + after_url', async () => {
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    const r = await api(`/api/hashars/${hashar.id}/complete`, { method: 'POST', token: owner.token, form: fd });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.status, 'COMPLETED');
    assert.ok(r.data.completed_at);
    assert.match(r.data.after_url, /^\/api\/media\/after\/[0-9a-f-]{36}\.png$/);
    assert.equal(r.data.before_url, hashar.before_url);
    hashar = r.data;

    const img = await api(hashar.after_url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.ok(img.buf.equals(PNG_AFTER));

    const fd2 = new FormData();
    fd2.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    const again = await api(`/api/hashars/${hashar.id}/complete`, { method: 'POST', token: owner.token, form: fd2 });
    assert.equal(again.status, 409);
  });

  test("yakunlangan: qo'shilish 409, chiqish 409, o'chirish 409", async () => {
    const third = await register('Uchinchi Testov');
    const join = await api(`/api/hashars/${hashar.id}/join`, { method: 'POST', token: third.token });
    assert.equal(join.status, 409);
    const leave = await api(`/api/hashars/${hashar.id}/join`, { method: 'DELETE', token: stranger.token });
    assert.equal(leave.status, 409);
    const del = await api(`/api/hashars/${hashar.id}`, { method: 'DELETE', token: owner.token });
    assert.equal(del.status, 409);
    const me = await api('/api/me', { token: owner.token });
    assert.deepEqual(me.data.stats, { created: 1, joined: 0, completed: 1 });
  });

  test("o'chirish: begona 403, ega → ok, rasm ham o'chadi", async () => {
    const created = await api('/api/hashars', {
      method: 'POST',
      token: owner.token,
      form: hasharForm({ title: `O'chiriladigan ${RUN}`, items: undefined }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const h = created.data;
    assert.deepEqual(h.items, []);
    assert.equal((await api(h.before_url)).status, 200);

    assert.equal((await api(`/api/hashars/${h.id}`, { method: 'DELETE', token: stranger.token })).status, 403);
    assert.equal((await api(`/api/hashars/${h.id}`, { method: 'DELETE' })).status, 401);

    const del = await api(`/api/hashars/${h.id}`, { method: 'DELETE', token: owner.token });
    assert.equal(del.status, 200);
    assert.deepEqual(del.data, { ok: true });
    assert.equal((await api(`/api/hashars/${h.id}`)).status, 404);
    assert.equal((await api(h.before_url)).status, 404, "R2 dagi rasm o'chirildi");
  });

  test('chunked (Content-Length siz) katta tana → 413, butun tana o\'qilmaydi', async () => {
    const CHUNK = new Uint8Array(256 * 1024).fill(0x61);
    let sent = 0;
    const body = new ReadableStream({
      pull(ctrl) {
        if (sent >= 7 * 1024 * 1024) return ctrl.close();
        sent += CHUNK.byteLength;
        ctrl.enqueue(CHUNK);
      },
    });
    let status;
    try {
      const res = await fetch(`${BASE}/api/hashars`, {
        method: 'POST',
        duplex: 'half', // Node: oqimli tana → Transfer-Encoding: chunked
        headers: {
          authorization: `Bearer ${owner.token}`,
          'content-type': 'multipart/form-data; boundary=----test',
          'cf-connecting-ip': randomIp(),
        },
        body,
      });
      status = res.status;
      await res.arrayBuffer().catch(() => {});
    } catch (err) {
      // Server javobdan keyin ulanishni yopsa, ba'zan fetch xato bilan tugaydi
      status = `fetch xatosi: ${err.cause?.code || err.message}`;
    }
    assert.equal(status, 413);
  });

  test("emoji sarlavha: 'ab🌳' (3 belgi) → 201", async () => {
    const r = await api('/api/hashars', { method: 'POST', token: stranger.token, form: hasharForm({ title: 'ab🌳' }, null) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.title, 'ab🌳');
    assert.equal((await api(`/api/hashars/${r.data.id}`, { method: 'DELETE', token: stranger.token })).status, 200);
  });

  test('rasmsiz yaratish ham mumkin', async () => {
    const r = await api('/api/hashars', { method: 'POST', token: stranger.token, form: hasharForm({ title: `Rasmsiz ${RUN}` }, null) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.before_url, null);
    const del = await api(`/api/hashars/${r.data.id}`, { method: 'DELETE', token: stranger.token });
    assert.equal(del.status, 200);
  });

  test("ro'yxat tartibi: PENDING sana bo'yicha, keyin COMPLETED", async () => {
    const r = await api('/api/hashars');
    const list = r.data;
    assert.ok(list.length <= 300);
    const firstCompleted = list.findIndex((x) => x.status === 'COMPLETED');
    if (firstCompleted >= 0) assert.ok(list.slice(firstCompleted).every((x) => x.status === 'COMPLETED'));
    const pend = list.filter((x) => x.status === 'PENDING').map((x) => x.date_time);
    assert.deepEqual(pend, [...pend].sort());
  });
});

test('qatnashish/chiqish limiti: 30 ta / soat, keyin 429', async () => {
  const owner = await register('Limit Egasi');
  const joiner = await register('Limit Qatnashchi');
  const created = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `Limit ${RUN}` }, null) });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  for (let i = 0; i < 30; i++) {
    const r = await api(`/api/hashars/${id}/join`, { method: i % 2 ? 'DELETE' : 'POST', token: joiner.token });
    assert.equal(r.status, 200, `so'rov ${i + 1}: ${JSON.stringify(r.data)}`);
  }
  const r = await api(`/api/hashars/${id}/join`, { method: 'POST', token: joiner.token });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  // Boshqa foydalanuvchiga ta'sir qilmaydi
  const other = await register('Limit Boshqa');
  assert.equal((await api(`/api/hashars/${id}/join`, { method: 'POST', token: other.token })).status, 200);
  assert.equal((await api(`/api/hashars/${id}`, { method: 'DELETE', token: owner.token })).status, 200);
});

// ---------- 300 lik limit: eski (yakunlanmagan) PENDING'lar kelgusi/bajarilganlarni siqib chiqarmasin ----------
// Eski sanali qatorlarni API orqali yaratib bo'lmaydi — faqat lokal D1 ga `wrangler d1 execute` bilan yoziladi
// (DO rejimida bazaga tashqaridan yozib bo'lmaydi — test o'tkazib yuboriladi).
const CAN_D1_EXEC = IS_LOCAL_SERVER && STORAGE === 'd1' && !process.env.SKIP_D1_EXEC;

function d1Exec(sql) {
  const persist = process.env.D1_PERSIST_TO ? ['--persist-to', process.env.D1_PERSIST_TO] : [];
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'hasharchilar', '--local', ...persist, '--command', sql], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'pipe',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
}

const SKIP_300 = CAN_D1_EXEC ? false : STORAGE === 'do' ? "DO rejimi: wrangler d1 execute yo'q" : 'faqat lokal wrangler dev';
describe("ro'yxat: 300+ eski PENDING bo'lsa ham kelgusi va bajarilganlar ko'rinadi", { skip: SKIP_300 }, () => {
  let owner;
  let upcoming;

  before(async () => {
    owner = await register('Eski Hasharlar');
    const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `Kelgusi ${RUN}` }, null) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    upcoming = r.data;
    // 320 ta o'tmishdagi (2020), hech qachon yakunlanmagan hashar
    d1Exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 320)
       INSERT INTO hashars (creator_id, title, lat, lng, date_time)
       SELECT ${Number(owner.user.id)}, 'Eski ${RUN} ' || i, 41.3, 69.2, printf('2020-01-%02dT09:00', 1 + i % 28) FROM n`,
    );
  });

  after(() => {
    if (owner) d1Exec(`DELETE FROM hashars WHERE creator_id = ${Number(owner.user.id)}`);
  });

  test('GET /api/hashars', async () => {
    // stats ro'yxatdan OLDIN: oradagi yangi yakunlash faqat ro'yxatdagi sonni oshiradi (taqqoslash buzilmaydi)
    const stats = (await api('/api/stats')).data;
    const r = await api('/api/hashars');
    assert.equal(r.status, 200);
    const list = r.data;
    assert.ok(list.length <= 300, `uzunlik ${list.length}`);
    assert.ok(list.some((x) => x.id === upcoming.id), "kelgusi hashar ro'yxatda");
    const completed = list.filter((x) => x.status === 'COMPLETED').length;
    assert.ok(completed >= Math.min(stats.completed, 60), `bajarilganlar: ${completed} / ${stats.completed}`);
    assert.ok(completed >= 1);
    // SPEC tartibi saqlanadi
    const firstCompleted = list.findIndex((x) => x.status === 'COMPLETED');
    assert.ok(list.slice(firstCompleted).every((x) => x.status === 'COMPLETED'));
    const pend = list.filter((x) => x.status === 'PENDING').map((x) => x.date_time);
    assert.deepEqual(pend, [...pend].sort());
  });

  test('?status=PENDING ham kelgusini qaytaradi', async () => {
    const r = await api('/api/hashars?status=PENDING');
    assert.ok(r.data.length <= 300);
    assert.ok(r.data.some((x) => x.id === upcoming.id));
  });
});

test('GET /api/stats', async () => {
  const r = await api('/api/stats');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.data).sort(), ['completed', 'districts', 'hashars', 'upcoming', 'volunteers']);
  for (const k of ['hashars', 'completed', 'volunteers', 'upcoming', 'districts']) assert.equal(typeof r.data[k], 'number', k);
  assert.ok(r.data.upcoming >= 1, 'kelgusi PENDING hasharlar bor');
  assert.ok(r.data.upcoming <= r.data.hashars - r.data.completed);
  assert.ok(r.data.hashars >= 1);
  assert.ok(r.data.completed >= 1);
  assert.ok(r.data.volunteers >= 2);
});

test("GET /api/stats: districts — bir tuman turli yozilsa (katta-kichik harf, apostrof, \"tumani\") bitta", async () => {
  const districts = async () => (await api('/api/stats')).data.districts;
  const setDistrict = async (district) => {
    const u = await register('Tuman Tekshiruv');
    const fd = new FormData();
    fd.append('district', district);
    const r = await api('/api/me/profile', { method: 'POST', token: u.token, form: fd });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  };
  const before = await districts();
  for (const d of [`Tst${RUN} tumani`, `tst${RUN}`, `TST${RUN} Tuman`, `Qo'rg'on${RUN}`, `Qoʻrgʻon${RUN} tumani`, `Qo‘rg‘on${RUN}`]) {
    await setDistrict(d);
  }
  assert.equal(await districts(), before + 2);
});

// APK: CI uni statik assets ichiga qo'yadi (dist/app/hasharchilar.apk + version.json).
// Lokal server shu loyihaning dist/ papkasini beradi: fayl bo'lsa — "mavjud", bo'lmasa — "yo'q" tekshiriladi.
const APP_DIR = fileURLToPath(new URL('../dist/app/', import.meta.url));
const LOCAL_APK = IS_LOCAL_SERVER && existsSync(`${APP_DIR}hasharchilar.apk`) ? readFileSync(`${APP_DIR}hasharchilar.apk`) : null;

test("GET /api/app va /api/app/download (lokal: APK yo'q)", { skip: !IS_LOCAL_SERVER || LOCAL_APK ? "dist/app da APK bor yoki server lokal emas" : false }, async () => {
  const r = await api('/api/app');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { available: false, version: null, versionCode: null, size: null, url: '/api/app/download' });
  const d = await api('/api/app/download');
  assert.equal(d.status, 404);
  assert.equal(typeof d.data.error, 'string', "404 — JSON xato (SPA index.html emas)");
  assert.match(d.headers.get('content-type'), /application\/json/);
});

test('GET /api/app va /api/app/download (statik assets: dist/app/hasharchilar.apk)', { skip: LOCAL_APK ? false : "dist/app/hasharchilar.apk yo'q" }, async () => {
  const info = JSON.parse(readFileSync(`${APP_DIR}version.json`, 'utf8'));
  const r = await api('/api/app');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { available: true, version: info.version, versionCode: info.versionCode || null, size: LOCAL_APK.length, url: '/api/app/download' });
  const d = await api('/api/app/download');
  assert.equal(d.status, 200);
  assert.equal(d.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.equal(d.headers.get('content-disposition'), 'attachment; filename="hasharchilar.apk"');
  assert.ok(d.buf.equals(LOCAL_APK), 'APK baytlari aynan');
  assert.equal(createHash('sha256').update(d.buf).digest('hex'), info.sha256);
  // version.json ham ochiq (CI imzo mosligini shu orqali tekshiradi)
  const v = await api('/app/version.json');
  assert.equal(v.status, 200);
  assert.deepEqual(v.data, info);
});

describe('CORS', () => {
  const preflight = (origin) =>
    fetch(`${BASE}/api/hashars`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    });

  test('preflight https://localhost → 204 + ACAO', async () => {
    const r = await preflight('https://localhost');
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.match(r.headers.get('access-control-allow-headers'), /Authorization/);
    assert.match(r.headers.get('access-control-allow-methods'), /DELETE/);
    assert.match(r.headers.get('vary') || '', /Origin/);
  });

  test("begona origin → ACAO yo'q", async () => {
    const r = await preflight('https://evil.example');
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    const g = await fetch(`${BASE}/api/health`, { headers: { origin: 'https://evil.example' } });
    assert.equal(g.headers.get('access-control-allow-origin'), null);
  });

  test("capacitor://localhost va shu host'ning o'zi ruxsat etiladi", async () => {
    const cap = await fetch(`${BASE}/api/health`, { headers: { origin: 'capacitor://localhost' } });
    assert.equal(cap.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    const self = new URL(BASE).origin;
    const same = await fetch(`${BASE}/api/health`, { headers: { origin: self } });
    assert.equal(same.headers.get('access-control-allow-origin'), self);
  });
});

// =====================================================================================
// v3 (docs/V3_PLAN.md 2-bo'lim): parol almashtirish, kategoriya, joy cheklovi, filtrlar, izohlar,
// profil/avatar, ommaviy profil, reyting, statistika, geo proksi.
// =====================================================================================

const form = (fields, files = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, f] of Object.entries(files)) fd.append(k, new Blob([f.bytes], { type: f.type }), f.name);
  return fd;
};
const PNG_FILE = { bytes: PNG_BEFORE, type: 'image/png', name: 'avatar.png' };
const login = (phone, password, ip) => api('/api/auth/login', { method: 'POST', ip, json: { phone, password } });
const tashkentDay = (days) => tashkentDate(days).slice(0, 10);

describe("v3: parolni almashtirish (POST /api/me/password)", () => {
  test("tokensiz → 401; validatsiya → 400", async () => {
    assert.equal((await api('/api/me/password', { method: 'POST', json: { current_password: 'parol123', new_password: 'yangi-parol' } })).status, 401);
    const u = await register(`Parol ${RUN}`);
    const noCurrent = await api('/api/me/password', { method: 'POST', token: u.token, json: { new_password: 'yangi-parol' } });
    assert.equal(noCurrent.status, 400);
    const short = await api('/api/me/password', { method: 'POST', token: u.token, json: { current_password: u.password, new_password: '123' } });
    assert.equal(short.status, 400);
    const notJson = await api('/api/me/password', { method: 'POST', token: u.token, headers: { 'content-type': 'application/json' }, form: 'buzuq{' });
    assert.equal(notJson.status, 400);
    // Parol o'zgarmadi
    assert.equal((await login(u.phone, u.password)).status, 200);
  });

  test("noto'g'ri joriy parol → 401, sessiya saqlanadi", async () => {
    const u = await register(`Parol ${RUN}`);
    const r = await api('/api/me/password', { method: 'POST', token: u.token, json: { current_password: 'xato-parol', new_password: 'yangi-parol' } });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, "Joriy parol noto'g'ri");
    assert.equal((await api('/api/me', { token: u.token })).status, 200, 'joriy sessiya bekor qilinmaydi');
    assert.equal((await login(u.phone, 'yangi-parol')).status, 401);
    assert.equal((await login(u.phone, u.password)).status, 200);
  });

  test("muvaffaqiyat: eski parol ishlamaydi, yangisi ishlaydi; boshqa sessiyalar bekor, joriysi qoladi", async () => {
    const u = await register(`Parol ${RUN}`);
    const other1 = (await login(u.phone, u.password)).data.token;
    const other2 = (await login(u.phone, u.password)).data.token;
    assert.equal((await api('/api/me', { token: other1 })).status, 200);
    const r = await api('/api/me/password', { method: 'POST', token: u.token, json: { current_password: u.password, new_password: 'yangi-parol-456' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(r.data, { ok: true });
    assert.equal((await api('/api/me', { token: u.token })).status, 200, 'joriy sessiya qoladi');
    assert.equal((await api('/api/me', { token: other1 })).status, 401, 'boshqa sessiya bekor qilindi');
    assert.equal((await api('/api/me', { token: other2 })).status, 401, 'boshqa sessiya bekor qilindi');
    assert.equal((await login(u.phone, u.password)).status, 401, 'eski parol endi ishlamaydi');
    const fresh = await login(u.phone, 'yangi-parol-456');
    assert.equal(fresh.status, 200, 'yangi parol bilan kiriladi');
    assert.equal((await api('/api/me', { token: fresh.data.token })).status, 200);
  });

  test("urinishlar limiti (kirish bilan umumiy, telefon bo'yicha): 10 ta xatodan keyin 429", async () => {
    const u = await register(`Parol ${RUN}`);
    for (let i = 0; i < 10; i++) {
      const r = await api('/api/me/password', { method: 'POST', token: u.token, json: { current_password: `xato-${i}`, new_password: 'yangi-parol' } });
      assert.equal(r.status, 401, `urinish ${i + 1}`);
    }
    const r = await api('/api/me/password', { method: 'POST', token: u.token, json: { current_password: u.password, new_password: 'yangi-parol' } });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal((await login(u.phone, u.password)).status, 429, 'kirish ham shu hisobda');
  });
});

describe("v3: kategoriya va ko'ngillilar chegarasi", () => {
  let owner;
  let a;
  let b;
  let full;

  before(async () => {
    [owner, a, b] = [await register('Chegara Egasi'), await register('Chegara A'), await register('Chegara B')];
  });

  test("yaratish: category + max_volunteers DTO da", async () => {
    const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ category: 'greening', max_volunteers: '2' }, null) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.category, 'greening');
    assert.equal(r.data.max_volunteers, 2);
    assert.equal(r.data.volunteer_count, 1);
    full = r.data;
    const empty = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ category: 'repair', max_volunteers: '' }, null) });
    assert.equal(empty.status, 201);
    assert.equal(empty.data.category, 'repair');
    assert.equal(empty.data.max_volunteers, null);
  });

  test("validatsiya: noto'g'ri kategoriya / chegara → 400", async () => {
    for (const over of [{ category: 'yomon' }, { category: 'CLEANING' }, { max_volunteers: '1' }, { max_volunteers: '1001' },
      { max_volunteers: 'abc' }, { max_volunteers: '2.5' }, { max_volunteers: '-3' }]) {
      const r = await api('/api/hashars', { method: 'POST', token: a.token, form: hasharForm(over, null) });
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.equal(typeof r.data.error, 'string');
    }
  });

  test("to'lgan hashar: qo'shilish 409 'Joy qolmadi'; a'zo qayta qo'shilsa idempotent; joy bo'shasa qo'shiladi", async () => {
    const j1 = await api(`/api/hashars/${full.id}/join`, { method: 'POST', token: a.token });
    assert.equal(j1.status, 200);
    assert.deepEqual(j1.data, { joined: true, volunteer_count: 2 });
    const j2 = await api(`/api/hashars/${full.id}/join`, { method: 'POST', token: b.token });
    assert.equal(j2.status, 409);
    assert.equal(j2.data.error, 'Joy qolmadi');
    const again = await api(`/api/hashars/${full.id}/join`, { method: 'POST', token: a.token });
    assert.equal(again.status, 200, "allaqachon a'zo — 409 emas");
    assert.equal(again.data.volunteer_count, 2);
    const d = await api(`/api/hashars/${full.id}`, { token: b.token });
    assert.equal(d.data.joined, false);
    assert.equal(d.data.volunteer_count, 2);
    assert.equal((await api(`/api/hashars/${full.id}/join`, { method: 'DELETE', token: a.token })).status, 200);
    const j3 = await api(`/api/hashars/${full.id}/join`, { method: 'POST', token: b.token });
    assert.equal(j3.status, 200);
    assert.equal(j3.data.volunteer_count, 2);
  });
});

describe("v3: ro'yxat filtrlari (category, from/to, near + radius_km)", () => {
  const tag = `v3f${RUN}`;
  let h1; // greening, Toshkent markazi, +10 kun
  let h2; // repair, ~11 km shimolda, +20 kun
  let h3; // other, Farg'ona (~230 km), +40 kun
  const list = async (qs) => {
    const r = await api(`/api/hashars?q=${tag}&${qs}`);
    assert.equal(r.status, 200, `${qs}: ${JSON.stringify(r.data)}`);
    return r.data;
  };
  const ids = (arr) => arr.map((x) => x.id);

  before(async () => {
    const u = await register('Filtr Egasi');
    const mk = async (over) => {
      const r = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm({ title: `Filtr ${tag}`, ...over }, null) });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data;
    };
    h1 = await mk({ category: 'greening', lat: '41.3', lng: '69.24', date_time: tashkentDate(10) });
    h2 = await mk({ category: 'repair', lat: '41.4', lng: '69.24', date_time: tashkentDate(20) });
    h3 = await mk({ category: 'other', lat: '40.38', lng: '71.78', date_time: tashkentDate(40) });
  });

  test('category: bitta, bir nechta, noto\'g\'ri → 400', async () => {
    assert.deepEqual(ids(await list('category=greening')), [h1.id]);
    assert.deepEqual(ids(await list('category=greening,repair')), [h1.id, h2.id]);
    assert.deepEqual(ids(await list('category=cleaning')), []);
    assert.deepEqual(ids(await list('')), [h1.id, h2.id, h3.id]);
    assert.equal((await api('/api/hashars?category=yomon')).status, 400);
    assert.equal((await api('/api/hashars?category=greening,yomon')).status, 400);
  });

  test("from / to (YYYY-MM-DD, ikkala chegara ham kiradi)", async () => {
    assert.deepEqual(ids(await list(`from=${tashkentDay(15)}`)), [h2.id, h3.id]);
    assert.deepEqual(ids(await list(`to=${tashkentDay(15)}`)), [h1.id]);
    assert.deepEqual(ids(await list(`from=${tashkentDay(20)}&to=${tashkentDay(20)}`)), [h2.id]);
    assert.deepEqual(ids(await list(`from=${tashkentDay(15)}&to=${tashkentDay(30)}&category=repair`)), [h2.id]);
    for (const qs of [`from=${tashkentDay(30)}&to=${tashkentDay(15)}`, 'from=2027-02-30', 'from=bugun', 'to=2027-1-5', 'from=2027-01-01T00:00']) {
      const r = await api(`/api/hashars?${qs}`);
      assert.equal(r.status, 400, qs);
    }
  });

  test("near + radius_km: radius ichidagilar, eng yaqini birinchi, distance_km bilan", async () => {
    const near = await list('near=41.3,69.24&radius_km=20');
    assert.deepEqual(ids(near), [h1.id, h2.id]);
    assert.equal(near[0].distance_km, 0);
    assert.ok(Math.abs(near[1].distance_km - 11.12) < 0.05, `masofa ${near[1].distance_km}`);
    // Uzoqdan: tartib teskari
    const fromNorth = await list('near=41.45,69.24&radius_km=30');
    assert.deepEqual(ids(fromNorth), [h2.id, h1.id]);
    // Standart radius — 50 km: Farg'ona kirmaydi; 300 km — kiradi va oxirida
    assert.deepEqual(ids(await list('near=41.3,69.24')), [h1.id, h2.id]);
    const wide = await list('near=41.3,69.24&radius_km=300');
    assert.deepEqual(ids(wide), [h1.id, h2.id, h3.id]);
    assert.ok(wide[2].distance_km > 200 && wide[2].distance_km < 260, `Farg'ona ${wide[2].distance_km}`);
    // Boshqa filtrlar bilan birga
    assert.deepEqual(ids(await list('near=41.3,69.24&radius_km=300&category=other')), [h3.id]);
    assert.deepEqual(ids(await list('near=41.3,69.24&radius_km=5')), [h1.id]);
    // near siz distance_km yo'q
    assert.equal((await list('')).every((x) => x.distance_km === undefined), true);
  });

  test("near / radius_km validatsiyasi → 400", async () => {
    for (const qs of ['near=41.3', 'near=abc,def', 'near=91,69', 'near=41,181', 'near=41.3,69.2&radius_km=0',
      'near=41.3,69.2&radius_km=5000', 'near=41.3,69.2&radius_km=-1', 'near=41.3,69.2&radius_km=abc']) {
      const r = await api(`/api/hashars?${qs}`);
      assert.equal(r.status, 400, qs);
    }
  });
});

// Radius ichida 300 dan ko'p hashar: javob sana bo'yicha emas, masofa bo'yicha eng yaqin 300 ta bo'lishi kerak.
// API orqali yaratiladi (D1 va DO rejimida ham ishlaydi): 31 foydalanuvchi × 10 ta (limit 10 / soat).
describe("v3: near — radiusda 300+ hashar bo'lsa ham eng yaqinlari qaytadi", () => {
  const tag = `nr${RUN}`;
  const lat0 = Math.round((38.3 + Math.random()) * 1e4) / 1e4; // Toshkentdan uzoq, tasodifiy nuqta
  const lng0 = Math.round((64.3 + Math.random()) * 1e4) / 1e4;
  const FILL = 310;
  const fill = []; // { id, token }: i-chisi markazdan 0.001 + i·0.00003 daraja (~111 m + i·3.3 m) shimolda
  let target; // aynan markazda, eng kech sana (sana bo'yicha LIMIT bo'lsa birinchi tushib qoladigan)
  const owners = [];
  const near = async (qs) => {
    const r = await api(`/api/hashars?q=${tag}&near=${lat0},${lng0}&${qs}`);
    assert.equal(r.status, 200, `${qs}: ${JSON.stringify(r.data)}`);
    return r.data;
  };

  before(async () => {
    for (let u = 0; u < FILL / 10; u++) {
      const owner = await register(`Yaqin ${u}`);
      owners.push(owner);
      for (let k = 0; k < 10; k++) {
        const i = fill.length;
        const r = await api('/api/hashars', {
          method: 'POST',
          token: owner.token,
          form: hasharForm({ title: `Yaqin ${tag} ${i}`, lat: String(lat0 + 0.001 + i * 0.00003), lng: String(lng0), date_time: '2098-01-01T09:00' }, null),
        });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        fill.push({ id: r.data.id, token: owner.token });
      }
    }
    const t = await register('Aynan Shu Yerda');
    owners.push(t);
    const r = await api('/api/hashars', {
      method: 'POST',
      token: t.token,
      form: hasharForm({ title: `Aynan ${tag}`, lat: String(lat0), lng: String(lng0), date_time: '2099-12-31T09:00' }, null),
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    target = { id: r.data.id, token: t.token };
    // Eng yaqin to'ldiruvchi — COMPLETED (holatlar aralash tartibi)
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    const done = await api(`/api/hashars/${fill[0].id}/complete`, { method: 'POST', token: fill[0].token, form: fd });
    assert.equal(done.status, 200, JSON.stringify(done.data));
  });

  after(async () => {
    for (const h of [target, ...fill.slice(1)]) if (h) await api(`/api/hashars/${h.id}`, { method: 'DELETE', token: h.token });
  });

  test('holat filtrisiz: 0 km dagi birinchi, keyin COMPLETED, aynan eng yaqin 300 ta', async () => {
    const list = await near('radius_km=2');
    assert.equal(list.length, 300);
    assert.equal(list[0].id, target.id, `0 km dagi hashar birinchi: ${JSON.stringify(list[0])}`);
    assert.equal(list[0].distance_km, 0);
    assert.equal(list[1].id, fill[0].id);
    assert.equal(list[1].status, 'COMPLETED');
    assert.deepEqual(list.map((x) => x.id), [target.id, ...fill.slice(0, 299).map((h) => h.id)]);
    const d = list.map((x) => x.distance_km);
    assert.deepEqual(d, [...d].sort((a, b) => a - b), 'masofa bo\'yicha o\'sish');
    // Standart radius (50 km) ham xuddi shu
    assert.deepEqual((await near('')).map((x) => x.id), list.map((x) => x.id));
  });

  test('status=PENDING / COMPLETED', async () => {
    const pend = await near('radius_km=2&status=PENDING');
    assert.equal(pend.length, 300);
    assert.deepEqual(pend.map((x) => x.id), [target.id, ...fill.slice(1, 300).map((h) => h.id)]);
    const comp = await near('radius_km=2&status=COMPLETED');
    assert.deepEqual(comp.map((x) => x.id), [fill[0].id]);
  });

  test('kichik radius: faqat radius ichidagilar', async () => {
    const small = await near('radius_km=0.2');
    // 0.2 km ≈ 0.0018 daraja: markaz + i ≤ 26 (0.001 + 26·0.00003 = 0.00178)
    assert.deepEqual(small.map((x) => x.id), [target.id, ...fill.slice(0, 27).map((h) => h.id)]);
    assert.ok(small.every((x) => x.distance_km <= 0.2));
  });
});

describe('v3: izohlar', () => {
  let owner;
  let other;
  let hashar;
  let first;

  before(async () => {
    owner = await register('Izoh Egasi');
    other = await register('Izoh Mehmon');
    const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({}, null) });
    assert.equal(r.status, 201);
    hashar = r.data;
  });

  test("bo'sh ro'yxat; mavjud bo'lmagan hashar → 404", async () => {
    const r = await api(`/api/hashars/${hashar.id}/comments`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, []);
    assert.equal((await api('/api/hashars/999999999/comments')).status, 404);
    assert.equal((await api('/api/hashars/abc/comments')).status, 404);
  });

  test('yozish: tokensiz 401; validatsiya 400; 404', async () => {
    const path = `/api/hashars/${hashar.id}/comments`;
    assert.equal((await api(path, { method: 'POST', json: { body: 'Salom' } })).status, 401);
    for (const body of ['', '   \n  ', 'x'.repeat(501), '🌳'.repeat(501), 123, null]) {
      const r = await api(path, { method: 'POST', token: other.token, json: { body } });
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 30));
    }
    assert.equal((await api(path, { method: 'POST', token: other.token, json: ['body'] })).status, 400);
    assert.equal((await api('/api/hashars/999999999/comments', { method: 'POST', token: other.token, json: { body: 'Salom' } })).status, 404);
  });

  test('yozish → 201 CommentDTO (matn tozalanadi, 500 belgi = code point)', async () => {
    const r = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: other.token, json: { body: '  Men ham boraman!  ' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    first = r.data;
    assert.equal(typeof first.id, 'number');
    assert.equal(first.body, 'Men ham boraman!');
    assert.ok(first.created_at.endsWith('Z'));
    assert.deepEqual(first.user, { id: other.user.id, name: 'Izoh Mehmon', avatar_url: null });
    assert.equal(first.is_mine, true);
    const emoji = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: owner.token, json: { body: '🌳'.repeat(500) } });
    assert.equal(emoji.status, 201, '500 ta emoji — 500 belgi');
    const multi = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: owner.token, json: { body: 'Birinchi qator\nIkkinchi qator' } });
    assert.equal(multi.status, 201);
    assert.equal(multi.data.body, 'Birinchi qator\nIkkinchi qator');
  });

  test("ro'yxat: eski → yangi, is_mine, comment_count DTO da", async () => {
    const asOther = await api(`/api/hashars/${hashar.id}/comments`, { token: other.token });
    assert.equal(asOther.data.length, 3);
    assert.deepEqual(asOther.data.map((x) => x.id), [...asOther.data.map((x) => x.id)].sort((x, y) => x - y));
    assert.deepEqual(asOther.data.map((x) => x.is_mine), [true, false, false]);
    assert.deepEqual(Object.keys(asOther.data[0]).sort(), ['body', 'created_at', 'id', 'is_mine', 'user']);
    const guest = await api(`/api/hashars/${hashar.id}/comments`);
    assert.ok(guest.data.every((x) => x.is_mine === false));
    assert.ok(!JSON.stringify(guest.data).includes(other.phone), "telefon ko'rinmaydi");
    assert.equal((await api(`/api/hashars/${hashar.id}`)).data.comment_count, 3);
    const inList = (await api(`/api/hashars?q=${encodeURIComponent(hashar.title)}`)).data.find((x) => x.id === hashar.id);
    assert.equal(inList.comment_count, 3);
  });

  test("o'chirish: begona 403, tokensiz 401, muallif → ok, takror 404", async () => {
    const path = `/api/comments/${first.id}`;
    assert.equal((await api(path, { method: 'DELETE' })).status, 401);
    const forbidden = await api(path, { method: 'DELETE', token: owner.token });
    assert.equal(forbidden.status, 403, "hashar egasi ham boshqaning izohini o'chira olmaydi");
    const ok = await api(path, { method: 'DELETE', token: other.token });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { ok: true });
    assert.equal((await api(path, { method: 'DELETE', token: other.token })).status, 404);
    assert.equal((await api('/api/comments/abc', { method: 'DELETE', token: other.token })).status, 404);
    assert.equal((await api(`/api/hashars/${hashar.id}/comments`)).data.length, 2);
  });

  test("hashar o'chirilsa izohlari ham o'chadi", async () => {
    const h = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({}, null) });
    const c1 = await api(`/api/hashars/${h.data.id}/comments`, { method: 'POST', token: other.token, json: { body: 'Vaqtinchalik' } });
    assert.equal(c1.status, 201);
    assert.equal((await api(`/api/hashars/${h.data.id}`, { method: 'DELETE', token: owner.token })).status, 200);
    assert.equal((await api(`/api/hashars/${h.data.id}/comments`)).status, 404);
    assert.equal((await api(`/api/comments/${c1.data.id}`, { method: 'DELETE', token: other.token })).status, 404);
  });

  test('limit: 20 ta / soat, keyin 429', async () => {
    const u = await register('Izoh Limit');
    for (let i = 0; i < 20; i++) {
      const r = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: u.token, json: { body: `Izoh ${i}` } });
      assert.equal(r.status, 201, `izoh ${i + 1}`);
    }
    const r = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: u.token, json: { body: 'Ortiqcha' } });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    // Xato (400) so'rovlar kvotani yemaydi, boshqa foydalanuvchiga ta'sir qilmaydi
    const o = await api(`/api/hashars/${hashar.id}/comments`, { method: 'POST', token: other.token, json: { body: 'Boshqa' } });
    assert.equal(o.status, 201);
  });
});

describe('v3: profil, avatar, ommaviy profil', () => {
  let u;
  let avatar1;

  before(async () => {
    u = await register('Profil Egasi');
  });

  test("ro'yxat/kirish/me javobida bio, district, avatar_url", async () => {
    assert.equal(u.user.bio, '');
    assert.equal(u.user.district, '');
    assert.equal(u.user.avatar_url, null);
    const me = await api('/api/me', { token: u.token });
    for (const k of ['bio', 'district', 'avatar_url']) assert.ok(k in me.data.user, k);
    const l = await login(u.phone, u.password);
    assert.equal(l.data.user.avatar_url, null);
  });

  test('validatsiya: tokensiz 401, bo\'sh forma / uzun bio / tuman / ism / yomon rasm → 400', async () => {
    assert.equal((await api('/api/me/profile', { method: 'POST', form: form({ bio: 'x' }) })).status, 401);
    const cases = [
      form({}),
      form({ bio: 'x'.repeat(301) }),
      form({ district: 'd'.repeat(61) }),
      form({ name: 'A' }),
      form({}, { avatar: { bytes: Buffer.from('salom'), type: 'text/plain', name: 'a.txt' } }),
      form({}, { avatar: { bytes: Buffer.from('soxta png'), type: 'image/png', name: 'a.png' } }),
    ];
    for (const [i, fd] of cases.entries()) {
      const r = await api('/api/me/profile', { method: 'POST', token: u.token, form: fd });
      assert.equal(r.status, 400, `holat ${i}: ${JSON.stringify(r.data)}`);
    }
    const json = await api('/api/me/profile', { method: 'POST', token: u.token, json: { bio: 'x' } });
    assert.equal(json.status, 400, 'faqat multipart / urlencoded');
  });

  test("ism, bio, tuman yangilanadi; yuborilmagan maydon o'zgarmaydi", async () => {
    const r = await api('/api/me/profile', { method: 'POST', token: u.token, form: form({ name: '  Yangi  Ism ', bio: "  Ko'ngilli.\nTozalikni sevaman. ", district: ' Chilonzor ' }) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.user.name, 'Yangi Ism');
    assert.equal(r.data.user.bio, "Ko'ngilli.\nTozalikni sevaman.");
    assert.equal(r.data.user.district, 'Chilonzor');
    assert.equal(r.data.user.phone, u.phone, "o'z profilida telefon bor");
    const only = await api('/api/me/profile', { method: 'POST', token: u.token, form: form({ district: 'Yunusobod' }) });
    assert.equal(only.data.user.name, 'Yangi Ism');
    assert.equal(only.data.user.bio, "Ko'ngilli.\nTozalikni sevaman.");
    assert.equal(only.data.user.district, 'Yunusobod');
    const me = await api('/api/me', { token: u.token });
    assert.equal(me.data.user.district, 'Yunusobod');
    // Bo'sh qiymat — tozalash
    const cleared = await api('/api/me/profile', { method: 'POST', token: u.token, form: form({ district: '' }) });
    assert.equal(cleared.data.user.district, '');
  });

  test('avatar: yuklash → media URL; almashtirish eski faylni o\'chiradi; remove_avatar', async () => {
    const r = await api('/api/me/profile', { method: 'POST', token: u.token, form: form({}, { avatar: PNG_FILE }) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    avatar1 = r.data.user.avatar_url;
    assert.match(avatar1, /^\/api\/media\/avatars\/[0-9a-f-]{36}\.png$/);
    const img = await api(avatar1);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.ok(img.buf.equals(PNG_BEFORE));

    // Hashar DTO va tafsilotdagi ko'ngillilar ro'yxatida ham ko'rinadi
    const h = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm({}, null) });
    assert.equal(h.data.creator.avatar_url, avatar1);
    const d = await api(`/api/hashars/${h.data.id}`);
    assert.equal(d.data.volunteers[0].avatar_url, avatar1);

    const r2 = await api('/api/me/profile', { method: 'POST', token: u.token, form: form({}, { avatar: { bytes: PNG_AFTER, type: 'image/png', name: 'b.png' } }) });
    assert.equal(r2.status, 200);
    const avatar2 = r2.data.user.avatar_url;
    assert.notEqual(avatar2, avatar1);
    assert.equal((await api(avatar2)).status, 200);
    assert.equal((await api(avatar1)).status, 404, "eski avatar R2 dan o'chdi");

    const rm = await api('/api/me/profile', { method: 'POST', token: u.token, form: form({ remove_avatar: '1' }) });
    assert.equal(rm.status, 200);
    assert.equal(rm.data.user.avatar_url, null);
    assert.equal((await api(avatar2)).status, 404, "o'chirilgan avatar R2 dan ham o'chdi");
    assert.equal((await api('/api/me', { token: u.token })).data.user.avatar_url, null);
  });

  test('media: avatars papkasi faqat uuid nomli fayllar', async () => {
    assert.equal((await api('/api/media/avatars/yomon.png')).status, 404);
    assert.equal((await api('/api/media/boshqa/00000000-0000-0000-0000-000000000000.png')).status, 404);
  });

  test("GET /api/users/:id — ommaviy profil, telefon YO'Q", async () => {
    await api('/api/me/profile', { method: 'POST', token: u.token, form: form({ bio: 'Ommaviy bio', district: 'Sergeli' }, { avatar: PNG_FILE }) });
    const r = await api(`/api/users/${u.user.id}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(Object.keys(r.data).sort(), ['avatar_url', 'bio', 'created_at', 'district', 'hashars', 'id', 'name', 'stats']);
    assert.equal(r.data.name, 'Yangi Ism');
    assert.equal(r.data.bio, 'Ommaviy bio');
    assert.equal(r.data.district, 'Sergeli');
    assert.match(r.data.avatar_url, /^\/api\/media\/avatars\//);
    assert.deepEqual(r.data.stats, { created: 1, joined: 0, completed: 0 });
    assert.equal(r.data.hashars.length, 1);
    assert.equal(r.data.hashars[0].creator.id, u.user.id);
    const raw = r.buf.toString('utf8');
    assert.ok(!raw.includes(u.phone) && !raw.includes(u.phone.slice(4)), 'telefon raqami javobda yo\'q');
    // Egasi o'zi ko'rsa ham telefon yo'q
    const self = await api(`/api/users/${u.user.id}`, { token: u.token });
    assert.ok(!self.buf.toString('utf8').includes(u.phone));
    assert.equal(self.data.hashars[0].is_owner, true);
    assert.equal((await api('/api/users/999999999')).status, 404);
    assert.equal((await api('/api/users/abc')).status, 404);
  });
});

describe('v3: reyting (GET /api/leaderboard)', () => {
  const check = (arr) => {
    assert.ok(Array.isArray(arr) && arr.length <= 50);
    for (const [i, e] of arr.entries()) {
      assert.deepEqual(Object.keys(e).sort(), ['checkins', 'completed', 'created', 'joined', 'score', 'user']);
      assert.deepEqual(Object.keys(e.user).sort(), ['avatar_url', 'district', 'id', 'name']);
      // v4: QR davomat bonusi — har bir davomat +5
      assert.equal(e.score, e.completed * 10 + e.joined * 3 + e.created * 5 + e.checkins * 5);
      assert.ok(e.score > 0);
      if (i) assert.ok(arr[i - 1].score >= e.score, 'score kamayish tartibida');
    }
  };

  test("period: all / month / standart; noto'g'ri → 400", async () => {
    for (const qs of ['', '?period=all', '?period=month']) {
      const r = await api(`/api/leaderboard${qs}`);
      assert.equal(r.status, 200, qs);
      check(r.data);
    }
    assert.equal((await api('/api/leaderboard?period=year')).status, 400);
  });

  test('hisob: yaratgan, qatnashgan, yakunlangan', async () => {
    const org = await register('Reyting Tashkilotchi');
    const vol = await register('Reyting Kongilli');
    const h = await api('/api/hashars', { method: 'POST', token: org.token, form: hasharForm({}, null) });
    assert.equal((await api(`/api/hashars/${h.data.id}/join`, { method: 'POST', token: vol.token })).status, 200);
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    assert.equal((await api(`/api/hashars/${h.data.id}/complete`, { method: 'POST', token: org.token, form: fd })).status, 200);
    // org: created 1, completed 1 → 15; vol: joined 1, completed 1 → 13
    for (const period of ['all', 'month']) {
      const r = await api(`/api/leaderboard?period=${period}`);
      const last = r.data[r.data.length - 1];
      const room = (score) => r.data.length < 50 || score > last.score;
      const o = r.data.find((e) => e.user.id === org.user.id);
      const v = r.data.find((e) => e.user.id === vol.user.id);
      if (room(15)) assert.deepEqual(o && { created: o.created, joined: o.joined, completed: o.completed, score: o.score }, { created: 1, joined: 0, completed: 1, score: 15 }, period);
      if (room(13)) assert.deepEqual(v && { created: v.created, joined: v.joined, completed: v.completed, score: v.score }, { created: 0, joined: 1, completed: 1, score: 13 }, period);
      assert.ok(!JSON.stringify(r.data).includes(org.phone), "telefon yo'q");
    }
  });
});

// ---------- Geo proksi ----------
// Server `--var GEO_MOCK:1` bilan ishga tushgan bo'lsa (CI), upstream testlari soxta Nominatim bilan ishlaydi;
// aks holda (haqiqiy Nominatim) faqat tarmoqqa chiqmaydigan validatsiya testlari bajariladi.
const GEO_PROBE = await api('/api/geo/search?q=');
const GEO_MOCK = GEO_PROBE.headers.get('x-geo-source') === 'mock';
const NEED_MOCK = GEO_MOCK ? false : "server GEO_MOCK:1 siz ishga tushgan (haqiqiy Nominatim'ga murojaat qilinmaydi)";

describe('v3: geo proksi', () => {
  test('validatsiya → 400 (upstream ga murojaat qilinmaydi)', async () => {
    assert.equal(GEO_PROBE.status, 400);
    for (const path of ['/api/geo/search', '/api/geo/search?q=a', '/api/geo/search?q=%20%20b%20', `/api/geo/search?q=${'x'.repeat(121)}`,
      '/api/geo/reverse', '/api/geo/reverse?lat=41.3', '/api/geo/reverse?lat=91&lng=69', '/api/geo/reverse?lat=41&lng=181',
      '/api/geo/reverse?lat=abc&lng=69', '/api/geo/reverse?lat=41.3&lng=1e2']) {
      const r = await api(path);
      assert.equal(r.status, 400, path);
      assert.equal(typeof r.data.error, 'string');
    }
  });

  test("search: [{name, display, lat, lng}] ≤ 6; kesh (kichik/katta harf, bo'shliqlar)", { skip: NEED_MOCK }, async () => {
    const q = `Chilonzor ${RUN}`;
    const r = await api(`/api/geo/search?q=${encodeURIComponent(q)}`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.headers.get('x-geo-cache'), 'miss');
    assert.ok(Array.isArray(r.data) && r.data.length >= 1 && r.data.length <= 6);
    for (const x of r.data) {
      assert.deepEqual(Object.keys(x).sort(), ['display', 'lat', 'lng', 'name']);
      assert.equal(typeof x.lat, 'number');
      assert.equal(typeof x.lng, 'number');
    }
    assert.equal(r.data[0].name, `${q} 1`);
    const again = await api(`/api/geo/search?q=${encodeURIComponent(`  chilonzor   ${RUN.toUpperCase()} `)}`);
    assert.equal(again.status, 200);
    assert.equal(again.headers.get('x-geo-cache'), 'hit');
    assert.deepEqual(again.data, r.data);
    const none = await api(`/api/geo/search?q=${encodeURIComponent(`hech-narsa ${RUN}`)}`);
    assert.deepEqual(none.data, []);
  });

  test("upstream xatosi → 502 JSON, keshlanmaydi", { skip: NEED_MOCK }, async () => {
    for (let i = 0; i < 2; i++) {
      const r = await api(`/api/geo/search?q=${encodeURIComponent(`upstream-xato ${RUN}`)}`);
      assert.equal(r.status, 502);
      assert.equal(r.data.error, 'Manzil xizmati vaqtincha ishlamayapti');
    }
    const rev = await api('/api/geo/reverse?lat=-89.5&lng=10');
    assert.equal(rev.status, 502);
    assert.equal(rev.data.error, 'Manzil xizmati vaqtincha ishlamayapti');
  });

  test('reverse: {display, district, city}; 4 xonagacha yaxlitlanib keshlanadi; topilmasa bo\'sh', { skip: NEED_MOCK }, async () => {
    const lat = (35 + rnd(100000) / 10000).toFixed(4);
    const lng = (60 + rnd(100000) / 10000).toFixed(4);
    const r = await api(`/api/geo/reverse?lat=${lat}1&lng=${lng}2`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.headers.get('x-geo-cache'), 'miss');
    assert.deepEqual(Object.keys(r.data).sort(), ['city', 'display', 'district']);
    assert.equal(r.data.district, 'Chilonzor tumani');
    assert.equal(r.data.city, 'Toshkent');
    assert.ok(r.data.display.includes(`${lat}, ${lng}`), r.data.display);
    const again = await api(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    assert.equal(again.headers.get('x-geo-cache'), 'hit');
    assert.deepEqual(again.data, r.data);
    const nothing = await api('/api/geo/reverse?lat=0&lng=0');
    assert.equal(nothing.status, 200);
    assert.deepEqual(nothing.data, { display: '', district: '', city: '' });
  });

  test('limit: IP bo\'yicha 30 ta / daqiqa, keyin 429', { skip: NEED_MOCK }, async () => {
    const ip = randomIp();
    const q = encodeURIComponent(`Limit ${RUN}`);
    // Daqiqa chegarasida hisob nolga tushmasligi uchun oyna boshiga yaqin bo'lsa kutiladi
    if (new Date().getSeconds() > 50) await new Promise((r) => setTimeout(r, (61 - new Date().getSeconds()) * 1000));
    for (let i = 0; i < 30; i++) {
      const r = await api(`/api/geo/search?q=${q}`, { ip });
      assert.equal(r.status, 200, `so'rov ${i + 1}`);
    }
    const r = await api(`/api/geo/search?q=${q}`, { ip });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal((await api(`/api/geo/search?q=${q}`)).status, 200, 'boshqa IP ga ta\'sir qilmaydi');
  });

  // Nominatim: butun ilova uchun ≤ 1 so'rov/soniya — IP limitidan tashqari keshda yo'q so'rovlar umumiy navbatdan o'tadi
  test("umumiy navbat: keshda yo'q so'rovlar orasida ≥ 1.1 s (turli IP lar ham), 3 s da navbat kelmasa — 503", { skip: NEED_MOCK }, async () => {
    const pause = () => new Promise((res) => setTimeout(res, 1300)); // oldingi so'rovlarning navbati bo'shasin
    await pause();
    const t0 = Date.now();
    const three = await Promise.all([0, 1, 2].map((i) => api(`/api/geo/search?q=${encodeURIComponent(`Navbat ${RUN} ${i}`)}`)));
    const elapsed = Date.now() - t0;
    for (const r of three) {
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.headers.get('x-geo-cache'), 'miss');
    }
    assert.ok(elapsed >= 2000, `3 ta miss navbat bilan (≥ 2.2 s) o'tishi kerak edi: ${elapsed} ms`);

    // Kesh hit'i navbat kutmaydi
    const t1 = Date.now();
    const hit = await api(`/api/geo/search?q=${encodeURIComponent(`Navbat ${RUN} 1`)}`);
    assert.equal(hit.headers.get('x-geo-cache'), 'hit');
    assert.ok(Date.now() - t1 < 1000, `hit ${Date.now() - t1} ms`);

    // Bir vaqtda 6 ta yangi so'z: 3 s ichida ko'pi bilan 3 tasi navbatga ulguradi, qolganlari 503 (Retry-After)
    await pause();
    const burst = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => api(`/api/geo/search?q=${encodeURIComponent(`Tirband ${RUN} ${i}`)}`)));
    const ok = burst.filter((r) => r.status === 200);
    const busy = burst.filter((r) => r.status === 503);
    assert.equal(ok.length + busy.length, 6, JSON.stringify(burst.map((r) => [r.status, r.data])));
    assert.ok(ok.length >= 1 && ok.length <= 3, `navbatdan o'tganlar: ${ok.length}`);
    for (const r of busy) {
      assert.equal(r.data.error, "Manzil xizmati band. Bir necha soniyadan so'ng qayta urinib ko'ring");
      assert.ok(Number(r.headers.get('retry-after')) >= 1);
    }
    // 503 bo'lgan so'z keshlanmagan — navbat bo'shagach odatdagidek (miss) javob beradi
    await pause();
    const i503 = burst.findIndex((r) => r.status === 503);
    const again = await api(`/api/geo/search?q=${encodeURIComponent(`Tirband ${RUN} ${i503}`)}`);
    assert.equal(again.status, 200);
    assert.equal(again.headers.get('x-geo-cache'), 'miss');
  });
});

// ---------- v4 (docs/V4_PLAN.md 3–4-bo'limlar) ----------
// `npm run test:api` fayllar ro'yxati package.json da — v4 testlari shu faylning oxirida (v3 testlaridan keyin)
// ulanadi: to'lov (narx, ko'rinish, Payme, Click, qo'lda) va saqlanganlar / bildirishnomalar / QR davomat.
await import('./payments.suite.mjs');
await import('./v4.suite.mjs');
await import('./account.suite.mjs');
await import('./reports.suite.mjs');
