// SQLite asosidagi Durable Object "HasharDB" — D1 ishlatib bo'lmaganda baza shu yerda turadi.
// Worker kodi uni bevosita emas, d1-adapter.js orqali (env.DB, D1 bilan bir xil API) ishlatadi.
import { DurableObject } from 'cloudflare:workers';
import { MIGRATIONS } from './migrations.js';
import { splitSql } from './sql-split.js';

/**
 * Migratsiyalarni qo'llaydi: har biri bitta tranzaksiyada (yarim qo'llangan sxema qolmaydi)
 * va `_migrations` jadvaliga yoziladi — qayta ishga tushganda takrorlanmaydi.
 * Natija: shu safar qo'llangan migratsiyalar nomlari.
 */
export function applyMigrations(storage, migrations = MIGRATIONS) {
  const sql = storage.sql;
  sql.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const done = new Set(sql.exec('SELECT name FROM _migrations').toArray().map((r) => r.name));
  const applied = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    storage.transactionSync(() => {
      for (const stmt of splitSql(m.sql)) sql.exec(stmt);
      sql.exec('INSERT INTO _migrations (name) VALUES (?)', m.name);
    });
    applied.push(m.name);
  }
  return applied;
}

// D1 kabi: bayt massivi (number[]) ↔ BLOB (ArrayBuffer)
const blobIn = (v) => (Array.isArray(v) ? new Uint8Array(v).buffer : v);
const blobOut = (v) => (v instanceof ArrayBuffer ? Array.from(new Uint8Array(v)) : v);

export class HasharDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Migratsiyalar tugamaguncha birorta so'rov bajarilmaydi
    ctx.blockConcurrencyWhile(async () => {
      const applied = applyMigrations(ctx.storage);
      if (applied.length) console.log("HasharDB: migratsiyalar qo'llandi:", applied.join(', '));
    });
  }

  /** Bitta so'rov: { sql, params } → { columns, rows, meta } (D1 ning ROWS_AND_COLUMNS shakli). */
  query(stmt) {
    return this.ctx.storage.transactionSync(() => this.#exec(stmt));
  }

  /** db.batch(): barcha so'rovlar bitta tranzaksiyada — biri xato bersa hammasi bekor qilinadi. */
  batch(stmts) {
    return this.ctx.storage.transactionSync(() => stmts.map((s) => this.#exec(s)));
  }

  #exec({ sql: query, params }) {
    const sql = this.ctx.storage.sql;
    const started = Date.now();
    const sizeBefore = sql.databaseSize;
    const before = sql.exec('SELECT total_changes() AS total, last_insert_rowid() AS last').one();
    const cursor = sql.exec(query, ...(params || []).map(blobIn));
    const rows = Array.from(cursor.raw(), (row) => row.map(blobOut)); // to'liq o'qiladi (RETURNING ham)
    const columns = cursor.columnNames;
    const after = sql.exec('SELECT total_changes() AS total, last_insert_rowid() AS last').one();
    const sizeAfter = sql.databaseSize;
    const changes = after.total - before.total;
    return {
      columns,
      rows,
      meta: {
        served_by: 'durable-object',
        duration: Date.now() - started,
        changes,
        last_row_id: after.last,
        changed_db: changes !== 0 || after.last !== before.last || sizeAfter !== sizeBefore,
        size_after: sizeAfter,
        rows_read: cursor.rowsRead,
        rows_written: cursor.rowsWritten,
      },
    };
  }
}
