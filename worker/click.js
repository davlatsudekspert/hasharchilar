// Click Shop API: POST /api/payments/click/prepare (action=0) va /api/payments/click/complete (action=1).
// Kabinetda: Prepare URL — https://<sayt>/api/payments/click/prepare, Complete URL — .../complete.
// So'rov — application/x-www-form-urlencoded; merchant_trans_id = hashar ID; summa so'mda.
// Imzo: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id [+ merchant_prepare_id] + amount + action
// + sign_time) — doimiy vaqtli solishtirish. Javob doim HTTP 200 JSON, xato kodlari Click bo'yicha:
//   0 Success, -1 imzo, -2 summa, -3 action, -4 allaqachon to'langan, -5 hashar topilmadi,
//   -6 tranzaksiya topilmadi, -7 yangilab bo'lmadi, -8 so'rov xatosi, -9 tranzaksiya bekor qilingan.
// Tranzaksiya: payments (provider='click'): state 0 — prepare, 1 — to'langan, -1 — bekor; merchant_prepare_id = payments.id.
import { readTextLimited } from './body.js';
import { nowMs } from './clock.js';
import { cancelStmt, loadPayHashar, loadTx, performStmts } from './payledger.js';
import { clickConfig, clickSignSource } from './payconfig.js';
import { getSettings } from './settings.js';

const NOTES = {
  0: 'Success',
  [-1]: 'SIGN CHECK FAILED!',
  [-2]: 'Incorrect parameter amount',
  [-3]: 'Action not found',
  [-4]: 'Already paid',
  [-5]: 'User does not exist',
  [-6]: 'Transaction does not exist',
  [-7]: 'Failed to update user',
  [-8]: 'Error in request from click',
  [-9]: 'Transaction cancelled',
};

