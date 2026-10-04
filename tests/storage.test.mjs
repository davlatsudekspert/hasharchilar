// Baza qatlami testlari: SQL ajratuvchi, migratsiyalar ro'yxati, wrangler-config va
// lokal `wrangler dev` (fixture Worker) ichida — HasharDB Durable Object adapteri haqiqiy lokal D1 bilan
// AYNAN bir xil natija / xato matni qaytarishi, batch atomarligi, migratsiyalar bir marta qo'llanishi
// va keyingi migratsiyalar ma'lumotli bazada ham qo'llanishi.
// Server oldindan ishga tushirilmaydi — test o'zi vaqtinchalik papkada wrangler dev ochadi.
// Ishga tushirish: npm run test:storage
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSql } from '../worker/sql-split.js';
import { buildDeployConfig, readConfig, stripJsonc } from '../scripts/wrangler-config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = readConfig(join(ROOT, 'wrangler.jsonc'));
const MIGRATION_FILES = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

// ---------- SQL ajratuvchi ----------

describe('splitSql', () => {
  test("oddiy ';' bo'yicha", () => {
    assert.deepEqual(splitSql('SELECT 1; SELECT 2;'), ['SELECT 1', 'SELECT 2']);
    assert.deepEqual(splitSql('SELECT 1'), ['SELECT 1']);
    assert.deepEqual(splitSql('  ;; \n ; '), []);
  });

  test("tirnoq ichidagi ';' va ekranlangan tirnoq", () => {
    const sql = `INSERT INTO t VALUES ('a;b', 'it''s; ok'); SELECT "x;y", \`p;q\`, [r;s] FROM t;`;
    assert.deepEqual(splitSql(sql), [
      "INSERT INTO t VALUES ('a;b', 'it''s; ok')",
      'SELECT "x;y", `p;q`, [r;s] FROM t',
    ]);
  });

  test("izohdagi ';' hisobga olinmaydi, faqat izohli qism tashlanadi", () => {
    const sql = "-- bosh; izoh\nSELECT 1; /* blok; izoh */ SELECT 2 -- oxiri; izoh\n; -- yakuniy; izoh\n/* faqat izoh; */";
    const parts = splitSql(sql);
    assert.equal(parts.length, 2);
    assert.match(parts[0], /SELECT 1$/);
    assert.match(parts[1], /^\/\* blok; izoh \*\/ SELECT 2 -- oxiri; izoh$/);
  });

  test('CREATE TRIGGER ... BEGIN ... END bitta so\'rov (ichida CASE ... END)', () => {
    const sql = `CREATE TRIGGER tr AFTER INSERT ON t BEGIN
      UPDATE t SET x = CASE WHEN NEW.y > 0 THEN 1 ELSE 0 END WHERE id = NEW.id;
      INSERT INTO log VALUES ('end;');
    END;
    SELECT CASE WHEN 1 THEN 'a' END; SELECT 3`;
    const parts = splitSql(sql);
    assert.equal(parts.length, 3);
    assert.match(parts[0], /^CREATE TRIGGER[\s\S]*END$/);
    assert.equal(parts[1], "SELECT CASE WHEN 1 THEN 'a' END");
    assert.equal(parts[2], 'SELECT 3');
  });

  test('migrations/0001_init.sql: 6 jadval + 6 indeks', () => {
    const parts = splitSql(readFileSync(join(ROOT, 'migrations/0001_init.sql'), 'utf8'));
    assert.equal(parts.length, 12);
    assert.equal(parts.filter((p) => /CREATE TABLE/.test(p)).length, 6);
    assert.equal(parts.filter((p) => /CREATE INDEX/.test(p)).length, 6);
  });
});

// ---------- Migratsiyalar ro'yxati ----------

