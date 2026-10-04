// D1 bilan bir xil API (prepare → bind → first/all/run/raw, batch) — so'rovlar HasharDB
// Durable Object'da bajariladi. Worker kodi env.DB ni o'zgarishsiz ishlataveradi.
// Natija shakllari va xato matnlari D1 niki bilan bir xil ("D1_ERROR: UNIQUE constraint failed: ...").

/** Xatoni D1 ko'rinishiga keltiradi (allaqachon D1_* bo'lsa o'zgarmaydi). */
function d1Error(err) {
  const message = String(err?.message ?? err);
  if (message.startsWith('D1_')) return err;
  return new Error(`D1_ERROR: ${message}`, { cause: err });
}

/** bind() qiymatlari — D1 qoidalari: son/satr/null, boolean → 0/1, baytlar → number[]. */
function bindValue(v) {
  const type = typeof v;
  if (type === 'number' || type === 'string') return v;
  if (type === 'boolean') return v ? 1 : 0;
  if (type === 'object') {
    if (v == null) return v;
    if (Array.isArray(v) && v.every((b) => typeof b === 'number' && b >= 0 && b < 256)) return v;
    if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v));
    if (ArrayBuffer.isView(v)) return Array.from(v);
  }
  throw new Error(`D1_TYPE_ERROR: Type '${type}' not supported for value '${v}'`, {
    cause: new Error(`Type '${type}' not supported for value '${v}'`),
  });
}

/** { columns, rows } → qatorlar obyekt sifatida (bir xil nomli ustunda oxirgisi qoladi — D1 kabi). */
const toObjects = ({ columns, rows }) => rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));

/** D1Result: { success, meta, results }. */
const toResult = (r) => ({ success: true, meta: r.meta, results: toObjects(r) });

class DoPreparedStatement {
  constructor(db, statement, params = []) {
    this.db = db;
    this.statement = statement;
    this.params = params;
  }

  bind(...values) {
    return new DoPreparedStatement(this.db, this.statement, values.map(bindValue));
  }

  async all() {
    return toResult(await this.db._query(this));
  }

  async run() {
    return toResult(await this.db._query(this));
  }

  /** Birinchi qator (yo'q bo'lsa null) yoki uning `colName` ustuni. */
  async first(colName) {
    const rows = toObjects(await this.db._query(this));
    if (!rows.length) return null;
    const row = rows[0];
    if (colName === undefined) return row;
    if (row[colName] === undefined) {
      throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${colName})`, { cause: new Error('Column not found') });
    }
    return row[colName];
  }

  async raw(options) {
    const r = await this.db._query(this);
    return [...(options?.columnNames ? [r.columns] : []), ...r.rows];
  }
}

export class DoDatabase {
  /** `stub` — HasharDB Durable Object stub'i (query/batch RPC metodlari bilan). */
  constructor(stub) {
    this.stub = stub;
  }

  prepare(sql) {
    return new DoPreparedStatement(this, sql);
  }

  /** Bitta tranzaksiya (DO ichida transactionSync); natijalar so'rovlar tartibida. */
  async batch(statements) {
    let res;
    try {
      res = await this.stub.batch(statements.map((s) => ({ sql: s.statement, params: s.params })));
    } catch (err) {
      throw d1Error(err);
    }
    return res.map(toResult);
  }

  async _query(s) {
    try {
      return await this.stub.query({ sql: s.statement, params: s.params });
    } catch (err) {
      throw d1Error(err);
    }
  }
}
