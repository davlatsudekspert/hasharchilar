// v4 qo'shimcha funksiyalari: saqlanganlar, bildirishnomalar markazi, QR davomat (+ reyting bonusi).
// tests/api.test.mjs oxirida ulanadi (npm run test:api). Vaqtga bog'liq holatlar `x-test-now` sarlavhasi bilan
// sinaladi (server faqat EMAIL_MOCK=1 da qabul qiladi).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  PNG_AFTER,
  RUN,
  api,
  asAdmin,
  hasharForm,
  notifications,
  register,
  rnd,
  setFee,
  tashkentInMinutes,
  tashkentToMs,
} from './helpers.mjs';

const WINDOW = 10 * 60 * 1000;
const H = 3600 * 1000;

async function createHashar(owner, over = {}) {
  const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `V4 ${RUN} ${rnd(1e6)}`, ...over }, null) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
const join = (h, u) => api(`/api/hashars/${h.id}/join`, { method: 'POST', token: u.token });
const detail = (h, u) => api(`/api/hashars/${h.id}`, { token: u?.token });
const afterPhoto = () => {
  const fd = new FormData();
  fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
  return fd;
};

// ======================================================================

describe('v4: saqlanganlar (POST/DELETE /api/hashars/:id/save, GET /api/me/saves)', () => {
  let a;
  let b;
  let h;

  before(async () => {
    await setFee(0);
    a = await register(`Saqlovchi A ${RUN}`);
    b = await register(`Saqlovchi B ${RUN}`);
    h = await createHashar(a);
  });

  test('mehmon → 401', async () => {
    assert.equal((await api(`/api/hashars/${h.id}/save`, { method: 'POST' })).status, 401);
    assert.equal((await api(`/api/hashars/${h.id}/save`, { method: 'DELETE' })).status, 401);
    assert.equal((await api('/api/me/saves')).status, 401);
    assert.equal((await detail(h)).data.saved, false);
  });

  test("saqlash (idempotent) → DTO da saved, ro'yxatda saved_at", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await api(`/api/hashars/${h.id}/save`, { method: 'POST', token: b.token });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data, { saved: true });
    }
    assert.equal((await detail(h, b)).data.saved, true);
    assert.equal((await detail(h, a)).data.saved, false, 'boshqa foydalanuvchida saved=false');
    const list = await api(`/api/hashars?q=${encodeURIComponent(h.title)}`, { token: b.token });
    assert.equal(list.data.find((x) => x.id === h.id).saved, true);
    const mine = await api('/api/me/saves', { token: b.token });
    assert.equal(mine.status, 200);
    assert.equal(mine.data[0].id, h.id, 'oxirgi saqlangani birinchi');
    assert.equal(mine.data[0].saved, true);
    assert.match(mine.data[0].saved_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(mine.data.filter((x) => x.id === h.id).length, 1);
    assert.ok(!(await api('/api/me/saves', { token: a.token })).data.some((x) => x.id === h.id));
    for (const q of ['limit=0', 'limit=101', 'offset=abc', 'limit=x']) {
      assert.equal((await api(`/api/me/saves?${q}`, { token: b.token })).status, 400, q);
    }
    assert.equal((await api('/api/me/saves?limit=1&offset=0', { token: b.token })).data.length, 1);
  });

  test("olib tashlash (idempotent); topilmagan hashar 404", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await api(`/api/hashars/${h.id}/save`, { method: 'DELETE', token: b.token });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data, { saved: false });
    }
    assert.equal((await detail(h, b)).data.saved, false);
    assert.ok(!(await api('/api/me/saves', { token: b.token })).data.some((x) => x.id === h.id));
    assert.equal((await api('/api/hashars/999999999/save', { method: 'POST', token: b.token })).status, 404);
    assert.equal((await api('/api/hashars/abc/save', { method: 'POST', token: b.token })).status, 404);
  });

  test("hashar o'chirilsa saqlanganlardan ham ketadi; to'lanmagan begona hashar saqlanmaydi", async () => {
    const h2 = await createHashar(a);
    assert.equal((await api(`/api/hashars/${h2.id}/save`, { method: 'POST', token: b.token })).status, 200);
    assert.equal((await api(`/api/hashars/${h2.id}`, { method: 'DELETE', token: a.token })).status, 200);
    const mine = await api('/api/me/saves', { token: b.token });
    assert.equal(mine.status, 200);
    assert.ok(!mine.data.some((x) => x.id === h2.id));

    await setFee(5000);
    try {
      const hu = await createHashar(a);
      assert.equal(hu.payment_status, 'unpaid');
      assert.equal((await api(`/api/hashars/${hu.id}/save`, { method: 'POST', token: b.token })).status, 404);
      assert.equal((await api(`/api/hashars/${hu.id}/save`, { method: 'POST', token: a.token })).status, 200, "egasi o'zinikini saqlay oladi");
      assert.ok((await api('/api/me/saves', { token: a.token })).data.some((x) => x.id === hu.id));
    } finally {
      await setFee(0);
    }
  });
});

