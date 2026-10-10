// Shikoyatlar (UGC moderatsiya) va foydalanuvchilarni bloklash: POST /api/reports, /api/users/:id/block, /api/me/blocks,
// admin /api/admin/reports. tests/api.test.mjs oxirida ulanadi (npm run test:api).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { RUN, api, asAdmin, hasharForm, register, rnd, setFee } from './helpers.mjs';

async function createHashar(owner, over = {}) {
  const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `Shikoyat ${RUN} ${rnd(1e6)}`, ...over }, null) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
const comment = async (h, u, body = `Izoh ${RUN} ${rnd(1e6)}`) => {
  const r = await api(`/api/hashars/${h.id}/comments`, { method: 'POST', token: u.token, json: { body } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
};
const report = (u, json) => api('/api/reports', { method: 'POST', token: u.token, json });
const block = (u, target) => api(`/api/users/${target.user.id}/block`, { method: 'POST', token: u.token });
const unblock = (u, target) => api(`/api/users/${target.user.id}/block`, { method: 'DELETE', token: u.token });
const adminReports = async (admin, query = 'status=all&limit=100') => {
  const r = await api(`/api/admin/reports?${query}`, { token: admin.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
};

describe('shikoyatlar (POST /api/reports)', () => {
  let owner;
  let reporter;
  let hashar;
  let cm;

  before(async () => {
    await setFee(0);
    owner = await register(`Shik Ega ${RUN}`);
    reporter = await register(`Shik Yuboruvchi ${RUN}`);
    hashar = await createHashar(owner);
    cm = await comment(hashar, owner, `Shikoyat qilinadigan izoh ${RUN}`);
  });

  test('tokensiz → 401; noto\'g\'ri maydonlar → 400', async () => {
    assert.equal((await api('/api/reports', { method: 'POST', json: { target_type: 'hashar', target_id: hashar.id, reason: 'spam' } })).status, 401);
    for (const bad of [
      {},
      { target_type: 'xato', target_id: hashar.id, reason: 'spam' },
      { target_type: 'hashar', reason: 'spam' },
      { target_type: 'hashar', target_id: -1, reason: 'spam' },
      { target_type: 'hashar', target_id: 1.5, reason: 'spam' },
      { target_type: 'hashar', target_id: hashar.id },
      { target_type: 'hashar', target_id: hashar.id, reason: 'yomon' },
      { target_type: 'hashar', target_id: hashar.id, reason: 'spam', details: 'x'.repeat(501) },
    ]) {
      const r = await report(reporter, bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.ok(r.data.error);
    }
  });

  test("mavjud bo'lmagan nishon → 404 (hashar, izoh, foydalanuvchi)", async () => {
    for (const t of ['hashar', 'comment', 'user']) {
      const r = await report(reporter, { target_type: t, target_id: 2000000000, reason: 'spam' });
      assert.equal(r.status, 404, t);
    }
  });

  test("o'ziga shikoyat → 400 (hashar, izoh, foydalanuvchi)", async () => {
    assert.equal((await report(owner, { target_type: 'hashar', target_id: hashar.id, reason: 'spam' })).status, 400);
    assert.equal((await report(owner, { target_type: 'comment', target_id: cm.id, reason: 'spam' })).status, 400);
    assert.equal((await report(owner, { target_type: 'user', target_id: owner.user.id, reason: 'spam' })).status, 400);
  });

  test('hashar, izoh va foydalanuvchiga shikoyat → 201; takror → 200 va sabab yangilanadi', async () => {
    const admin = await asAdmin();
    const r1 = await report(reporter, { target_type: 'hashar', target_id: hashar.id, reason: 'spam', details: '  reklama\n\n\n\nko\'p  ' });
    assert.equal(r1.status, 201, JSON.stringify(r1.data));
    assert.equal(r1.data.ok, true);
    assert.ok(Number.isInteger(r1.data.id));
    const r2 = await report(reporter, { target_type: 'hashar', target_id: hashar.id, reason: 'child_safety', details: 'Yangilandi' });
    assert.equal(r2.status, 200, JSON.stringify(r2.data));
    assert.equal(r2.data.id, r1.data.id, 'bir xil shikoyat');
    const c1 = await report(reporter, { target_type: 'comment', target_id: cm.id, reason: 'abuse' });
    assert.equal(c1.status, 201, JSON.stringify(c1.data));
    const u1 = await report(reporter, { target_type: 'user', target_id: owner.user.id, reason: 'child_safety' });
    assert.equal(u1.status, 201, JSON.stringify(u1.data));

    const list = (await adminReports(admin)).items;
    const mine = list.filter((x) => [r1.data.id, c1.data.id, u1.data.id].includes(x.id));
    assert.equal(mine.length, 3, 'takror yangi qator yaratmadi');
    const h = mine.find((x) => x.id === r1.data.id);
    assert.equal(h.reason, 'child_safety');
    assert.equal(h.details, 'Yangilandi');
    assert.equal(h.status, 'open');
    assert.deepEqual(h.reporter, { id: reporter.user.id, name: `Shik Yuboruvchi ${RUN}` });
    assert.equal(h.target.title, hashar.title);
    assert.equal(h.target.hashar_id, hashar.id);
    assert.equal(h.target.user.id, owner.user.id);
    assert.equal(h.count, 1);
    const c = mine.find((x) => x.id === c1.data.id);
    assert.equal(c.target.body, cm.body);
    assert.equal(c.target.hashar_id, hashar.id);
    assert.equal(c.target.comment_id, cm.id);
    const u = mine.find((x) => x.id === u1.data.id);
    assert.equal(u.target.user_name, `Shik Ega ${RUN}`);
  });

  test("boshqa shikoyatchi → alohida qator, count 2; sabab 'other' va bo'sh izoh bilan", async () => {
    const admin = await asAdmin();
    const second = await register(`Shik Ikkinchi ${RUN}`);
    const r = await report(second, { target_type: 'hashar', target_id: hashar.id, reason: 'other', details: '' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const item = (await adminReports(admin)).items.find((x) => x.id === r.data.id);
    assert.equal(item.count, 2);
    assert.equal(item.details, '');
  });

  test("izoh uzunligi 500 belgi (emoji bilan) qabul qilinadi", async () => {
    const u = await register(`Shik Emoji ${RUN}`);
    const r = await report(u, { target_type: 'user', target_id: owner.user.id, reason: 'other', details: '😀'.repeat(500) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  });

  test('boshqa foydalanuvchi to\'lanmagan hasharga shikoyat qila olmaydi (404)', async () => {
    await setFee(5000);
    try {
      const unpaid = await createHashar(owner);
      assert.equal(unpaid.payment_status, 'unpaid');
      assert.equal((await report(reporter, { target_type: 'hashar', target_id: unpaid.id, reason: 'spam' })).status, 404);
    } finally {
      await setFee(0);
    }
  });
});

describe('admin: shikoyatlar ro\'yxati va hal qilish', () => {
  let owner;
  let reporter;
  let hashar;
  let rep;

  before(async () => {
    await setFee(0);
    owner = await register(`Adm Shik Ega ${RUN}`);
    reporter = await register(`Adm Shik Yub ${RUN}`);
    hashar = await createHashar(owner);
    const r = await report(reporter, { target_type: 'hashar', target_id: hashar.id, reason: 'fraud', details: 'Firibgarlik' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    rep = r.data.id;
  });

  test('oddiy foydalanuvchi → 403, mehmon → 401', async () => {
    assert.equal((await api('/api/admin/reports')).status, 401);
    assert.equal((await api('/api/admin/reports', { token: reporter.token })).status, 403);
    assert.equal((await api(`/api/admin/reports/${rep}/resolve`, { method: 'POST', token: reporter.token, json: { status: 'resolved' } })).status, 403);
  });

  test("ro'yxat: holat filtri, open_count, noto'g'ri holat → 400; overview.open_reports", async () => {
    const admin = await asAdmin();
    const open = await adminReports(admin, 'status=open&limit=100');
    assert.ok(open.items.some((x) => x.id === rep));
    assert.ok(open.items.every((x) => x.status === 'open'));
    assert.ok(open.open_count >= 1);
    assert.equal(open.total, open.open_count);
    assert.equal((await api('/api/admin/reports?status=yomon', { token: admin.token })).status, 400);
    const ov = await api('/api/admin/overview', { token: admin.token });
    assert.equal(ov.data.open_reports, open.open_count);
  });

  test('child_safety ochiq shikoyat ro\'yxat boshida', async () => {
    const admin = await asAdmin();
    const h2 = await createHashar(owner);
    const cs = await report(reporter, { target_type: 'hashar', target_id: h2.id, reason: 'child_safety' });
    assert.equal(cs.status, 201);
    const open = await adminReports(admin, 'status=open&limit=100');
    assert.equal(open.items[0].reason, 'child_safety');
    const csIdx = open.items.findIndex((x) => x.id === cs.data.id);
    const plainIdx = open.items.findIndex((x) => x.id === rep);
    assert.ok(csIdx < plainIdx);
  });

  test("hal qilish: noto'g'ri holat 400, mavjud emas 404; resolved/dismissed filtrlarda ko'rinadi", async () => {
    const admin = await asAdmin();
    const post = (id, status) => api(`/api/admin/reports/${id}/resolve`, { method: 'POST', token: admin.token, json: { status } });
    assert.equal((await post(rep, 'open')).status, 400);
    assert.equal((await post(rep, undefined)).status, 400);
    assert.equal((await post(2000000000, 'resolved')).status, 404);
    const ok = await post(rep, 'resolved');
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.deepEqual(ok.data, { ok: true, status: 'resolved' });
    const res = await adminReports(admin, 'status=resolved&limit=100');
    const item = res.items.find((x) => x.id === rep);
    assert.ok(item);
    assert.ok(item.resolved_at);
    assert.ok(!(await adminReports(admin, 'status=open&limit=100')).items.some((x) => x.id === rep));
    assert.equal((await post(rep, 'dismissed')).status, 200);
    assert.ok((await adminReports(admin, 'status=dismissed&limit=100')).items.some((x) => x.id === rep));
    // Hal qilingan shikoyatga takror shikoyat holatni o'zgartirmaydi
    const again = await report(reporter, { target_type: 'hashar', target_id: hashar.id, reason: 'spam' });
    assert.equal(again.status, 200);
    assert.equal(again.data.id, rep);
    const after = (await adminReports(admin)).items.find((x) => x.id === rep);
    assert.equal(after.status, 'dismissed');
    assert.equal(after.reason, 'fraud');
  });

  test("hashar / izoh o'chirilganda ochiq shikoyat yopiladi, ro'yxatda target.deleted", async () => {
    const admin = await asAdmin();
    const h = await createHashar(owner);
    const cm = await comment(h, owner);
    const rh = await report(reporter, { target_type: 'hashar', target_id: h.id, reason: 'spam' });
    const rc = await report(reporter, { target_type: 'comment', target_id: cm.id, reason: 'abuse' });
    assert.equal((await api(`/api/admin/comments/${cm.id}`, { method: 'DELETE', token: admin.token })).status, 200);
    let items = (await adminReports(admin)).items;
    assert.equal(items.find((x) => x.id === rc.data.id).status, 'resolved');
    assert.deepEqual(items.find((x) => x.id === rc.data.id).target, { deleted: true });
    assert.equal(items.find((x) => x.id === rh.data.id).status, 'open');
    assert.equal((await api(`/api/admin/hashars/${h.id}`, { method: 'DELETE', token: admin.token })).status, 200);
    items = (await adminReports(admin)).items;
    assert.equal(items.find((x) => x.id === rh.data.id).status, 'resolved');
    assert.equal(items.find((x) => x.id === rh.data.id).target.deleted, true);
  });
});

describe('foydalanuvchilarni bloklash', () => {
  let a; // bloklovchi
  let b; // bloklanuvchi
  let c; // uchinchi (kuzatuvchi)
  let hashar; // c ning hashari — izohlar uchun
  let bHashar;

  before(async () => {
    await setFee(0);
    a = await register(`Blok A ${RUN}`);
    b = await register(`Blok B ${RUN}`);
    c = await register(`Blok C ${RUN}`);
    hashar = await createHashar(c);
    bHashar = await createHashar(b, { title: `Bloklanuvchi hashari ${RUN} ${rnd(1e6)}` });
  });

  test("tokensiz 401; o'zini bloklash 400; mavjud emas 404", async () => {
    assert.equal((await api(`/api/users/${b.user.id}/block`, { method: 'POST' })).status, 401);
    assert.equal((await api('/api/me/blocks')).status, 401);
    assert.equal((await block(a, a)).status, 400);
    assert.equal((await unblock(a, a)).status, 400);
    assert.equal((await api('/api/users/2000000000/block', { method: 'POST', token: a.token })).status, 404);
    assert.equal((await api('/api/users/2000000000/block', { method: 'DELETE', token: a.token })).status, 404);
  });

  test("bloklangan izoh va hashar: bloklovchidan yashirin, boshqalarga ko'rinadi; blokdan chiqarilgach qaytadi", async () => {
    const cmB = await comment(hashar, b);
    const cmC = await comment(hashar, c);
    const ids = async (viewer) => (await api(`/api/hashars/${hashar.id}/comments`, { token: viewer?.token })).data.map((x) => x.id);
    assert.deepEqual((await ids(a)).sort(), [cmB.id, cmC.id].sort());
    assert.ok((await api(`/api/hashars/${bHashar.id}`, { token: a.token })).data.creator_blocked === false);

    const bl = await block(a, b);
    assert.equal(bl.status, 200, JSON.stringify(bl.data));
    assert.deepEqual(bl.data, { ok: true, blocked: true });
    assert.deepEqual((await block(a, b)).data, { ok: true, blocked: true }, 'idempotent');

    assert.deepEqual(await ids(a), [cmC.id], 'bloklovchi uchun yashirin');
    assert.ok((await ids(c)).includes(cmB.id), 'uchinchi foydalanuvchi ko\'radi');
    assert.ok((await ids(b)).includes(cmB.id), 'bloklangan o\'zi ko\'radi');
    assert.ok((await ids()).includes(cmB.id), 'mehmon ko\'radi');

    // Hashar ro'yxatdan yashirin; to'g'ridan-to'g'ri ochilsa creator_blocked
    const listA = await api('/api/hashars', { token: a.token });
    assert.ok(!listA.data.some((x) => x.id === bHashar.id), "ro'yxatda yo'q");
    assert.ok(listA.data.some((x) => x.id === hashar.id), 'boshqalar joyida');
    const near = await api('/api/hashars?near=41.2995,69.2401&radius_km=5', { token: a.token });
    assert.ok(!near.data.some((x) => x.id === bHashar.id), 'xaritada (near) yo\'q');
    assert.ok((await api('/api/hashars', { token: c.token })).data.some((x) => x.id === bHashar.id), 'boshqaga ko\'rinadi');
    assert.ok((await api('/api/hashars')).data.some((x) => x.id === bHashar.id), 'mehmonga ko\'rinadi');
    const direct = await api(`/api/hashars/${bHashar.id}`, { token: a.token });
    assert.equal(direct.status, 200);
    assert.equal(direct.data.creator_blocked, true);
    assert.equal((await api(`/api/hashars/${bHashar.id}`, { token: c.token })).data.creator_blocked, false);

    // Ommaviy profil: is_blocked
    assert.equal((await api(`/api/users/${b.user.id}`, { token: a.token })).data.is_blocked, true);
    assert.equal((await api(`/api/users/${b.user.id}`, { token: c.token })).data.is_blocked, false);
    assert.equal('is_blocked' in (await api(`/api/users/${b.user.id}`)).data, false, 'mehmonga maydon yo\'q');

    // /me/blocks
    const mine = await api('/api/me/blocks', { token: a.token });
    assert.equal(mine.status, 200);
    assert.equal(mine.data.length, 1);
    assert.equal(mine.data[0].id, b.user.id);
    assert.equal(mine.data[0].name, `Blok B ${RUN}`);
    assert.equal(mine.data[0].avatar_url, null);
    assert.match(mine.data[0].blocked_at, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual((await api('/api/me/blocks', { token: c.token })).data, []);

    // Blokdan chiqarish
    const ub = await unblock(a, b);
    assert.deepEqual(ub.data, { ok: true, blocked: false });
    assert.deepEqual((await unblock(a, b)).data, { ok: true, blocked: false }, 'idempotent');
    assert.deepEqual((await ids(a)).sort(), [cmB.id, cmC.id].sort());
    assert.ok((await api('/api/hashars', { token: a.token })).data.some((x) => x.id === bHashar.id));
    assert.equal((await api(`/api/users/${b.user.id}`, { token: a.token })).data.is_blocked, false);
    assert.deepEqual((await api('/api/me/blocks', { token: a.token })).data, []);
  });
});

describe("hisob o'chirilganda shikoyat va bloklar", () => {
  test("shikoyatchi / bloklovchi / bloklangan / shikoyat nishoni o'chadi — qoldiq qatorlarsiz", async () => {
    await setFee(0);
    const admin = await asAdmin();
    const victim = await register(`O'chuvchi ${RUN}`);
    const other = await register(`Boshqa ${RUN}`);
    const third = await register(`Uchinchi ${RUN}`);
    const vHashar = await createHashar(victim);
    const oHashar = await createHashar(other);
    const vComment = await comment(oHashar, victim);

    // victim → shikoyatlar yuboradi va bloklaydi; boshqalar victim'ga shikoyat qiladi va uni bloklaydi
    const sent = await report(victim, { target_type: 'hashar', target_id: oHashar.id, reason: 'spam' });
    assert.equal(sent.status, 201);
    assert.equal((await block(victim, other)).status, 200);
    const onHashar = await report(other, { target_type: 'hashar', target_id: vHashar.id, reason: 'abuse' });
    const onComment = await report(other, { target_type: 'comment', target_id: vComment.id, reason: 'abuse' });
    const onUser = await report(third, { target_type: 'user', target_id: victim.user.id, reason: 'child_safety' });
    assert.equal((await block(other, victim)).status, 200);
    assert.equal((await block(third, other)).status, 200); // aloqasiz blok saqlanadi

    const before = (await adminReports(admin)).items.map((x) => x.id);
    for (const id of [sent.data.id, onHashar.data.id, onComment.data.id, onUser.data.id]) assert.ok(before.includes(id));

    const del = await api('/api/me/delete', { method: 'POST', token: victim.token, json: { password: victim.password } });
    assert.equal(del.status, 200, JSON.stringify(del.data));

    const items = (await adminReports(admin)).items;
    assert.ok(!items.some((x) => x.id === sent.data.id), "yuborgan shikoyati o'chdi");
    assert.ok(!items.some((x) => x.id === onUser.data.id), "o'ziga qaratilgan shikoyat o'chdi");
    // Kontentiga shikoyatlar yopiladi (nishon yo'q)
    for (const id of [onHashar.data.id, onComment.data.id]) {
      const x = items.find((r) => r.id === id);
      assert.equal(x.status, 'resolved');
      assert.equal(x.target.deleted, true);
    }
    assert.deepEqual((await api('/api/me/blocks', { token: other.token })).data, [], "unga qo'yilgan blok o'chdi");
    assert.equal((await api('/api/me/blocks', { token: third.token })).data.length, 1, 'aloqasiz blok saqlandi');

    // Admin foydalanuvchini o'chirsa ham xuddi shunday
    const v2 = await register(`Admin o'chiradi ${RUN}`);
    await block(v2, other);
    await block(other, v2);
    const r2 = await report(v2, { target_type: 'user', target_id: other.user.id, reason: 'spam' });
    const r3 = await report(other, { target_type: 'user', target_id: v2.user.id, reason: 'spam' });
    const d = await api(`/api/admin/users/${v2.user.id}`, { method: 'DELETE', token: admin.token });
    assert.equal(d.status, 200, JSON.stringify(d.data));
    const after = (await adminReports(admin)).items;
    assert.ok(!after.some((x) => x.id === r2.data.id || x.id === r3.data.id));
    assert.deepEqual((await api('/api/me/blocks', { token: other.token })).data, []);
    // Hisob o'chirilgandan keyin ham hammasi ishlayveradi (yetim qatorlar xato bermaydi)
    assert.equal((await api('/api/admin/overview', { token: admin.token })).status, 200);
    assert.equal((await api(`/api/hashars/${oHashar.id}/comments`, { token: other.token })).status, 200);
  });
});
