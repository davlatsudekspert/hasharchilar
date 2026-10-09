// Payme Merchant API (JSON-RPC 2.0): POST /api/payments/payme
// Kabinetdagi "Endpoint URL": https://<sayt>/api/payments/payme; hisob (account) maydoni: hashar_id.
// Avtorizatsiya: `Authorization: Basic base64("Paycom:" + PAYME_KEY)` (sinov rejimida PAYME_TEST_KEY) —
// doimiy vaqtli solishtirish. Metodlar: CheckPerformTransaction, CreateTransaction, PerformTransaction,
// CancelTransaction, CheckTransaction, GetStatement. Summa tiyinda (5000 so'm = 500000).
// Holatlar: 1 — yaratilgan, 2 — bajarilgan, -1 — bajarilmasdan bekor, -2 — bajarilgandan keyin bekor.
// 12 soat ichida bajarilmagan tranzaksiya (reason 4) bilan bekor qilinadi. Javob HTTP 200 (xato ham).
import { readTextLimited } from './body.js';
import { nowMs } from './clock.js';
import { cancelStmt, loadPayHashar, loadTx, performStmts, refundStmts } from './payledger.js';
import { PAYME_TIMEOUT_MS, paymeConfig } from './payconfig.js';
import { getSettings } from './settings.js';

// Xato kodlari va matnlari (Payme spetsifikatsiyasi)
const E = {
  POST_ONLY: -32300,
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  AUTH: -32504,
  SYSTEM: -32400,
  INVALID_AMOUNT: -31001,
  TX_NOT_FOUND: -31003,
  CANT_CANCEL: -31007,
  CANT_PERFORM: -31008,
  HASHAR_NOT_FOUND: -31050,
  HASHAR_PAID: -31051,
  HASHAR_BUSY: -31052,
};

const MESSAGES = {
  [E.POST_ONLY]: { uz: "So'rov usuli POST bo'lishi kerak", ru: 'Метод запроса должен быть POST', en: 'Request method must be POST' },
  [E.PARSE]: { uz: "JSON so'rovni o'qib bo'lmadi", ru: 'Ошибка парсинга JSON', en: 'Parse error' },
  [E.INVALID_REQUEST]: {
    uz: "So'rovda majburiy maydonlar yo'q yoki turi noto'g'ri",
    ru: 'Отсутствуют обязательные поля в RPC-запросе или тип полей не соответствует спецификации',
    en: 'Invalid JSON-RPC request',
  },
  [E.METHOD_NOT_FOUND]: { uz: 'Metod topilmadi', ru: 'Запрашиваемый метод не найден', en: 'Method not found' },
  [E.AUTH]: {
    uz: "Metodni bajarish uchun huquq yetarli emas",
    ru: 'Недостаточно привилегий для выполнения метода',
    en: 'Insufficient privileges to perform this method',
  },
  [E.SYSTEM]: { uz: 'Tizim xatosi', ru: 'Системная ошибка', en: 'System error' },
  [E.INVALID_AMOUNT]: { uz: "Summa noto'g'ri", ru: 'Неверная сумма', en: 'Invalid amount' },
  [E.TX_NOT_FOUND]: { uz: 'Tranzaksiya topilmadi', ru: 'Транзакция не найдена', en: 'Transaction not found' },
  [E.CANT_CANCEL]: {
    uz: "Tranzaksiyani bekor qilib bo'lmaydi: xizmat to'liq ko'rsatilgan (hashar yakunlangan)",
    ru: 'Невозможно отменить транзакцию: услуга полностью оказана',
    en: 'Unable to cancel transaction: the service has been fully provided',
  },
  [E.CANT_PERFORM]: { uz: "Amalni bajarib bo'lmaydi", ru: 'Невозможно выполнить данную операцию', en: 'Unable to perform operation' },
  [E.HASHAR_NOT_FOUND]: { uz: 'Hashar topilmadi', ru: 'Хашар не найден', en: 'Hashar not found' },
  [E.HASHAR_PAID]: {
    uz: "Bu hashar uchun to'lov allaqachon qilingan",
    ru: 'Этот хашар уже оплачен',
    en: 'This hashar has already been paid for',
  },
  [E.HASHAR_BUSY]: {
    uz: "Bu hashar uchun boshqa to'lov kutilmoqda",
    ru: 'Для этого хашара уже ожидается другая оплата',
    en: 'Another payment for this hashar is in progress',
  },
};