const REQUIRED = ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'sign_time', 'sign_string'];
const ID_RE = /^[1-9]\d{0,9}$/;

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** md5 hex (Workers WebCrypto MD5 ni qo'llaydi). */
const md5Hex = async (s) => toHex(await crypto.subtle.digest('MD5', enc.encode(s)));

/** Doimiy vaqtli satr solishtirish. */
function safeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** So'm (satr yoki son, masalan "5000" / "5000.00") → tiyin yoki NaN. */
function toTiyin(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

/** So'rov tanasi: form-urlencoded / multipart yoki JSON → oddiy obyekt (xato bo'lsa {}). */
async function readBody(c) {
  const type = c.req.header('content-type') || '';
  // Click so'rovlari kichik: 64 KB dan kattasi (Content-Length bo'lmasa ham, oqim bo'yicha) o'qilmaydi
  const text = await readTextLimited(c.req.raw, 64 * 1024);
  if (text == null) return {};
  try {
    if (/application\/json/i.test(type)) {
      const j = JSON.parse(text);
      return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
    }
    const form = await new Response(text, { headers: { 'content-type': type } }).formData();
    const out = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Click javob shakli. */
function respond(c, body, action, error, extraId = null) {
  const ctid = String(body.click_trans_id ?? '');
  return c.json(
    {
      click_trans_id: /^\d{1,15}$/.test(ctid) ? Number(ctid) : ctid || null,
      merchant_trans_id: String(body.merchant_trans_id ?? ''),
      [action === 1 ? 'merchant_confirm_id' : 'merchant_prepare_id']: extraId,
      error,
      error_note: NOTES[error],
    },
    200,
  );
}

/** Umumiy tekshiruvlar: sozlama, maydonlar, action, imzo, service_id. Xato kodi yoki 0. */
async function validate(cfg, body, action) {
  if (!cfg.enabled) return -8;
  const missing = (k) => body[k] == null || String(body[k]).trim() === '';
  if (REQUIRED.some(missing)) return -8;
  if (String(body.action).trim() !== String(action)) return -3;
  if (action === 1 && missing('merchant_prepare_id')) return -8;
  const expected = await md5Hex(clickSignSource(body, cfg.secretKey, action === 1));
  if (!safeEqual(expected, String(body.sign_string).trim().toLowerCase())) return -1;
  if (String(body.service_id).trim() !== cfg.serviceId) return -8;
  return 0;
}

async function prepare(c, body) {
  const db = c.env.DB;
  const now = nowMs(c);
  const ctid = String(body.click_trans_id).trim();
  const tiyin = toTiyin(body.amount);
  const hasharId = ID_RE.test(String(body.merchant_trans_id).trim()) ? Number(String(body.merchant_trans_id).trim()) : null;
  if (!hasharId) return respond(c, body, 0, -5);
  const h = await loadPayHashar(db, hasharId);
  if (!h) return respond(c, body, 0, -5);

  // Takroriy prepare (shu click_trans_id) — idempotent
  const existing = await loadTx(db, 'click', ctid);
  if (existing) {
    if (existing.hashar_id !== hasharId) return respond(c, body, 0, -8);
    if (existing.state === 1) return respond(c, body, 0, -4);
    if (existing.state === -1) return respond(c, body, 0, -9);
    if (existing.amount !== tiyin) return respond(c, body, 0, -2);
    return respond(c, body, 0, 0, existing.id);
  }
  if (h.payment_status !== 'unpaid') return respond(c, body, 0, -4);
  const { hashar_fee: fee } = await getSettings(db);
  if (!(fee > 0) || tiyin !== fee * 100) return respond(c, body, 0, -2);

  let row;
  try {
    row = await db
      .prepare(
        `INSERT INTO payments (hashar_id, user_id, provider, amount, state, provider_tx_id, create_time, note)
         SELECT h.id, h.creator_id, 'click', ?2, 0, ?3, ?4, ?5 FROM hashars h
         WHERE h.id = ?1 AND h.payment_status = 'unpaid'
         RETURNING id`,
      )
      .bind(hasharId, tiyin, ctid, now, body.click_paydoc_id ? `click_paydoc_id:${String(body.click_paydoc_id).slice(0, 40)}` : null)
      .first();
  } catch (err) {
    if (!/UNIQUE/i.test(String(err?.message))) throw err;
    const again = await loadTx(db, 'click', ctid); // parallel takroriy prepare
    if (again && again.state === 0 && again.hashar_id === hasharId) return respond(c, body, 0, 0, again.id);
    return respond(c, body, 0, -8);
  }
  if (!row) return respond(c, body, 0, -4); // shu orada to'langan
  return respond(c, body, 0, 0, row.id);
}

async function complete(c, body) {
  const db = c.env.DB;
  const now = nowMs(c);
  const ctid = String(body.click_trans_id).trim();
  const tiyin = toTiyin(body.amount);
  const prepId = String(body.merchant_prepare_id).trim();
  if (!ID_RE.test(prepId)) return respond(c, body, 1, -6);
  const tx = await db.prepare("SELECT * FROM payments WHERE id = ?1 AND provider = 'click'").bind(Number(prepId)).first();
  if (!tx || tx.provider_tx_id !== ctid || String(tx.hashar_id) !== String(body.merchant_trans_id).trim()) {
    return respond(c, body, 1, -6);
  }
  if (tx.state === 1) return respond(c, body, 1, -4); // takroriy complete
  if (tx.state === -1) return respond(c, body, 1, -9);
  if (tx.amount !== tiyin) return respond(c, body, 1, -2);

  // Click tomonida xato (masalan, mablag' yetarli emas) — tranzaksiya bekor qilinadi
  const clickError = Number(String(body.error ?? '0').trim());
  if (Number.isFinite(clickError) && clickError < 0) {
    await cancelStmt(db, { tx, fromState: 0, toState: -1, now, reason: Math.trunc(clickError) }).run();
    return respond(c, body, 1, -9);
  }

  const h = await loadPayHashar(db, tx.hashar_id);
  if (!h || h.payment_status !== 'unpaid') {
    // Hashar o'chirilgan yoki boshqa usul bilan to'langan — pul yechilmasin (Click qaytaradi)
    await cancelStmt(db, { tx, fromState: 0, toState: -1, now, reason: h ? -4 : -5 }).run();
    return respond(c, body, 1, h ? -4 : -5);
  }
  await db.batch(performStmts(db, { tx, fromState: 0, toState: 1, now }));
  const done = await db.prepare('SELECT state FROM payments WHERE id = ?1').bind(tx.id).first();
  if (done?.state === 1) return respond(c, body, 1, 0, tx.id);
  if (done?.state === -1) return respond(c, body, 1, -9);
  return respond(c, body, 1, -7);
}

/** Hono handler: `action` 0 — prepare, 1 — complete. */
export function clickHandler(action) {
  return async (c) => {
    const body = await readBody(c);
    try {
      const err = await validate(clickConfig(c.env), body, action);
      if (err) return respond(c, body, action, err);
      return await (action === 1 ? complete(c, body) : prepare(c, body));
    } catch (e) {
      console.error('click:', action === 1 ? 'complete' : 'prepare', String(e?.message ?? e).slice(0, 200));
      return respond(c, body, action, -7);
    }
  };
}