// ======================================================================

describe('v4: bildirishnomalar markazi', () => {
  let owner;
  let v1;
  let v2;
  let h;

  before(async () => {
    await setFee(0);
    owner = await register(`Bildirish egasi ${RUN}`);
    v1 = await register(`Bildirish Bir ${RUN}`);
    v2 = await register(`Bildirish Ikki ${RUN}`);
    h = await createHashar(owner);
  });

  const of = (list, type, extra = () => true) => list.items.filter((x) => x.type === type && x.hashar?.id === h.id && extra(x));

  test('mehmon → 401', async () => {
    assert.equal((await api('/api/me/notifications')).status, 401);
    assert.equal((await api('/api/me/notifications/unread-count')).status, 401);
    assert.equal((await api('/api/me/notifications/read', { method: 'POST', json: { all: true } })).status, 401);
  });

  test("qo'shilish → egasiga 'join' (takroriy qo'shilish/chiqishda dublikat yo'q); o'ziga yuborilmaydi", async () => {
    const before = (await api('/api/me/notifications/unread-count', { token: owner.token })).data.count;
    assert.equal((await join(h, v1)).status, 200);
    const n = await notifications(owner.token);
    const j = of(n, 'join', (x) => x.actor?.id === v1.user.id);
    assert.equal(j.length, 1);
    assert.equal(j[0].read, false);
    assert.equal(j[0].actor.name, v1.user.name);
    assert.equal(j[0].hashar.title, h.title);
    assert.equal(j[0].hashar.deleted, false);
    assert.ok(j[0].text.includes(v1.user.name) && j[0].text.includes(h.title), j[0].text);
    assert.deepEqual(Object.keys(j[0]).sort(), ['actor', 'created_at', 'data', 'hashar', 'id', 'read', 'read_at', 'text', 'type']);
    assert.deepEqual(Object.keys(j[0].actor).sort(), ['avatar_url', 'id', 'name']);
    assert.equal((await api('/api/me/notifications/unread-count', { token: owner.token })).data.count, before + 1);
    assert.equal(n.unread_count, before + 1);
    // Takroriy qo'shilish (idempotent) va chiqib-qaytish — o'qilmagan "join" ko'paymaydi
    assert.equal((await join(h, v1)).status, 200);
    assert.equal((await api(`/api/hashars/${h.id}/join`, { method: 'DELETE', token: v1.token })).status, 200);
    assert.equal((await join(h, v1)).status, 200);
    assert.equal(of(await notifications(owner.token), 'join', (x) => x.actor?.id === v1.user.id).length, 1);
    assert.equal((await notifications(v1.token)).items.filter((x) => x.hashar?.id === h.id).length, 0, "o'ziga yo'q");
    assert.equal((await join(h, v2)).status, 200);
    assert.equal(of(await notifications(owner.token), 'join').length, 2);
  });

  test("izoh → egasi va boshqa qatnashuvchilarga (muallifga emas)", async () => {
    const c1 = await api(`/api/hashars/${h.id}/comments`, { method: 'POST', token: v1.token, json: { body: 'Men belkurak olib kelaman!' } });
    assert.equal(c1.status, 201);
    const forOwner = of(await notifications(owner.token), 'comment');
    assert.equal(forOwner.length, 1);
    assert.equal(forOwner[0].actor.id, v1.user.id);
    assert.equal(forOwner[0].data.excerpt, 'Men belkurak olib kelaman!');
    assert.equal(forOwner[0].data.comment_id, c1.data.id);
    assert.equal(of(await notifications(v2.token), 'comment').length, 1);
    assert.equal(of(await notifications(v1.token), 'comment').length, 0);
    // Egasi yozsa — qatnashuvchilarga, o'ziga emas
    assert.equal((await api(`/api/hashars/${h.id}/comments`, { method: 'POST', token: owner.token, json: { body: 'Rahmat!' } })).status, 201);
    assert.equal(of(await notifications(owner.token), 'comment').length, 1);
    assert.equal(of(await notifications(v1.token), 'comment').length, 1);
    assert.equal(of(await notifications(v2.token), 'comment').length, 2);
  });

  test("yakunlash → qatnashuvchilarga 'completed' (egasiga emas)", async () => {
    assert.equal((await api(`/api/hashars/${h.id}/complete`, { method: 'POST', token: owner.token, form: afterPhoto() })).status, 200);
    for (const u of [v1, v2]) {
      const c = of(await notifications(u.token), 'completed');
      assert.equal(c.length, 1);
      assert.match(c[0].text, /yakunlandi/);
    }
    assert.equal(of(await notifications(owner.token), 'completed').length, 0);
  });

  test("telefon / email bildirishnomalarda yo'q", async () => {
    const r = await api('/api/me/notifications', { token: owner.token });
    const text = r.buf.toString('utf8');
    for (const u of [v1, v2]) {
      assert.ok(!text.includes(u.phone));
      assert.ok(!text.includes(u.email));
    }
    assert.ok(!/"(phone|email)"\s*:/.test(text));
  });

  test("sahifalash: limit, before, has_more, next_before; noto'g'ri qiymatlar 400", async () => {
    const all = await notifications(v2.token, '?limit=50');
    assert.ok(all.items.length >= 3);
    for (let i = 1; i < all.items.length; i++) assert.ok(all.items[i - 1].id > all.items[i].id, 'yangilari birinchi');
    const p1 = await notifications(v2.token, '?limit=1');
    assert.equal(p1.items.length, 1);
    assert.equal(p1.has_more, true);
    assert.equal(p1.next_before, p1.items[0].id);
    const p2 = await notifications(v2.token, `?limit=2&before=${p1.next_before}`);
    assert.deepEqual(p2.items.map((x) => x.id), all.items.slice(1, 3).map((x) => x.id));
    const last = await notifications(v2.token, `?before=${all.items[all.items.length - 1].id}`);
    assert.deepEqual(last.items, []);
    assert.equal(last.has_more, false);
    assert.equal(last.next_before, null);
    for (const q of ['limit=0', 'limit=51', 'limit=abc', 'before=abc', 'before=-1', 'before=0']) {
      assert.equal((await api(`/api/me/notifications?${q}`, { token: v2.token })).status, 400, q);
    }
  });

  test("o'qilgan deb belgilash: ids / all; begonaning bildirishnomasiga ta'sir yo'q", async () => {
    const n = await notifications(v2.token);
    const unread = n.items.filter((x) => !x.read);
    assert.ok(unread.length >= 2);
    const one = await api('/api/me/notifications/read', { method: 'POST', token: v2.token, json: { ids: [unread[0].id] } });
    assert.equal(one.status, 200);
    assert.deepEqual(one.data, { ok: true, updated: 1, unread_count: n.unread_count - 1 });
    const again = await api('/api/me/notifications/read', { method: 'POST', token: v2.token, json: { ids: [unread[0].id] } });
    assert.equal(again.data.updated, 0);
    const marked = (await notifications(v2.token)).items.find((x) => x.id === unread[0].id);
    assert.equal(marked.read, true);
    assert.match(marked.read_at, /Z$/);
    // Begona foydalanuvchi boshqaning ID sini belgilay olmaydi
    const foreign = await api('/api/me/notifications/read', { method: 'POST', token: v1.token, json: { ids: [unread[1].id] } });
    assert.equal(foreign.data.updated, 0);
    assert.equal((await notifications(v2.token)).items.find((x) => x.id === unread[1].id).read, false);
    for (const bad of [{}, { ids: [] }, { ids: ['x'] }, { ids: [0] }, { ids: [1.5] }, { ids: Array.from({ length: 101 }, (_, i) => i + 1) }, { all: 'yes' }, { ids: 5 }]) {
      assert.equal((await api('/api/me/notifications/read', { method: 'POST', token: v2.token, json: bad })).status, 400, JSON.stringify(bad).slice(0, 40));
    }
    const all = await api('/api/me/notifications/read', { method: 'POST', token: v2.token, json: { all: true } });
    assert.equal(all.status, 200);
    assert.equal(all.data.unread_count, 0);
    assert.ok(all.data.updated >= 1);
    assert.deepEqual((await api('/api/me/notifications/unread-count', { token: v2.token })).data, { count: 0 });
  });

  test("hashar o'chirilsa uning bildirishnomalari ham o'chadi", async () => {
    const h2 = await createHashar(owner);
    assert.equal((await join(h2, v1)).status, 200);
    assert.ok((await notifications(owner.token)).items.some((x) => x.hashar?.id === h2.id));
    assert.equal((await api(`/api/hashars/${h2.id}`, { method: 'DELETE', token: owner.token })).status, 200);
    assert.ok(!(await notifications(owner.token)).items.some((x) => x.hashar?.id === h2.id));
  });

  // Regressiya: o'chirilgan (moderatsiya qilingan) izoh matni bildirishnomalardagi parchada qolib ketardi
  test("izoh o'chirilsa (muallif yoki admin) — uning bildirishnomalari (matn parchasi bilan) ham o'chadi", async () => {
    const admin = await asAdmin();
    const h3 = await createHashar(owner);
    for (const u of [v1, v2]) assert.equal((await join(h3, u)).status, 200);
    const comment = async (u, body) => {
      const r = await api(`/api/hashars/${h3.id}/comments`, { method: 'POST', token: u.token, json: { body } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data;
    };
    const byComment = async (u, cid) =>
      (await notifications(u.token, '?limit=50')).items.filter((x) => x.type === 'comment' && x.data.comment_id === cid);
    const unread = async (u) => (await api('/api/me/notifications/unread-count', { token: u.token })).data.count;
    const keep = await comment(v1, 'Bu izoh qoladi');
    const own = await comment(v1, "Muallif o'chiradigan izoh");
    const bad = await comment(v2, "HAQORATLI MATN — moderator o'chiradi");
    for (const [u, cid] of [[owner, own.id], [v2, own.id], [owner, bad.id], [v1, bad.id]]) assert.equal((await byComment(u, cid)).length, 1);
    const before = await unread(owner);
    // Muallif o'zi o'chiradi
    assert.equal((await api(`/api/comments/${own.id}`, { method: 'DELETE', token: v1.token })).status, 200);
    for (const u of [owner, v2]) assert.deepEqual(await byComment(u, own.id), []);
    assert.equal(await unread(owner), before - 1);
    // Administrator moderatsiyasi
    assert.equal((await api(`/api/admin/comments/${bad.id}`, { method: 'DELETE', token: admin.token })).status, 200);
    for (const u of [owner, v1]) assert.deepEqual(await byComment(u, bad.id), []);
    assert.equal(await unread(owner), before - 2);
    for (const u of [owner, v1, v2]) {
      const text = (await api('/api/me/notifications?limit=50', { token: u.token })).buf.toString('utf8');
      assert.ok(!text.includes('HAQORATLI') && !text.includes("Muallif o'chiradigan"), "o'chirilgan matn hech kimda qolmadi");
    }
    // Boshqa izohning bildirishnomalari joyida
    for (const u of [owner, v2]) assert.equal((await byComment(u, keep.id)).length, 1);
    assert.equal((await byComment(owner, keep.id))[0].data.excerpt, 'Bu izoh qoladi');
    // Izohlar ro'yxatida ham faqat qolgani
    assert.deepEqual((await api(`/api/hashars/${h3.id}/comments`)).data.map((x) => x.id), [keep.id]);
  });
});

// ======================================================================

describe('v4: QR davomat (checkin-code, checkin, checkins) va reyting bonusi', () => {
  let owner;
  let v1;
  let v2;
  let v3;
  let v4;
  let stranger;
  let h;
  let T; // hashar boshlanishi (ms)

  before(async () => {
    await setFee(0);
    [owner, v1, v2, v3, v4, stranger] = await Promise.all(
      ['Davomat egasi', 'Davomat Bir', 'Davomat Ikki', 'Davomat Uch', "Davomat To'rt", 'Davomat begona'].map((n) => register(`${n} ${RUN}`)),
    );
    const dt = tashkentInMinutes(120);
    T = tashkentToMs(dt);
    h = await createHashar(owner, { date_time: dt });
    for (const u of [v1, v2, v3, v4]) assert.equal((await join(h, u)).status, 200);
  });

  const code = (opts = {}) => api(`/api/hashars/${h.id}/checkin-code`, { token: owner.token, ...opts });
  const checkin = (u, c, headers = {}) => api(`/api/hashars/${h.id}/checkin`, { method: 'POST', token: u.token, json: { code: c }, headers });

  test("checkin-code: faqat tashkilotchi; shakli", async () => {
    assert.equal((await api(`/api/hashars/${h.id}/checkin-code`)).status, 401);
    assert.equal((await api(`/api/hashars/${h.id}/checkin-code`, { token: v1.token })).status, 403);
    assert.equal((await api('/api/hashars/999999999/checkin-code', { token: owner.token })).status, 404);
    const r = await code();
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(Object.keys(r.data).sort(), ['closes_at', 'code', 'expires_at', 'hashar_id', 'opens_at', 'refresh_in', 'url', 'window_seconds']);
    assert.match(r.data.code, /^\d{6}$/);
    assert.equal(r.data.hashar_id, h.id);
    assert.equal(r.data.window_seconds, 600);
    const exp = Date.parse(r.data.expires_at);
    assert.equal(exp % WINDOW, 0, "oyna chegarasi (10 daqiqa)");
    assert.ok(exp > Date.now() - 5000 && exp <= Date.now() + WINDOW + 5000);
    assert.ok(r.data.refresh_in >= 1 && r.data.refresh_in <= 600);
    assert.ok(r.data.url.endsWith(`/#/hashar/${h.id}?checkin=${r.data.code}`), r.data.url);
    assert.equal(Date.parse(r.data.opens_at), T - 12 * H);
    assert.equal(Date.parse(r.data.closes_at), T + 12 * H);
    // Bir oyna ichida kod o'zgarmaydi
    assert.equal((await code()).data.code, r.data.code);
  });

  test("davomat oynasi: hashar vaqtidan ±12 soat (Toshkent); to'lanmagan — 409", async () => {
    for (const [shift, status] of [[-13 * H, 409], [-11 * H, 200], [11 * H, 200], [13 * H, 409]]) {
      const r = await code({ headers: { 'x-test-now': String(T + shift) } });
      assert.equal(r.status, status, `T${shift / H}h`);
      if (status === 409) assert.equal(r.data.code, 'checkin_closed');
    }
    const far = await createHashar(owner, { date_time: tashkentInMinutes(30 * 24 * 60) });
    const fr = await api(`/api/hashars/${far.id}/checkin-code`, { token: owner.token });
    assert.equal(fr.status, 409);
    assert.equal(fr.data.code, 'checkin_closed');
    assert.equal((await join(far, v1)).status, 200);
    const early = await api(`/api/hashars/${far.id}/checkin`, { method: 'POST', token: v1.token, json: { code: '123456' } });
    assert.equal(early.status, 409);
    assert.equal(early.data.code, 'checkin_closed');
    await setFee(5000);
    try {
      const hu = await createHashar(owner, { date_time: tashkentInMinutes(60) });
      const ur = await api(`/api/hashars/${hu.id}/checkin-code`, { token: owner.token });
      assert.equal(ur.status, 409);
      assert.equal(ur.data.code, 'payment_required');
      assert.equal((await api(`/api/hashars/${hu.id}/checkin-code`, { token: v1.token })).status, 404, "begonaga to'lanmagan hashar yo'q");
    } finally {
      await setFee(0);
    }
  });

  test("checkin: ruxsatlar, noto'g'ri kod, muvaffaqiyat, idempotent", async () => {
    const c = (await code()).data.code;
    assert.equal((await api(`/api/hashars/${h.id}/checkin`, { method: 'POST', json: { code: c } })).status, 401);
    const nj = await checkin(stranger, c);
    assert.equal(nj.status, 403);
    assert.equal(nj.data.code, 'not_joined');
    assert.equal((await checkin(owner, c)).status, 409, "tashkilotchi davomatdan o'tmaydi");
    for (const bad of ['abc', '12345', '1234567', '', null]) assert.equal((await checkin(v1, bad)).status, 400, String(bad));
    const wrong = await checkin(v1, String((Number(c) + 1) % 1e6).padStart(6, '0'));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.data.code, 'checkin_invalid');
    const okr = await checkin(v1, `${c.slice(0, 3)} ${c.slice(3)}`);
    assert.equal(okr.status, 200, JSON.stringify(okr.data));
    assert.equal(okr.data.checked_in, true);
    assert.match(okr.data.checked_in_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const rep = await checkin(v1, c);
    assert.equal(rep.status, 200);
    assert.equal(rep.data.checked_in_at, okr.data.checked_in_at);
    assert.equal(rep.data.already, true);
    // QR dagi havolaning o'zi ham qabul qilinadi
    const url = (await code()).data.url;
    const viaUrl = await checkin(v2, url);
    assert.equal(viaUrl.status, 200, JSON.stringify(viaUrl.data));
  });

  test("DTO: o'z checked_in_at, checked_in_count; tashkilotchi kim kelganini ko'radi", async () => {
    const mine = await detail(h, v1);
    assert.match(mine.data.checked_in_at, /Z$/);
    assert.equal(mine.data.checked_in_count, 2);
    assert.ok(mine.data.volunteers.every((x) => !('checked_in_at' in x)), "qatnashuvchiga boshqalarning davomati ko'rinmaydi");
    assert.equal((await detail(h, v3)).data.checked_in_at, null);
    assert.equal((await detail(h)).data.checked_in_count, 2);
    const own = await detail(h, owner);
    const vol = (u) => own.data.volunteers.find((x) => x.id === u.user.id);
    assert.match(vol(v1).checked_in_at, /Z$/);
    assert.equal(vol(v3).checked_in_at, null);

    assert.equal((await api(`/api/hashars/${h.id}/checkins`)).status, 401);
    assert.equal((await api(`/api/hashars/${h.id}/checkins`, { token: v1.token })).status, 403);
    for (const t of [owner.token, (await asAdmin()).token]) {
      const r = await api(`/api/hashars/${h.id}/checkins`, { token: t });
      assert.equal(r.status, 200);
      assert.equal(r.data.total, 4, 'tashkilotchisiz');
      assert.equal(r.data.checked_in, 2);
      assert.deepEqual(r.data.items.slice(0, 2).map((x) => x.user.id).sort(), [v1.user.id, v2.user.id].sort(), 'kelganlar birinchi');
      assert.deepEqual(Object.keys(r.data.items[0]).sort(), ['checked_in_at', 'joined_at', 'user']);
      assert.ok(!JSON.stringify(r.data).includes(v1.phone));
    }
  });

  test("kod 10 daqiqada yangilanadi: oldingi oyna qabul qilinadi, undan eskisi — yo'q", async () => {
    const X = (Math.floor(Date.now() / WINDOW) + 1) * WINDOW + 1000; // keyingi oyna boshi
    const at = (ms) => ({ 'x-test-now': String(ms) });
    const c0 = (await code({ headers: at(X) })).data.code;
    const c1 = (await code({ headers: at(X + WINDOW) })).data.code;
    assert.match(c1, /^\d{6}$/);
    const prev = await checkin(v3, c0, at(X + WINDOW));
    assert.equal(prev.status, 200, `oldingi oyna kodi: ${JSON.stringify(prev.data)}`);
    const stale = await checkin(v4, c0, at(X + 2 * WINDOW));
    if (c0 !== (await code({ headers: at(X + 2 * WINDOW) })).data.code && c0 !== c1) {
      assert.equal(stale.status, 400, 'ikki oyna oldingi kod eskirgan');
      assert.equal(stale.data.code, 'checkin_invalid');
    }
    // Hali kelmagan oyna kodi ham qabul qilinmaydi
    const future = (await code({ headers: at(X + 5 * WINDOW) })).data.code;
    if (future !== c0 && future !== (await code({ headers: at(X - WINDOW) })).data.code) {
      assert.equal((await checkin(v4, future, at(X))).status, 400);
    }
    assert.equal((await checkin(v4, c0, at(X))).status, 200);
  });

  test("reyting: har bir davomat +5 (checkins)", async () => {
    const r = await api('/api/leaderboard?period=all');
    const e = r.data.find((x) => x.user.id === v1.user.id);
    const last = r.data[r.data.length - 1];
    if (r.data.length < 50 || last.score < 11) {
      assert.ok(e, 'reytingda bor');
      assert.deepEqual({ joined: e.joined, checkins: e.checkins, completed: e.completed, created: e.created, score: e.score },
        { joined: 2, checkins: 1, completed: 0, created: 0, score: 2 * 3 + 5 });
    }
    const m = await api('/api/leaderboard?period=month');
    const em = m.data.find((x) => x.user.id === v2.user.id);
    if (em) assert.equal(em.checkins, 1);
  });
});
