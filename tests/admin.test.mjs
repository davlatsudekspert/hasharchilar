// Admin panel API testi (/api/admin/*) — `wrangler dev` ga qarshi, server ADMIN_PHONES bilan ishga tushgan bo'lishi shart:
//   npx wrangler dev --port 8787 --var ADMIN_PHONES:+998900000099 --var EMAIL_MOCK:1  &&  npm run test:api
// +998900000099 — soxta test raqami (ADMIN_PHONE env bilan boshqasini berish mumkin).
// Qayta ishlaydi: admin hisobi bor bo'lsa kiriladi, qolgan foydalanuvchilar har safar yangi.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADMIN_PHONE, BASE, PNG_AFTER, RUN, adminLogin, api, hasharForm, register } from './helpers.mjs';

// O'tmish sanasini API orqali qo'yib bo'lmaydi — faqat lokal D1 ga `wrangler d1 execute` (DO rejimida o'tkaziladi)
const CAN_D1_EXEC =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && process.env.STORAGE !== 'do' && !process.env.SKIP_D1_EXEC;
function d1Exec(sql) {
  const persist = process.env.D1_PERSIST_TO ? ['--persist-to', process.env.D1_PERSIST_TO] : [];
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'hasharchilar', '--local', ...persist, '--command', sql], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'pipe',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
}

const BLOCKED = 'Hisobingiz bloklangan';


const login = (phone, password) => api('/api/auth/login', { method: 'POST', json: { phone, password } });

