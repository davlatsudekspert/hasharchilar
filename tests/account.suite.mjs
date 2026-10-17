// Hisobni o'chirish (POST /api/me/delete): parol bilan tasdiqlash, barcha ma'lumotlar o'chadi, qayta ro'yxatdan o'tish.
// tests/api.test.mjs oxirida ulanadi (npm run test:api).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASE, RUN, api, hasharForm, register, rnd } from './helpers.mjs';

// Eski (olib tashlangan to'lov funksiyasidan qolgan) payments qatorlarini faqat lokal D1 ga yozish va o'qish mumkin
const CAN_D1_EXEC =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && process.env.STORAGE !== 'do' && !process.env.SKIP_D1_EXEC;
function d1Exec(sql) {
  const persist = process.env.D1_PERSIST_TO ? ['--persist-to', process.env.D1_PERSIST_TO] : [];
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'hasharchilar', '--local', ...persist, '--json', '--command', sql], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
}

const login = (login, password) => api('/api/auth/login', { method: 'POST', json: { login, password } });
const del = (token, password) => api('/api/me/delete', { method: 'POST', token, json: { password } });

async function createHashar(owner, over = {}) {
  const r = await api('/api/hashars', { method: 'POST', token: owner.token, form: hasharForm({ title: `Hisob ${RUN} ${rnd(1e6)}`, ...over }) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}

describe("hisobni o'chirish (POST /api/me/delete)", () => {
  test("tokensiz → 401; parolsiz → 400; noto'g'ri parol → 401 va hisob saqlanadi", async () => {
    assert.equal((await api('/api/me/delete', { method: 'POST', json: { password: 'parol123' } })).status, 401);
    const u = await register(`O'chirish ${RUN}`);
    assert.equal((await api('/api/me/delete', { method: 'POST', token: u.token, json: {} })).status, 400);
    const bad = await del(u.token, 'xato-parol');
    assert.equal(bad.status, 401);
    assert.equal(bad.data.error, "Parol noto'g'ri");
    assert.equal((await api('/api/me', { token: u.token })).status, 200, 'sessiya saqlanadi');
    assert.equal((await login(u.phone, u.password)).status, 200, 'hisob joyida');
  });

  test("to'g'ri parol: hisob, hasharlar, izoh va qatnashuv o'chadi; boshqalarniki qoladi; qayta ro'yxatdan o'tiladi", async () => {
    const del1 = await register(`Ketuvchi ${RUN}`);
    const other = await register(`Qoluvchi ${RUN}`);
    const mine = await createHashar(del1);
    const theirs = await createHashar(other);
    // Ketuvchi boshqaning hasharida qatnashadi va izoh qoldiradi; boshqa foydalanuvchi ketuvchining hasharida qatnashadi
    assert.equal((await api(`/api/hashars/${theirs.id}/join`, { method: 'POST', token: del1.token })).status, 200);
    const cm = await api(`/api/hashars/${theirs.id}/comments`, { method: 'POST', token: del1.token, json: { body: "Men ham boraman" } });
    assert.equal(cm.status, 201, JSON.stringify(cm.data));
    assert.equal((await api(`/api/hashars/${mine.id}/join`, { method: 'POST', token: other.token })).status, 200);
    assert.equal((await api(`/api/hashars/${theirs.id}/save`, { method: 'POST', token: del1.token })).status, 200);
    const before = (await api(`/api/hashars/${theirs.id}`)).data.volunteer_count; // egasi + ketuvchi

    const r = await del(del1.token, del1.password);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual(r.data, { ok: true });

    // Token ishlamaydi, qayta kirib bo'lmaydi
    assert.equal((await api('/api/me', { token: del1.token })).status, 401);
    assert.equal((await login(del1.phone, del1.password)).status, 401);
    assert.equal((await login(del1.email, del1.password)).status, 401);
    // Ketuvchining hashari yo'q; boshqaning hashari qoladi, qatnashuv va izoh o'chgan
    assert.equal((await api(`/api/hashars/${mine.id}`)).status, 404);
    const t = await api(`/api/hashars/${theirs.id}`);
    assert.equal(t.status, 200);
    assert.equal(t.data.volunteer_count, before - 1, "qatnashuv o'chdi");
    const comments = await api(`/api/hashars/${theirs.id}/comments`);
    assert.equal(comments.status, 200);
    assert.equal((comments.data.comments || comments.data.items || comments.data).length, 0, "izoh o'chdi");
    assert.equal((await api(`/api/users/${del1.user.id}`)).status, 404);
    assert.equal((await api('/api/me', { token: other.token })).status, 200, 'boshqa foydalanuvchi ta\'sirlanmaydi');

    // Xuddi shu telefon va email bilan qayta ro'yxatdan o'tish mumkin
    const again = await register(`Qaytgan ${RUN}`, { phone: del1.phone, email: del1.email, password: 'yangi-parol-1' });
    assert.notEqual(again.user.id, del1.user.id);
    assert.equal((await login(del1.phone, 'yangi-parol-1')).status, 200);
  });

  test("eski payments qatorlari ham o'chadi (moliyaviy yozuv saqlanmaydi)", { skip: CAN_D1_EXEC ? false : 'faqat lokal D1' }, async () => {
    const u = await register(`Eski to'lov ${RUN}`);
    const h = await createHashar(u);
    const keep = await register(`Eski to'lov qoluvchi ${RUN}`);
    const hk = await createHashar(keep);
    d1Exec(`INSERT INTO payments (hashar_id, user_id, provider, amount, state) VALUES (${h.id}, ${u.user.id}, 'manual', 500000, 1), (${hk.id}, ${keep.user.id}, 'manual', 500000, 1)`);
    // Lokal `wrangler d1 execute` dan keyin dev-server ulanishi bir zum uzilishi mumkin ("fetch failed", so'rov serverga
    // yetmaydi) — shuning uchun so'rov qayta uriniladi (ulanish darajasidagi xatoda hisob hali o'chmagan bo'ladi)
    let res;
    for (let i = 0; i < 5 && !res; i++) {
      res = await del(u.token, u.password).catch(() => null);
      if (!res) await new Promise((r) => setTimeout(r, 1500));
    }
    assert.equal(res?.status, 200, JSON.stringify(res?.data));
    const rows = JSON.parse(d1Exec(`SELECT user_id, COUNT(*) AS n FROM payments WHERE user_id IN (${u.user.id}, ${keep.user.id}) GROUP BY user_id`))[0].results;
    assert.deepEqual(rows, [{ user_id: keep.user.id, n: 1 }], "o'chirilgan hisobning payments qatori yo'q, boshqaniki qoladi");
  });
});