test("worker/migrations.js barcha migrations/*.sql ni tartib bilan o'z ichiga oladi", () => {
  const files = MIGRATION_FILES;
  const src = readFileSync(join(ROOT, 'worker/migrations.js'), 'utf8');
  const imported = [...src.matchAll(/from '\.\.\/migrations\/([^']+\.sql)'/g)].map((m) => m[1]);
  const named = [...src.matchAll(/name: '([^']+\.sql)'/g)].map((m) => m[1]);
  assert.deepEqual(imported, files, 'import qilingan fayllar');
  assert.deepEqual(named, files, 'MIGRATIONS nomlari (D1 dagi kabi nom bo\'yicha tartib)');
});

// ---------- wrangler-config ----------

describe('scripts/wrangler-config.mjs', () => {
  test("stripJsonc: izohlar va oxirgi vergullar; satr ichidagi // ga tegilmaydi", () => {
    const text = '{\n  // izoh\n  "url": "https://a.b/c//d", /* blok */\n  "a": [1, 2,],\n  "s": "x /* y */ z",\n}\n';
    assert.deepEqual(JSON.parse(stripJsonc(text)), { url: 'https://a.b/c//d', a: [1, 2], s: 'x /* y */ z' });
  });

  test('wrangler.jsonc: Worker nomi, assets, DO, D1 placeholder', () => {
    assert.equal(CONFIG.name, 'hasharchilar-api');
    assert.equal(CONFIG.workers_dev, true);
    assert.deepEqual(CONFIG.assets, {
      directory: './dist',
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
      run_worker_first: ['/api/*'],
    });
    assert.deepEqual(CONFIG.durable_objects.bindings, [{ name: 'HASHAR_DB', class_name: 'HasharDB' }]);
    assert.deepEqual(CONFIG.migrations, [{ tag: 'v1', new_sqlite_classes: ['HasharDB'] }]);
    assert.equal(CONFIG.d1_databases[0].database_id, 'REPLACE_WITH_D1_DATABASE_ID');
    assert.deepEqual(CONFIG.r2_buckets, [{ binding: 'PHOTOS', bucket_name: 'hasharchilar-photos' }]);
  });

  test('buildDeployConfig: do → d1_databases yo\'q; d1 → database_id', () => {
    const d = buildDeployConfig(CONFIG, { storage: 'do' });
    assert.equal(d.d1_databases, undefined);
    assert.deepEqual(d.durable_objects, CONFIG.durable_objects);
    const id = '0f2b1a6e-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
    const x = buildDeployConfig(CONFIG, { storage: 'd1', d1Id: id.toUpperCase() });
    assert.equal(x.d1_databases[0].database_id, id);
    assert.equal(CONFIG.d1_databases[0].database_id, 'REPLACE_WITH_D1_DATABASE_ID', "asl obyekt o'zgarmaydi");
    assert.throws(() => buildDeployConfig(CONFIG, { storage: 'd1', d1Id: 'yomon' }), /UUID/);
    assert.throws(() => buildDeployConfig(CONFIG, { storage: 'kv' }), /--storage/);
  });

  test("CLI: wrangler.deploy.json o'sha papkaga yoziladi", () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-wcfg-'));
    try {
      copyFileSync(join(ROOT, 'wrangler.jsonc'), join(dir, 'wrangler.jsonc'));
      const script = join(ROOT, 'scripts/wrangler-config.mjs');
      execFileSync(process.execPath, [script, '--config', join(dir, 'wrangler.jsonc'), '--storage', 'do'], { stdio: 'pipe' });
      const out = JSON.parse(readFileSync(join(dir, 'wrangler.deploy.json'), 'utf8'));
      assert.equal(out.name, 'hasharchilar-api');
      assert.equal(out.d1_databases, undefined);
      assert.equal(out.main, 'worker/index.js', "nisbiy yo'llar o'zgarmaydi");
      const name = execFileSync(process.execPath, [script, '--config', join(dir, 'wrangler.jsonc'), '--print', 'name'], { encoding: 'utf8' });
      assert.equal(name.trim(), 'hasharchilar-api');
      assert.throws(() => execFileSync(process.execPath, [script, '--config', join(dir, 'wrangler.jsonc'), '--storage', 'd1'], { stdio: 'pipe' }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------- wrangler dev (fixture): D1 va HasharDB adapteri solishtiriladi ----------

const WRANGLER = join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

/** Bo'sh TCP port. */
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

/**
 * tests/fixtures/storage-worker.mjs ni lokal wrangler dev da ishga tushiradi (D1 + HasharDB, `dir` da saqlanadi).
 * Natija: { url, stop() }.
 */
async function startFixture(dir) {
  const cfg = join(dir, 'wrangler.json');
  writeFileSync(
    cfg,
    JSON.stringify({
      name: 'hasharchilar-storage-test',
      main: join(ROOT, 'tests/fixtures/storage-worker.mjs'),
      compatibility_date: CONFIG.compatibility_date,
      rules: CONFIG.rules,
      d1_databases: [{ binding: 'D1', database_name: 'storage-test', database_id: 'storage-test' }],
      // + UpgradeDB: migratsiyalarni bosqichma-bosqich qo'llash (yangilanish testi)
      durable_objects: { bindings: [...CONFIG.durable_objects.bindings, { name: 'UPGRADE_DB', class_name: 'UpgradeDB' }] },
      migrations: [{ tag: 'v1', new_sqlite_classes: ['HasharDB', 'UpgradeDB'] }],
    }),
  );
  const [port, inspector] = [await freePort(), await freePort()];
  const args = [WRANGLER, 'dev', '--config', cfg, '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(inspector), '--persist-to', join(dir, 'state'), '--log-level', 'warn'];
  const child = spawn(process.execPath, args, {
    cwd: dir,
    detached: true, // butun guruh (wrangler + workerd) birga to'xtatiladi
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
      // allaqachon to'xtagan
    }
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // to'xtagan
    }
  };
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {
      // hali tayyor emas
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await stop();
  throw new Error(`wrangler dev ishga tushmadi:\n${log.slice(-3000)}`);
}

async function call(server, target, ops, name) {
  const res = await fetch(server.url, { method: 'POST', body: JSON.stringify({ target, ops, name }) });
  assert.equal(res.status, 200);
  return res.json();
}

const META_KEYS = ['changed_db', 'changes', 'duration', 'last_row_id', 'rows_read', 'rows_written', 'served_by', 'size_after'];

/** Natijadan solishtiriladigan qism: results/qiymat, success, meta (vaqt/hajm/xizmat nomisiz). */
function comparable(r) {
  if (!r.ok) return { error: r.error };
  const v = r.value;
  const norm = (x) => {
    if (!x || typeof x !== 'object' || !('meta' in x)) return x;
    assert.deepEqual(Object.keys(x.meta).sort(), META_KEYS, 'meta maydonlari D1 niki bilan bir xil');
    const { changes, last_row_id, changed_db, rows_read, rows_written } = x.meta;
    return { success: x.success, results: x.results, meta: { changes, last_row_id, changed_db, rows_read, rows_written } };
  };
  return { value: Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'meta' in v[0] ? v.map(norm) : norm(v) };
}

const U = (phone, name = 'Test') => ({ sql: "INSERT INTO users (phone, name, password_hash) VALUES (?1, ?2, 'x') RETURNING id, phone, name", params: [phone, name] });
const H = (creator, title, extra = {}) => ({
  sql: 'INSERT INTO hashars (creator_id, title, lat, lng, date_time, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  params: [creator, title, extra.lat ?? 41.3, 69.2, extra.dt ?? '2027-01-01T09:00', extra.status ?? 'PENDING', extra.completed ?? null],
});

// Har bir amal ikkala bazada ham bir xil tartibda bajariladi
const SCENARIO = [
  { kind: 'migrate' },
  { kind: 'all', ...U('+998900000001', 'Aziz') },
  { kind: 'all', ...U('+998900000002', 'Malika') },
  // UNIQUE buzilishi (auth.js /UNIQUE/ bo'yicha 409 ga aylantiradi)
  { kind: 'all', ...U('+998900000001', 'Takror') },
  // first(): qator / ustun / topilmagan ustun / bo'sh natija
  { kind: 'first', sql: 'SELECT id, name, phone FROM users WHERE phone = ?1', params: ['+998900000002'] },
  { kind: 'first', sql: 'SELECT name FROM users WHERE id = ?1', params: [1], col: 'name' },
  { kind: 'first', sql: 'SELECT name FROM users WHERE id = ?1', params: [1], col: 'yoq' },
  { kind: 'first', sql: 'SELECT name FROM users WHERE id = ?1', params: [999] },
  // CHECK buzilishi (hashars.js /CHECK constraint failed/ bo'yicha 400)
  { kind: 'run', ...H(1, 'ab') },
  { kind: 'run', ...H(1, 'Hashar bir') },
  { kind: 'run', ...H(2, 'Hashar ikki', { dt: '2027-02-01T09:00' }) },
  { kind: 'run', ...H(2, 'Yakunlangan', { status: 'COMPLETED', completed: '2026-09-01 10:00:00' }) },
  // Takroriy ?1 va anonim ? parametrlar
  { kind: 'all', sql: 'SELECT id, title FROM hashars WHERE creator_id = ?1 OR ?1 IS NULL ORDER BY id', params: [2] },
  { kind: 'all', sql: "SELECT COUNT(*) AS n, ? AS tag FROM hashars WHERE status = ?", params: ['t', 'PENDING'] },
  // UPDATE — bir nechta qator, meta.changes
  { kind: 'run', sql: "UPDATE hashars SET description = 'x' WHERE status = 'PENDING'" },
  { kind: 'run', sql: 'DELETE FROM hashars WHERE id = ?1', params: [12345] },
  // raw()
  { kind: 'raw', sql: 'SELECT id, title FROM hashars ORDER BY id' },
  { kind: 'raw', sql: 'SELECT id, title FROM hashars ORDER BY id LIMIT 1', options: { columnNames: true } },
  // Bir xil nomli ustunlar (oxirgisi qoladi)
  { kind: 'all', sql: 'SELECT 1 AS a, 2 AS a' },
  // batch: muvaffaqiyatli (RETURNING va keyingi so'rov oldingisini ko'radi)
  {
    kind: 'batch',
    stmts: [
      { sql: 'INSERT INTO volunteers (hashar_id, user_id) VALUES (?1, ?2) RETURNING id', params: [1, 1] },
      { sql: 'INSERT INTO volunteers (hashar_id, user_id) VALUES ((SELECT MAX(id) FROM hashars WHERE creator_id = ?1), ?1)', params: [2] },
      { sql: 'SELECT COUNT(*) AS n FROM volunteers' },
    ],
  },
  // batch atomarligi: ikkinchi so'rov xato → birinchisi ham bekor
  { kind: 'batch', stmts: [U('+998900000003', 'Atomar'), U('+998900000001', 'Takror')] },
  { kind: 'first', sql: "SELECT COUNT(*) AS n FROM users WHERE phone = '+998900000003'", col: 'n' },
  // INSERT OR IGNORE (join idempotent) — changes 0
  { kind: 'run', sql: 'INSERT OR IGNORE INTO volunteers (hashar_id, user_id) VALUES (?1, ?2)', params: [1, 1] },
  // Rate limit UPSERT ... RETURNING
  ...[1, 2].map(() => ({
    kind: 'first',
    sql: `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
          ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate_limits.window_start = excluded.window_start
            THEN rate_limits.count + 1 ELSE 1 END, window_start = excluded.window_start RETURNING count`,
    params: ['auth:test', 1000],
  })),
  // Tashqi kalit: mavjud bo'lmagan hashar
  { kind: 'run', sql: 'INSERT INTO volunteers (hashar_id, user_id) VALUES (?1, ?2)', params: [999999, 1] },
  // ON DELETE CASCADE: hashar o'chsa qatnashuvchilar
  { kind: 'run', sql: 'DELETE FROM hashars WHERE id = ?1', params: [1] },
  { kind: 'first', sql: 'SELECT COUNT(*) AS n FROM volunteers WHERE hashar_id = ?1', params: [1], col: 'n' },
  // bind() turlari
  { kind: 'bind', value: true },
  { kind: 'bind', value: '__undefined__' },
  // Sintaksis xatosi
  { kind: 'all', sql: 'SELEKT 1' },
];

describe('HasharDB (Durable Object) adapteri = D1', () => {
  let dir;
  let server;
  let d1;
  let dobj;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hc-storage-'));
    server = await startFixture(dir);
    d1 = await call(server, 'd1', SCENARIO);
    dobj = await call(server, 'do', SCENARIO);
  });

  after(async () => {
    await server?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('har bir amal: natija / meta / xato matni bir xil', () => {
    assert.equal(dobj.length, SCENARIO.length);
    for (const [i, op] of SCENARIO.entries()) {
      assert.deepEqual(comparable(dobj[i]), comparable(d1[i]), `#${i} ${op.kind} ${op.sql || ''}`);
    }
  });

  test("xato matnlari worker kodidagi regexp'larga mos", () => {
    const err = (i) => dobj[i].error;
    assert.match(err(3), /^D1_ERROR: UNIQUE constraint failed: users\.phone/);
    assert.match(err(8), /^D1_ERROR: CHECK constraint failed/);
    assert.match(err(6), /^D1_COLUMN_NOTFOUND: Column not found \(yoq\)/);
    assert.match(dobj[SCENARIO.length - 2].error, /^D1_TYPE_ERROR: Type 'undefined' not supported/);
  });

  test('qiymatlar: first, raw, batch, changes', () => {
    assert.deepEqual(dobj[4].value, { id: 2, name: 'Malika', phone: '+998900000002' });
    assert.equal(dobj[5].value, 'Aziz');
    assert.equal(dobj[7].value, null);
    assert.equal(dobj[9].value.meta.changes, 1);
    assert.equal(dobj[9].value.meta.last_row_id, 1);
    assert.equal(dobj[14].value.meta.changes, 2, 'UPDATE 2 qator');
    assert.deepEqual(dobj[17].value, [['id', 'title'], [1, 'Hashar bir']]);
    assert.deepEqual(dobj[18].value.results, [{ a: 2 }]);
    const [ins, , cnt] = dobj[19].value;
    assert.deepEqual(ins.results, [{ id: 1 }]);
    assert.deepEqual(cnt.results, [{ n: 2 }]);
  });

  test("batch atomar: xato bo'lsa oldingi so'rovlar ham bekor qilinadi", () => {
    assert.match(dobj[20].error, /UNIQUE constraint failed/);
    assert.equal(dobj[21].value, 0);
    assert.equal(d1[21].value, 0);
  });

  test('tashqi kalitlar va ON DELETE CASCADE ikkala rejimda ham ishlaydi', () => {
    const fk = SCENARIO.findIndex((op) => op.params?.[0] === 999999);
    assert.match(dobj[fk].error, /FOREIGN KEY constraint failed/);
    assert.equal(dobj[fk + 2].value, 0, "hashar o'chganda volunteers ham o'chdi");
  });

  test("migratsiyalar jadvali: har biri bir marta, tartib bilan", async () => {
    const [r] = await call(server, 'do', [{ kind: 'all', sql: 'SELECT name FROM _migrations ORDER BY name' }]);
    assert.deepEqual(r.value.results, MIGRATION_FILES.map((name) => ({ name })));
  });
});

describe("HasharDB: qayta ishga tushganda migratsiya takrorlanmaydi, ma'lumot saqlanadi", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'hc-do-'));
  });

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('ikki marta ishga tushirish (bir xil --persist-to)', async () => {
    const s1 = await startFixture(dir);
    let first;
    try {
      first = await call(s1, 'do', [
        { kind: 'all', ...U('+998901234567', 'Saqlanadi') },
        { kind: 'all', sql: 'SELECT name, applied_at FROM _migrations' },
      ], 'persist');
    } finally {
      await s1.stop();
    }
    assert.equal(first[0].ok, true, JSON.stringify(first[0]));
    assert.equal(first[1].value.results.length, MIGRATION_FILES.length);

    const s2 = await startFixture(dir);
    let second;
    try {
      second = await call(s2, 'do', [
        { kind: 'all', sql: 'SELECT name, applied_at FROM _migrations' },
        { kind: 'first', sql: 'SELECT name FROM users WHERE phone = ?1', params: ['+998901234567'], col: 'name' },
      ], 'persist');
    } finally {
      await s2.stop();
    }
    assert.deepEqual(second[0].value.results, first[1].value.results, "_migrations o'zgarmadi (qayta qo'llanmadi)");
    assert.equal(second[1].value, 'Saqlanadi', "ma'lumot saqlandi");
  });
});

// ---------- DO migratsiyalari to'la bazada ----------
// DO rejimida migratsiya deploy'dan KEYIN, birinchi so'rovda production ma'lumotlari ustida qo'llanadi
// (D1 dagi kabi deploy'dan oldin emas). Bo'sh bazada o'tib, to'la bazada yiqiladigan migratsiya
// (masalan, DEFAULT siz NOT NULL ustun) barcha baza so'rovlarini 500 ga aylantiradi — shu yerda ushlanadi.

// seed.sql da yo'q jadvallar uchun qo'shimcha qatorlar
const EXTRA_ROWS = `
INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('test-token-hash', 1, datetime('now', '+90 days'));
INSERT INTO rate_limits (key, window_start, count) VALUES ('auth:127.0.0.1', 1000, 3);
`;

async function upgrade(server, body) {
  const res = await fetch(server.url, { method: 'POST', body: JSON.stringify({ target: 'upgrade', ...body }) });
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
}

describe("DO migratsiyalari: har bir keyingi migratsiya ma'lumotli bazada ham qo'llanadi", () => {
  let dir;
  let server;
  const seed = readFileSync(join(ROOT, 'seed.sql'), 'utf8') + EXTRA_ROWS;
  const files = MIGRATION_FILES;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'hc-upgrade-'));
    server = await startFixture(dir);
  });

  after(async () => {
    await server?.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("0001 dan keyin namuna ma'lumot → qolgan migratsiyalar birma-bir", async () => {
    // seed.sql eng yangi sxemaga yozilgan bo'lishi mumkin: u qo'llanadigan eng erta bosqichdan boshlanadi
    let checked = 0;
    for (let k = 1; k <= files.length; k++) {
      const r = await upgrade(server, { name: `real-${k}`, before: k, seed });
      if (r.seedError) continue;
      for (const [table, n] of Object.entries(r.rowsBefore)) assert.ok(n > 0, `${table} bo'sh (k=${k})`);
      assert.deepEqual(r.steps.map((s) => s.name), files.slice(k), `k=${k}: qolgan migratsiyalar`);
      for (const s of r.steps) assert.ok(s.ok, `${s.name} ma'lumotli bazada yiqildi: ${s.error}`);
      for (const [table, n] of Object.entries(r.rowsBefore)) {
        assert.ok(r.rowsAfter[table] >= n, `${table}: qatorlar yo'qoldi (${n} → ${r.rowsAfter[table]})`);
      }
      checked++;
    }
    assert.ok(checked > 0, "seed.sql hech bir bosqichda qo'llanmadi");
  });

  test("tekshiruvning o'zi: to'la bazada yiqiladigan migratsiya ushlanadi, ma'lumot buzilmaydi", async () => {
    const bad = { name: '9999_bad.sql', sql: 'ALTER TABLE hashars ADD COLUMN category TEXT NOT NULL;' };
    // Bo'sh bazada o'tadi (CI dagi toza wrangler dev buni ko'rmasdi) ...
    const empty = await upgrade(server, { name: 'bad-empty', before: files.length, seed: '', extra: [bad] });
    assert.deepEqual(empty.steps, [{ name: bad.name, ok: true }]);
    // ... ma'lumotli bazada esa yiqiladi; tranzaksiya bekor qilinadi
    const full = await upgrade(server, { name: 'bad-full', before: files.length, seed, extra: [bad] });
    assert.equal(full.steps.length, 1);
    assert.equal(full.steps[0].ok, false);
    assert.match(full.steps[0].error, /NOT NULL/);
    assert.deepEqual(full.rowsAfter, full.rowsBefore);
  });
});