class RpcError extends Error {
  constructor(code, data) {
    super(String(code));
    this.code = code;
    this.data = data;
  }
}

const enc = new TextEncoder();
const MAX_BODY = 64 * 1024; // Payme so'rovlari kichik; kattasi o'qilmaydi

/** Doimiy vaqtli solishtirish: ikkala satrning SHA-256 xeshlari taqqoslanadi (uzunlik ham sizmaydi). */
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const ax = new Uint8Array(x);
  const by = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i];
  return diff === 0;
}

/** `Authorization: Basic base64("Paycom:<key>")` tekshiruvi. */
async function authorized(c, cfg) {
  if (!cfg.enabled) return false;
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(c.req.header('authorization') || '');
  if (!m) return false;
  let decoded;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (ch) => ch.charCodeAt(0)));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  const login = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const passOk = await safeEqual(pass, cfg.key); // login noto'g'ri bo'lsa ham bajariladi (vaqt farqi yo'q)
  return passOk && login === 'Paycom';
}

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isTxId = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 64;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** account.hashar_id → musbat butun son yoki null. */
function accountHasharId(params) {
  const raw = isObj(params.account) ? params.account.hashar_id : undefined;
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  return /^[1-9]\d{0,9}$/.test(s) ? Number(s) : null;
}

/** Tranzaksiya → CheckTransaction/GetStatement javobidagi vaqtlar va holat. */
const txTimes = (tx) => ({
  create_time: tx.create_time,
  perform_time: tx.perform_time || 0,
  cancel_time: tx.cancel_time || 0,
  transaction: String(tx.id),
  state: tx.state,
  reason: tx.reason ?? null,
});

/**
 * CheckPerformTransaction mantig'i (CreateTransaction ham chaqiradi): hisob, hashar holati, summa.
 * Natija: hashar qatori; xato bo'lsa RpcError.
 */
async function checkPerform(db, params) {
  const hasharId = accountHasharId(params);
  if (!hasharId) throw new RpcError(E.HASHAR_NOT_FOUND, 'hashar_id');
  const h = await loadPayHashar(db, hasharId);
  if (!h) throw new RpcError(E.HASHAR_NOT_FOUND, 'hashar_id');
  if (h.payment_status !== 'unpaid') throw new RpcError(E.HASHAR_PAID, 'hashar_id');
  const { hashar_fee: fee } = await getSettings(db);
  if (!(fee > 0) || !Number.isSafeInteger(params.amount) || params.amount !== fee * 100) {
    throw new RpcError(E.INVALID_AMOUNT, 'amount');
  }
  return h;
}

/** Hashar uchun kutilayotgan (state 1) boshqa tranzaksiya: muddati o'tganlari bekor qilinadi, qolgani — band. */
async function assertNotBusy(db, hasharId, now, exceptTxId = null) {
  const { results } = await db
    .prepare("SELECT * FROM payments WHERE provider = 'payme' AND hashar_id = ?1 AND state = 1")
    .bind(hasharId)
    .all();
  for (const tx of results) {
    if (tx.provider_tx_id === exceptTxId) continue;
    if (now - tx.create_time > PAYME_TIMEOUT_MS) {
      await cancelStmt(db, { tx, fromState: 1, toState: -1, now, reason: 4 }).run();
    } else {
      throw new RpcError(E.HASHAR_BUSY, 'hashar_id');
    }
  }
}