describe('Admin panel', () => {
  let admin; // { token, user }
  let plain; // oddiy foydalanuvchi

  before(async () => {
    admin = await adminLogin();
    plain = await register(`Oddiy ${RUN}`);
  });

  test('ADMIN_PHONES orqali admin: is_admin login va /api/me da', async () => {
    assert.equal(
      admin.user.is_admin,
      true,
      `server ADMIN_PHONES siz ishga tushgan: wrangler dev ... --var ADMIN_PHONES:${ADMIN_PHONE}`,
    );
    const me = await api('/api/me', { token: admin.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.is_admin, true);
    assert.equal(plain.user.is_admin, false);
    const pme = await api('/api/me', { token: plain.token });
    assert.equal(pme.data.user.is_admin, false);
  });

  test('mehmon → 401, oddiy foydalanuvchi → 403', async () => {
    const routes = [
      ['GET', '/api/admin/overview'],
      ['GET', '/api/admin/users'],
      ['GET', '/api/admin/hashars'],
      ['POST', `/api/admin/users/${plain.user.id}/block`],
      ['POST', `/api/admin/users/${plain.user.id}/role`],
      ['DELETE', `/api/admin/users/${plain.user.id}`],
      ['DELETE', '/api/admin/hashars/1'],
      ['DELETE', '/api/admin/comments/1'],
    ];
    for (const [method, path] of routes) {
      const g = await api(path, { method, json: method === 'POST' ? { role: 'admin' } : undefined });
      assert.equal(g.status, 401, `${method} ${path} (mehmon)`);
      const u = await api(path, { method, token: plain.token, json: method === 'POST' ? { role: 'admin' } : undefined });
      assert.equal(u.status, 403, `${method} ${path} (oddiy)`);
      assert.equal(typeof u.data.error, 'string');
    }
    // Oddiy foydalanuvchi o'zini admin qila olmadi
    const me = await api('/api/me', { token: plain.token });
    assert.equal(me.data.user.is_admin, false);
  });

  test('overview: shakli', async () => {
    const r = await api('/api/admin/overview', { token: admin.token });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    for (const k of ['users', 'admins', 'blocked', 'hashars', 'pending', 'completed', 'volunteers', 'media', 'comments', 'signups_7d', 'hashars_7d']) {
      assert.equal(typeof r.data[k], 'number', k);
    }
    assert.ok(r.data.users >= 2);
    assert.ok(r.data.admins >= 1);
    assert.equal(r.data.hashars, r.data.pending + r.data.completed);
    assert.ok(Array.isArray(r.data.recent_hashars) && r.data.recent_hashars.length <= 5);
    assert.ok(Array.isArray(r.data.recent_users) && r.data.recent_users.length >= 1 && r.data.recent_users.length <= 5);
    // Eng yangi foydalanuvchi — shu testda ro'yxatdan o'tgani (yoki undan keyingisi)
    assert.ok(r.data.recent_users[0].id >= plain.user.id);
    const u = r.data.recent_users[0];
    for (const k of ['id', 'name', 'phone', 'role', 'is_admin', 'blocked_at', 'created_at', 'created_count', 'joined_count']) assert.ok(k in u, k);
  });

  test("users: ism / telefon bo'yicha qidiruv, LIKE ekranlanadi, limit ≤ 100", async () => {
    const r = await api(`/api/admin/users?q=${encodeURIComponent(`Oddiy ${RUN}`)}`, { token: admin.token });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 1);
    const [u] = r.data.items;
    assert.equal(u.id, plain.user.id);
    assert.equal(u.phone, plain.phone);
    assert.equal(u.role, 'user');
    assert.equal(u.is_admin, false);
    assert.equal(u.blocked_at, null);
    assert.equal(u.created_count, 0);
    assert.equal(u.joined_count, 0);

    // Bo'shliqli raqam qismi: "12 345 67"
    const tail = plain.phone.slice(-7);
    const spaced = `${tail.slice(0, 2)} ${tail.slice(2, 5)} ${tail.slice(5)}`;
    const p = await api(`/api/admin/users?q=${encodeURIComponent(spaced)}`, { token: admin.token });
    assert.ok(p.data.items.some((x) => x.id === plain.user.id), 'telefon bo\'yicha topildi');

    const esc = await api(`/api/admin/users?q=${encodeURIComponent(`%${RUN}`)}`, { token: admin.token });
    assert.equal(esc.data.total, 0, "'%' so'zma-so'z qidiriladi");
    const long = await api(`/api/admin/users?q=${encodeURIComponent('ш'.repeat(100))}`, { token: admin.token });
    assert.equal(long.status, 200, 'uzun qidiruv D1 LIKE limitidan oshmaydi');

    const big = await api('/api/admin/users?limit=1000', { token: admin.token });
    assert.equal(big.status, 200);
    assert.ok(big.data.items.length <= 100);
    const one = await api('/api/admin/users?limit=1&offset=1', { token: admin.token });
    assert.equal(one.data.items.length, 1);
    assert.ok(one.data.total >= 2);
    const bad = await api('/api/admin/users?limit=abc&offset=-5', { token: admin.token });
    assert.equal(bad.status, 200);
  });

  test("bloklash: sessiyalar o'chadi, kirish 403; blokdan chiqarish", async () => {
    const victim = await register(`Bloklanadigan ${RUN}`);
    const b = await api(`/api/admin/users/${victim.user.id}/block`, { method: 'POST', token: admin.token });
    assert.equal(b.status, 200, JSON.stringify(b.data));
    assert.match(b.data.user.blocked_at, /^\d{4}-\d{2}-\d{2}T/);

    // Eski token endi ishlamaydi (sessiyalar o'chirilgan)
    const me = await api('/api/me', { token: victim.token });
    assert.ok([401, 403].includes(me.status), `eski token: ${me.status}`);
    const create = await api('/api/hashars', { method: 'POST', token: victim.token, form: hasharForm({}, null) });
    assert.ok([401, 403].includes(create.status));

    // To'g'ri parol → 403 "Hisobingiz bloklangan"; noto'g'ri parol → baribir 401 (holat oshkor qilinmaydi)
    const l = await login(victim.phone, victim.password);
    assert.equal(l.status, 403);
    assert.equal(l.data.error, BLOCKED);
    const wrong = await login(victim.phone, 'xato-parol');
    assert.equal(wrong.status, 401);

    const list = await api(`/api/admin/users?q=${encodeURIComponent(`Bloklanadigan ${RUN}`)}`, { token: admin.token });
    assert.ok(list.data.items[0].blocked_at);
    const ov = await api('/api/admin/overview', { token: admin.token });
    assert.ok(ov.data.blocked >= 1);

    const u = await api(`/api/admin/users/${victim.user.id}/unblock`, { method: 'POST', token: admin.token });
    assert.equal(u.status, 200);
    assert.equal(u.data.user.blocked_at, null);
    const again = await login(victim.phone, victim.password);
    assert.equal(again.status, 200, JSON.stringify(again.data));
    const me2 = await api('/api/me', { token: again.data.token });
    assert.equal(me2.status, 200);
  });

  test("bloklash: boshqalarning PENDING hasharlaridagi joylar bo'shaydi; o'z hashari va COMPLETED tarixi qoladi", async () => {
    const owner = await register(`Joy egasi ${RUN}`);
    const troll = await register(`Troll ${RUN}`);
    const legit = await register(`Haqiqiy ${RUN}`);
    const mk = async (u, over = {}) => {
      const r = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm(over, null) });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data;
    };
    const small = await mk(owner, { max_volunteers: '2' });
    const done = await mk(owner);
    const trollOwn = await mk(troll);
    for (const h of [small, done]) assert.equal((await api(`/api/hashars/${h.id}/join`, { method: 'POST', token: troll.token })).status, 200);
    const full = await api(`/api/hashars/${small.id}/join`, { method: 'POST', token: legit.token });
    assert.equal(full.status, 409);
    assert.equal(full.data.error, 'Joy qolmadi');
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    assert.equal((await api(`/api/hashars/${done.id}/complete`, { method: 'POST', token: owner.token, form: fd })).status, 200);

    assert.equal((await api(`/api/admin/users/${troll.user.id}/block`, { method: 'POST', token: admin.token })).status, 200);
    const s = await api(`/api/hashars/${small.id}`);
    assert.equal(s.data.volunteer_count, 1, 'joy bo\'shadi');
    assert.deepEqual(s.data.volunteers.map((v) => v.id), [owner.user.id]);
    const j = await api(`/api/hashars/${small.id}/join`, { method: 'POST', token: legit.token });
    assert.equal(j.status, 200, JSON.stringify(j.data));
    assert.equal(j.data.volunteer_count, 2);
    // COMPLETED tarixi va o'z hashari (tashkilotchi qatori) o'zgarmaydi
    const d = await api(`/api/hashars/${done.id}`);
    assert.ok(d.data.volunteers.some((v) => v.id === troll.user.id), 'yakunlangan hashar tarixi qoladi');
    assert.equal(d.data.volunteer_count, 2);
    const t = await api(`/api/hashars/${trollOwn.id}`);
    assert.equal(t.data.volunteer_count, 1);
    assert.deepEqual(t.data.volunteers.map((v) => v.id), [troll.user.id]);

    // Blokdan chiqarilgach qatnashuv tiklanmaydi; qayta qo'shilish — joy bo'lsa
    assert.equal((await api(`/api/admin/users/${troll.user.id}/unblock`, { method: 'POST', token: admin.token })).status, 200);
    const back = await login(troll.phone, troll.password);
    assert.equal(back.status, 200);
    assert.equal((await api(`/api/hashars/${small.id}`)).data.volunteer_count, 2);
    const again = await api(`/api/hashars/${small.id}/join`, { method: 'POST', token: back.data.token });
    assert.equal(again.status, 409);
    assert.equal(again.data.error, 'Joy qolmadi');
  });

  test(
    "bloklash: o'tib ketgan (yakunlanmagan) PENDING hashardagi qatnashuv qoladi, kelgusidagi bo'shaydi",
    { skip: CAN_D1_EXEC ? false : "faqat lokal D1 (wrangler d1 execute)" },
    async () => {
      const owner = await register(`O'tgan egasi ${RUN}`);
      const troll = await register(`O'tgan troll ${RUN}`);
      const mk = async () => {
        const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({}, null) });
        assert.equal(r.status, 201, JSON.stringify(r.data));
        return r.data;
      };
      const past = await mk();
      const ongoing = await mk();
      const future = await mk();
      for (const h of [past, ongoing, future]) {
        assert.equal((await api(`/api/hashars/${h.id}/join`, { method: 'POST', token: troll.token })).status, 200);
      }
      // past — 2 kun oldin (o'tib ketgan), ongoing — 1 soat oldin (hali "Hozir", 3 soat ichida)
      const tk = (ms) => new Date(Date.now() + 5 * 3600e3 + ms).toISOString().slice(0, 16);
      d1Exec(`UPDATE hashars SET date_time = '${tk(-48 * 3600e3)}' WHERE id = ${Number(past.id)}`);
      d1Exec(`UPDATE hashars SET date_time = '${tk(-3600e3)}' WHERE id = ${Number(ongoing.id)}`);

      assert.equal((await api(`/api/admin/users/${troll.user.id}/block`, { method: 'POST', token: admin.token })).status, 200);
      const has = async (h) => (await api(`/api/hashars/${h.id}`)).data.volunteers.some((v) => v.id === troll.user.id);
      assert.equal(await has(past), true, "o'tib ketgan hashardagi qatnashuv qoladi");
      assert.equal(await has(ongoing), false, "3 soat ichidagi hashardan bo'shaydi");
      assert.equal(await has(future), false, "kelgusi hashardan bo'shaydi");
    },
  );

  test('rol: admin qilish → panelga kiradi; oddiy qilish → 403', async () => {
    const u = await register(`Rol ${RUN}`);
    const bad = await api(`/api/admin/users/${u.user.id}/role`, { method: 'POST', token: admin.token, json: { role: 'boss' } });
    assert.equal(bad.status, 400);

    const up = await api(`/api/admin/users/${u.user.id}/role`, { method: 'POST', token: admin.token, json: { role: 'admin' } });
    assert.equal(up.status, 200, JSON.stringify(up.data));
    assert.equal(up.data.user.role, 'admin');
    assert.equal(up.data.user.is_admin, true);
    const me = await api('/api/me', { token: u.token });
    assert.equal(me.data.user.is_admin, true);
    const ov = await api('/api/admin/overview', { token: u.token });
    assert.equal(ov.status, 200);

    // DB-admin ADMIN_PHONES admin'iga tega olmaydi
    const envBlock = await api(`/api/admin/users/${admin.user.id}/block`, { method: 'POST', token: u.token });
    assert.equal(envBlock.status, 409);
    const envDemote = await api(`/api/admin/users/${admin.user.id}/role`, { method: 'POST', token: u.token, json: { role: 'user' } });
    assert.equal(envDemote.status, 409);
    const envDelete = await api(`/api/admin/users/${admin.user.id}`, { method: 'DELETE', token: u.token });
    assert.equal(envDelete.status, 409);
    assert.match(envDelete.data.error, /ADMIN_PHONES/);

    const down = await api(`/api/admin/users/${u.user.id}/role`, { method: 'POST', token: admin.token, json: { role: 'user' } });
    assert.equal(down.status, 200);
    assert.equal(down.data.user.is_admin, false);
    const ov2 = await api('/api/admin/overview', { token: u.token });
    assert.equal(ov2.status, 403);
  });

  test("o'zini himoya: bloklash / rolini o'zgartirish / o'chirish → 409; yo'q foydalanuvchi → 404", async () => {
    const id = admin.user.id;
    const b = await api(`/api/admin/users/${id}/block`, { method: 'POST', token: admin.token });
    assert.equal(b.status, 409);
    assert.equal(typeof b.data.error, 'string');
    const r = await api(`/api/admin/users/${id}/role`, { method: 'POST', token: admin.token, json: { role: 'user' } });
    assert.equal(r.status, 409);
    const d = await api(`/api/admin/users/${id}`, { method: 'DELETE', token: admin.token });
    assert.equal(d.status, 409);
    const me = await api('/api/me', { token: admin.token });
    assert.equal(me.status, 200, 'admin hali ham kirgan');

    const missing = await api('/api/admin/users/999999999/block', { method: 'POST', token: admin.token });
    assert.equal(missing.status, 404);
    const badId = await api('/api/admin/users/abc', { method: 'DELETE', token: admin.token });
    assert.equal(badId.status, 404);
  });

  test("foydalanuvchini o'chirish: hasharlari, rasmlari, qatnashuvlari ham o'chadi", async () => {
    const victim = await register(`O'chiriladigan ${RUN}`);
    const other = await register(`Boshqa ${RUN}`);
    const own = await api('/api/hashars', { method: 'POST', token: victim.token, form: hasharForm({ title: `Qurbon hashari ${RUN}` }) });
    assert.equal(own.status, 201, JSON.stringify(own.data));
    const theirs = await api('/api/hashars', { method: 'POST', token: other.token, form: hasharForm({ title: `Boshqa hashar ${RUN}` }, null) });
    assert.equal(theirs.status, 201);
    // other qurbonning hashariga, qurbon esa other nikiga qo'shiladi
    assert.equal((await api(`/api/hashars/${own.data.id}/join`, { method: 'POST', token: other.token })).status, 200);
    const j = await api(`/api/hashars/${theirs.data.id}/join`, { method: 'POST', token: victim.token });
    assert.equal(j.data.volunteer_count, 2);
    const photo = own.data.before_url;
    assert.equal((await api(photo)).status, 200);
    // v3: avatar va boshqaning hashariga izoh
    const av = new FormData();
    av.append('avatar', new Blob([PNG_AFTER], { type: 'image/png' }), 'a.png');
    const prof = await api('/api/me/profile', { method: 'POST', token: victim.token, form: av });
    assert.equal(prof.status, 200, JSON.stringify(prof.data));
    const avatar = prof.data.user.avatar_url;
    assert.equal((await api(avatar)).status, 200);
    const cm = await api(`/api/hashars/${theirs.data.id}/comments`, { method: 'POST', token: victim.token, json: { body: 'Qurbon izohi' } });
    assert.equal(cm.status, 201);

    const list = await api(`/api/admin/users?q=${encodeURIComponent(`O'chiriladigan ${RUN}`)}`, { token: admin.token });
    assert.equal(list.data.items[0].created_count, 1);
    assert.equal(list.data.items[0].joined_count, 1);

    const d = await api(`/api/admin/users/${victim.user.id}`, { method: 'DELETE', token: admin.token });
    assert.equal(d.status, 200, JSON.stringify(d.data));
    assert.deepEqual(d.data, { ok: true });

    assert.equal((await api(`/api/hashars/${own.data.id}`)).status, 404, "qurbonning hashari o'chdi");
    assert.equal((await api(photo)).status, 404, "rasm R2 dan o'chdi");
    assert.equal((await api(avatar)).status, 404, "avatar R2 dan o'chdi");
    assert.deepEqual((await api(`/api/hashars/${theirs.data.id}/comments`)).data, [], "izohlari o'chdi");
    assert.equal((await api(`/api/users/${victim.user.id}`)).status, 404);
    const t = await api(`/api/hashars/${theirs.data.id}`);
    assert.equal(t.data.volunteer_count, 1, "qatnashuv o'chdi");
    assert.ok(!t.data.volunteers.some((v) => v.id === victim.user.id));
    assert.equal((await api('/api/me', { token: victim.token })).status, 401, "sessiya o'chdi");
    assert.equal((await login(victim.phone, victim.password)).status, 401);
    const after = await api(`/api/admin/users?q=${encodeURIComponent(`O'chiriladigan ${RUN}`)}`, { token: admin.token });
    assert.equal(after.data.total, 0);
    const again = await api(`/api/admin/users/${victim.user.id}`, { method: 'DELETE', token: admin.token });
    assert.equal(again.status, 404);
  });

  test("hasharlar: ro'yxat (holat, qidiruv, creator.phone) va istalgan holatdagisini o'chirish", async () => {
    const owner = await register(`Tashkilotchi ${RUN}`);
    const created = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `Admin o'chiradi ${RUN}` }) });
    assert.equal(created.status, 201);
    const id = created.data.id;
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    const done = await api(`/api/hashars/${id}/complete`, { method: 'POST', token: owner.token, form: fd });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    const urls = [done.data.before_url, done.data.after_url];

    const bad = await api('/api/admin/hashars?status=YOQ', { token: admin.token });
    assert.equal(bad.status, 400);
    const pend = await api(`/api/admin/hashars?status=PENDING&q=${encodeURIComponent(`Admin o'chiradi ${RUN}`)}`, { token: admin.token });
    assert.equal(pend.data.total, 0);
    const l = await api(`/api/admin/hashars?status=COMPLETED&q=${encodeURIComponent(`Admin o'chiradi ${RUN}`)}`, { token: admin.token });
    assert.equal(l.status, 200);
    assert.equal(l.data.total, 1);
    const [h] = l.data.items;
    assert.equal(h.id, id);
    assert.equal(h.status, 'COMPLETED');
    assert.deepEqual(h.creator, { id: owner.user.id, name: `Tashkilotchi ${RUN}`, avatar_url: null, phone: owner.phone });
    assert.equal(h.category, 'cleaning');
    assert.ok(h.before_url && h.after_url);
    // Tashkilotchi ismi bo'yicha ham topiladi
    const byOwner = await api(`/api/admin/hashars?q=${encodeURIComponent(`Tashkilotchi ${RUN}`)}`, { token: admin.token });
    assert.equal(byOwner.data.total, 1);
    const page = await api('/api/admin/hashars?limit=1', { token: admin.token });
    assert.equal(page.data.items.length, 1);

    // Egasi yakunlangan hasharni o'chira olmaydi (409), admin esa o'chiradi
    assert.equal((await api(`/api/hashars/${id}`, { method: 'DELETE', token: owner.token })).status, 409);
    const d = await api(`/api/admin/hashars/${id}`, { method: 'DELETE', token: admin.token });
    assert.equal(d.status, 200, JSON.stringify(d.data));
    assert.equal((await api(`/api/hashars/${id}`)).status, 404);
    for (const u of urls) assert.equal((await api(u)).status, 404, `${u} R2 dan o'chdi`);
    assert.equal((await api(`/api/admin/hashars/${id}`, { method: 'DELETE', token: admin.token })).status, 404);
  });

  test("izohlar: admin istalgan izohni o'chiradi (/api/admin/comments/:id va /api/comments/:id)", async () => {
    const owner = await register(`Izoh egasi ${RUN}`);
    const h = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({}, null) });
    assert.equal(h.status, 201);
    const post = (body) => api(`/api/hashars/${h.data.id}/comments`, { method: 'POST', token: plain.token, json: { body } });
    const c1 = await post('Nojoiz izoh 1');
    const c2 = await post('Nojoiz izoh 2');
    assert.equal(c1.status, 201);
    assert.equal(c2.status, 201);

    const d1 = await api(`/api/admin/comments/${c1.data.id}`, { method: 'DELETE', token: admin.token });
    assert.equal(d1.status, 200, JSON.stringify(d1.data));
    assert.deepEqual(d1.data, { ok: true });
    assert.equal((await api(`/api/admin/comments/${c1.data.id}`, { method: 'DELETE', token: admin.token })).status, 404);
    assert.equal((await api('/api/admin/comments/abc', { method: 'DELETE', token: admin.token })).status, 404);
    // Umumiy marshrut: admin boshqaning izohini ham o'chira oladi
    const d2 = await api(`/api/comments/${c2.data.id}`, { method: 'DELETE', token: admin.token });
    assert.equal(d2.status, 200);
    assert.deepEqual((await api(`/api/hashars/${h.data.id}/comments`)).data, []);
  });

  test("reyting: bloklangan foydalanuvchi ko'rinmaydi", async () => {
    const u = await register(`Reyting blok ${RUN}`);
    const h = await api('/api/hashars', { method: 'POST', token: u.token, form: hasharForm({}, null) });
    assert.equal(h.status, 201);
    const fd = new FormData();
    fd.append('photo', new Blob([PNG_AFTER], { type: 'image/png' }), 'keyin.png');
    assert.equal((await api(`/api/hashars/${h.data.id}/complete`, { method: 'POST', token: u.token, form: fd })).status, 200);
    const before = await api('/api/leaderboard?period=month');
    const last = before.data[before.data.length - 1];
    const room = before.data.length < 50 || last.score < 15;
    if (room) assert.ok(before.data.some((e) => e.user.id === u.user.id), "blokdan oldin reytingda bor");
    assert.equal((await api(`/api/admin/users/${u.user.id}/block`, { method: 'POST', token: admin.token })).status, 200);
    const after = await api('/api/leaderboard?period=month');
    assert.ok(!after.data.some((e) => e.user.id === u.user.id), "bloklangan reytingda yo'q");
  });
});
