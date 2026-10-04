// hasharchilar API testi — `wrangler dev` (lokal D1 yoki Durable Object + R2) ga qarshi.
// Ishga tushirish: npx wrangler dev --port 8787  &&  node --test tests/
// DO rejimi: STORAGE=do (wrangler dev --config wrangler.deploy.json, generatsiya: --storage do).
// Bo'sh bo'lmagan bazada ham qayta ishlaydi: har safar tasodifiy telefonlar va IP lar.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/+$/, '');
const RUN = Math.random().toString(36).slice(2, 8); // shu yugurish uchun noyob belgi
const IS_LOCAL_SERVER = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
const STORAGE = process.env.STORAGE === 'do' ? 'do' : 'd1'; // serverdagi baza turi

// ---------- Yordamchilar ----------

const rnd = (n) => Math.floor(Math.random() * n);
const randomPhone = () => `+99890${String(rnd(1e7)).padStart(7, '0')}`;
const randomIp = () => `10.${rnd(250) + 1}.${rnd(250) + 1}.${rnd(250) + 1}`;

/** Tashkent vaqti (UTC+5) bo'yicha `days` kun keyingi 'YYYY-MM-DDTHH:MM'. */
function tashkentDate(days) {
  return new Date(Date.now() + 5 * 3600e3 + days * 86400e3).toISOString().slice(0, 16);
}

/** Haqiqiy PNG (w×h, bir rang) — zlib + CRC32 bilan yasaladi. */
function makePng(w, h, [r, g, b]) {
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

const PNG_BEFORE = makePng(4, 3, [120, 113, 108]);
const PNG_AFTER = makePng(4, 3, [5, 150, 105]);

/** fetch o'rami: JSON/FormData, token va IP. */
async function api(path, { method = 'GET', token, ip, json, form, headers = {} } = {}) {
  const h = { 'cf-connecting-ip': ip || randomIp(), ...headers };
  if (token) h.authorization = `Bearer ${token}`;
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

/** Yangi foydalanuvchi ro'yxatdan o'tkazadi → { token, user, phone, password }. */
async function register(name = 'Test Foydalanuvchi') {
  const phone = randomPhone();
  const password = 'parol123';
  const r = await api('/api/auth/register', { method: 'POST', json: { name, phone, password } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { token: r.data.token, user: r.data.user, phone, password };
}

/** Hashar yaratish formasi (o'zgartirishlar bilan). */
function hasharForm(over = {}, photo = { bytes: PNG_BEFORE, type: 'image/png', name: 'oldin.png' }) {
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
  let token;

  test("ro'yxat → 201, telefon normallashadi", async () => {
    const local = phone.slice(4); // 9 xonali
    const spaced = `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
    const r = await api('/api/auth/register', { method: 'POST', ip, json: { name: '  Aziz  Test ', phone: spaced, password: 'parol123' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(r.data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.data.user.phone, phone);
    assert.equal(r.data.user.name, 'Aziz Test');
    assert.equal(typeof r.data.user.id, 'number');
    assert.equal(r.data.user.password_hash, undefined);
  });

  test('band telefon → 409', async () => {
    const r = await api('/api/auth/register', { method: 'POST', ip, json: { name: 'Boshqa', phone, password: 'parol123' } });
    assert.equal(r.status, 409);
    assert.ok(r.data.error);
  });

  test("noto'g'ri telefon → 400", async () => {
    const r = await api('/api/auth/register', { method: 'POST', ip, json: { name: 'Test', phone: '12345', password: 'parol123' } });
    assert.equal(r.status, 400);
  });

  test('qisqa parol → 400', async () => {
    const r = await api('/api/auth/register', { method: 'POST', ip, json: { name: 'Test', phone: randomPhone(), password: '123' } });
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
    assert.deepEqual(hashar.creator, { id: owner.user.id, name: 'Ega Testov' });
    assert.equal(hashar.volunteer_count, 1);
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
    assert.deepEqual(before1.data.volunteers, [{ id: owner.user.id, name: 'Ega Testov' }]);

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
    const r = await api('/api/hashars');
    assert.equal(r.status, 200);
    const list = r.data;
    assert.ok(list.length <= 300, `uzunlik ${list.length}`);
    assert.ok(list.some((x) => x.id === upcoming.id), "kelgusi hashar ro'yxatda");
    const stats = (await api('/api/stats')).data;
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
  for (const k of ['hashars', 'completed', 'volunteers']) assert.equal(typeof r.data[k], 'number', k);
  assert.ok(r.data.hashars >= 1);
  assert.ok(r.data.completed >= 1);
  assert.ok(r.data.volunteers >= 2);
});

// APK: CI uni statik assets ichiga qo'yadi (dist/app/hasharchilar.apk + version.json).
// Lokal server shu loyihaning dist/ papkasini beradi: fayl bo'lsa — "mavjud", bo'lmasa — "yo'q" tekshiriladi.
const APP_DIR = fileURLToPath(new URL('../dist/app/', import.meta.url));
const LOCAL_APK = IS_LOCAL_SERVER && existsSync(`${APP_DIR}hasharchilar.apk`) ? readFileSync(`${APP_DIR}hasharchilar.apk`) : null;

test("GET /api/app va /api/app/download (lokal: APK yo'q)", { skip: !IS_LOCAL_SERVER || LOCAL_APK ? "dist/app da APK bor yoki server lokal emas" : false }, async () => {
  const r = await api('/api/app');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { available: false, version: null, size: null, url: '/api/app/download' });
  const d = await api('/api/app/download');
  assert.equal(d.status, 404);
  assert.equal(typeof d.data.error, 'string', "404 — JSON xato (SPA index.html emas)");
  assert.match(d.headers.get('content-type'), /application\/json/);
});

test('GET /api/app va /api/app/download (statik assets: dist/app/hasharchilar.apk)', { skip: LOCAL_APK ? false : "dist/app/hasharchilar.apk yo'q" }, async () => {
  const info = JSON.parse(readFileSync(`${APP_DIR}version.json`, 'utf8'));
  const r = await api('/api/app');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { available: true, version: info.version, size: LOCAL_APK.length, url: '/api/app/download' });
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