/** Muddati (12 soat) o'tgan state 1 tranzaksiyani bekor qiladi (reason 4) va -31008 qaytaradi. */
async function expireIfTimedOut(db, tx, now) {
  if (tx.state === 1 && now - tx.create_time > PAYME_TIMEOUT_MS) {
    await cancelStmt(db, { tx, fromState: 1, toState: -1, now, reason: 4 }).run();
    throw new RpcError(E.CANT_PERFORM);
  }
}

async function requireTx(db, params) {
  if (!isTxId(params.id)) throw new RpcError(E.INVALID_REQUEST, 'id');
  const tx = await loadTx(db, 'payme', params.id);
  if (!tx) throw new RpcError(E.TX_NOT_FOUND, 'id');
  return tx;
}

const METHODS = {
  async CheckPerformTransaction(db, params, now) {
    if (!isNum(params.amount)) throw new RpcError(E.INVALID_REQUEST, 'amount');
    const h = await checkPerform(db, params);
    await assertNotBusy(db, h.id, now);
    return { allow: true };
  },

  async CreateTransaction(db, params, now) {
    if (!isTxId(params.id) || !isNum(params.time) || !isNum(params.amount) || !isObj(params.account)) {
      throw new RpcError(E.INVALID_REQUEST);
    }
    const existing = await loadTx(db, 'payme', params.id);
    if (existing) {
      // Idempotent: shu Payme tranzaksiyasi uchun takroriy so'rov
      if (existing.state !== 1) throw new RpcError(E.CANT_PERFORM);
      await expireIfTimedOut(db, existing, now);
      return { create_time: existing.create_time, transaction: String(existing.id), state: existing.state };
    }
    const h = await checkPerform(db, params);
    await assertNotBusy(db, h.id, now);
    let row;
    try {
      // Shartli INSERT: parallel so'rovda ham bitta hasharga bitta kutilayotgan tranzaksiya
      row = await db
        .prepare(
          `INSERT INTO payments (hashar_id, user_id, provider, amount, state, provider_tx_id, provider_time, create_time)
           SELECT h.id, h.creator_id, 'payme', ?2, 1, ?3, ?4, ?5 FROM hashars h
           WHERE h.id = ?1 AND h.payment_status = 'unpaid'
             AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.provider = 'payme' AND p.hashar_id = ?1 AND p.state = 1)
           RETURNING id, create_time, state`,
        )
        .bind(h.id, params.amount, params.id, Math.trunc(params.time), now)
        .first();
    } catch (err) {
      if (!/UNIQUE/i.test(String(err?.message))) throw err;
      row = null; // shu id bilan parallel yaratilgan — pastda qayta o'qiladi
    }
    if (!row) {
      const again = await loadTx(db, 'payme', params.id);
      if (again && again.state === 1) return { create_time: again.create_time, transaction: String(again.id), state: 1 };
      const now2 = await loadPayHashar(db, h.id);
      if (!now2) throw new RpcError(E.HASHAR_NOT_FOUND, 'hashar_id');
      if (now2.payment_status !== 'unpaid') throw new RpcError(E.HASHAR_PAID, 'hashar_id');
      throw new RpcError(E.HASHAR_BUSY, 'hashar_id');
    }
    return { create_time: row.create_time, transaction: String(row.id), state: row.state };
  },

  async PerformTransaction(db, params, now) {
    const tx = await requireTx(db, params);
    if (tx.state === 2) return { transaction: String(tx.id), perform_time: tx.perform_time, state: 2 };
    if (tx.state !== 1) throw new RpcError(E.CANT_PERFORM);
    await expireIfTimedOut(db, tx, now);
    await db.batch(performStmts(db, { tx, fromState: 1, toState: 2, now }));
    const done = await loadTx(db, 'payme', params.id);
    if (done.state === 2) return { transaction: String(done.id), perform_time: done.perform_time, state: 2 };
    // Hashar o'chirilgan yoki boshqa usul bilan to'langan — pul yechilmasin (Payme tranzaksiyani bekor qiladi)
    throw new RpcError(E.CANT_PERFORM);
  },

  async CancelTransaction(db, params, now) {
    if (!Number.isSafeInteger(params.reason)) throw new RpcError(E.INVALID_REQUEST, 'reason');
    let tx = await requireTx(db, params);
    if (tx.state === 1) {
      await cancelStmt(db, { tx, fromState: 1, toState: -1, now, reason: params.reason }).run();
      tx = await loadTx(db, 'payme', params.id);
    }
    if (tx.state === 2) {
      // Xizmat to'liq ko'rsatilgan (hashar yakunlangan) — qaytarib bo'lmaydi
      const h = await loadPayHashar(db, tx.hashar_id);
      if (h && h.status === 'COMPLETED') throw new RpcError(E.CANT_CANCEL);
      await db.batch(refundStmts(db, { tx, toState: -2, now, reason: params.reason }));
      tx = await loadTx(db, 'payme', params.id);
    }
    if (tx.state >= 0) throw new RpcError(E.CANT_PERFORM); // kutilmagan holat (parallel o'zgarish)
    return { transaction: String(tx.id), cancel_time: tx.cancel_time, state: tx.state };
  },

  async CheckTransaction(db, params) {
    return txTimes(await requireTx(db, params));
  },

  async GetStatement(db, params) {
    if (!isNum(params.from) || !isNum(params.to) || params.from > params.to) throw new RpcError(E.INVALID_REQUEST);
    const { results } = await db
      .prepare(
        `SELECT * FROM payments WHERE provider = 'payme' AND provider_time BETWEEN ?1 AND ?2
         ORDER BY provider_time, id LIMIT 10000`,
      )
      .bind(Math.trunc(params.from), Math.trunc(params.to))
      .all();
    return {
      transactions: results.map((tx) => ({
        id: tx.provider_tx_id,
        time: tx.provider_time,
        amount: tx.amount,
        account: { hashar_id: String(tx.hashar_id) },
        ...txTimes(tx),
      })),
    };
  },
};

