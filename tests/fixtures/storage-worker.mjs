// FAQAT tests/storage.test.mjs uchun (vaqtinchalik wrangler dev da ishlaydi, deploy qilinmaydi).
// Bir xil so'rovlarni haqiqiy lokal D1 (env.D1) va HasharDB adapteri (env.HASHAR_DB) da bajarib,
// natija yoki xato matnini qaytaradi — test ularni solishtiradi.
import { DurableObject } from 'cloudflare:workers';
import { DoDatabase } from '../../worker/d1-adapter.js';
import { applyMigrations, HasharDB } from '../../worker/do-db.js';
import { MIGRATIONS } from '../../worker/migrations.js';
import { splitSql } from '../../worker/sql-split.js';

export { HasharDB };

/**
 * Yangilanish (upgrade) testi uchun DO: migratsiyalar avtomatik qo'llanmaydi. Production'dagi kabi —
 * avval dastlabki migratsiyalar, so'ng ma'lumot, keyin qolgan migratsiyalar TO'LA jadvallarga birma-bir.
 */
export class UpgradeDB extends DurableObject {
  upgrade({ migrations, before, seed, checks = [] }) {
    const storage = this.ctx.storage;
    const sql = storage.sql;
    applyMigrations(storage, migrations.slice(0, before));
    try {
      storage.transactionSync(() => {
        for (const s of splitSql(seed)) sql.exec(s);
      });
    } catch (err) {
      return { seedError: String(err?.message ?? err) };
    }
    const count = () => {
      const tables = sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'")
        .toArray()
        .map((r) => r.name);
      return Object.fromEntries(tables.map((t) => [t, sql.exec(`SELECT COUNT(*) AS n FROM "${t}"`).one().n]));
    };
    const rowsBefore = count();
    const steps = [];
    for (let i = before; i < migrations.length; i++) {
      try {
        applyMigrations(storage, migrations.slice(0, i + 1));
        steps.push({ name: migrations[i].name, ok: true });
      } catch (err) {
        steps.push({ name: migrations[i].name, ok: false, error: String(err?.message ?? err) });
        break;
      }
    }
    // Yangilanishdan keyingi tekshiruv so'rovlari (masalan, yangi ustunlarning DEFAULT qiymatlari)
    const checked = checks.map((q) => {
      try {
        return { rows: sql.exec(q).toArray() };
      } catch (err) {
        return { error: String(err?.message ?? err) };
      }
    });
    return { rowsBefore, rowsAfter: count(), steps, checks: checked };
  }
}

const stmt = (db, s) => db.prepare(s.sql).bind(...(s.params || []));

async function runOp(db, target, op) {
  switch (op.kind) {
    case 'migrate':
      // DO o'zi (konstruktorda) qo'llaydi; D1 ga — xuddi shu migratsiyalar
      if (target === 'd1') for (const m of MIGRATIONS) await db.batch(splitSql(m.sql).map((sql) => db.prepare(sql)));
      return null;
    case 'all':
      return stmt(db, op).all();
    case 'run':
      return stmt(db, op).run();
    case 'first':
      return op.col === undefined ? stmt(db, op).first() : stmt(db, op).first(op.col);
    case 'raw':
      return stmt(db, op).raw(op.options);
    case 'batch':
      return db.batch(op.stmts.map((s) => stmt(db, s)));
    case 'bind':
      // bind() turini tekshirish (undefined → D1_TYPE_ERROR, boolean → 0/1)
      return db.prepare('SELECT ?1 AS v').bind(op.value === '__undefined__' ? undefined : op.value).first('v');
    default:
      throw new Error(`noma'lum op: ${op.kind}`);
  }
}

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('ok'); // tayyorlik tekshiruvi
    const { target, name = 'test', ops, before, seed, extra = [], checks = [] } = await req.json();
    if (target === 'upgrade') {
      // Haqiqiy MIGRATIONS (+ test bergan qo'shimcha migratsiyalar) — har bir `name` uchun yangi DO
      const stub = env.UPGRADE_DB.get(env.UPGRADE_DB.idFromName(name));
      return Response.json(await stub.upgrade({ migrations: [...MIGRATIONS, ...extra], before, seed, checks }));
    }
    const db = target === 'd1' ? env.D1 : new DoDatabase(env.HASHAR_DB.get(env.HASHAR_DB.idFromName(name)));
    const out = [];
    for (const op of ops) {
      try {
        out.push({ ok: true, value: (await runOp(db, target, op)) ?? null });
      } catch (err) {
        out.push({ ok: false, error: String(err?.message ?? err) });
      }
    }
    return Response.json(out);
  },
};