/** Hono handler: POST /api/payments/payme (boshqa HTTP usullari ham shu yerga — -32300). */
export async function handlePayme(c) {
  const reply = (id, body) => c.json({ jsonrpc: '2.0', id: id ?? null, ...body }, 200);
  const fail = (id, code, data) =>
    reply(id, { error: { code, message: MESSAGES[code] ?? MESSAGES[E.SYSTEM], ...(data ? { data } : {}) } });

  if (c.req.method !== 'POST') return fail(null, E.POST_ONLY);
  const cfg = paymeConfig(c.env);
  let body = null;
  let parsed = false;
  // Hajm oqim bo'yicha sanaladi (Content-Length bo'lmasa ham) — 64 KB dan katta tana o'qilmaydi
  const text = await readTextLimited(c.req.raw, MAX_BODY);
  if (text != null) {
    try {
      body = JSON.parse(text);
      parsed = true;
    } catch {
      // buzilgan JSON — pastda -32700 (avtorizatsiyadan keyin)
    }
  }
  const id = isObj(body) && (typeof body.id === 'number' || typeof body.id === 'string') ? body.id : null;
  // Avval avtorizatsiya: kalitsiz so'rovga hech qanday ma'lumot (hatto xato turi) berilmaydi
  if (!(await authorized(c, cfg))) return fail(id, E.AUTH);
  if (!parsed) return fail(null, E.PARSE);
  if (!isObj(body) || typeof body.method !== 'string' || !isObj(body.params)) return fail(id, E.INVALID_REQUEST);
  const method = Object.hasOwn(METHODS, body.method) ? METHODS[body.method] : null;
  if (!method) return fail(id, E.METHOD_NOT_FOUND, body.method.slice(0, 64));

  try {
    const result = await method(c.env.DB, body.params, nowMs(c));
    return reply(id, { result });
  } catch (err) {
    if (err instanceof RpcError) return fail(id, err.code, err.data);
    console.error('payme:', body.method, String(err?.message ?? err).slice(0, 200));
    return fail(id, E.SYSTEM);
  }
}
