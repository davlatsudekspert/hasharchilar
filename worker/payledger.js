// To'lovlar jadvali (payments) bilan ishlash: Payme / Click / qo'lda to'lovlar uchun umumiy so'rovlar.
// Hasharni "to'langan" qilish har doim bitta batch'da (tranzaksiya): to'lov holati + hashar.payment_status +
// egasiga bildirishnoma. Parallel so'rovlarda ikki marta bajarilmasligi uchun shartli UPDATE'lar ishlatiladi.
import { msToIso } from './clock.js';
import { notifyOwnerStmt } from './notify.js';
import { PAID_SQL, paymentStatus } from './payconfig.js';
import { toIso } from './validate.js';

/** To'lov qabul qilish uchun hashar ma'lumotlari (yo'q bo'lsa null). */
export const loadPayHashar = (db, id) =>
  db.prepare('SELECT id, title, creator_id, status, payment_status FROM hashars WHERE id = ?1').bind(id).first();

/** Provayder tranzaksiyasi (provider + provider_tx_id) yoki null. */
export const loadTx = (db, provider, txId) =>
  db.prepare('SELECT * FROM payments WHERE provider = ?1 AND provider_tx_id = ?2').bind(provider, String(txId)).first();

/** Hashar uchun boshqa muvaffaqiyatli to'lov bormi (refund'da hashar yashirilmasligi uchun) — SQL sharti. */
const OTHER_PAID = `EXISTS (SELECT 1 FROM payments p WHERE p.hashar_id = ?1 AND p.id <> ?2 AND ${PAID_SQL})`;

/**
 * Tranzaksiyani bajarilgan deb belgilash + hasharni e'lon qilish + egasiga bildirishnoma (bitta batch).
 * `fromState` → `toState` faqat hashar hali 'unpaid' bo'lsa. `perform_time = now` — shu so'rov belgisi:
 * keyingi so'rovlar faqat aynan shu so'rov bajargan bo'lsa ishlaydi (takroriy bildirishnoma yo'q).
 * Natija: db.batch() uchun so'rovlar ro'yxati.
 */
export function performStmts(db, { tx, fromState, toState, now }) {
  const marker = 'EXISTS (SELECT 1 FROM payments WHERE id = ?2 AND state = ?3 AND perform_time = ?4)';
  return [
    db
      .prepare(
        `UPDATE payments SET state = ?3, perform_time = ?4
         WHERE id = ?2 AND state = ?5
           AND EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND payment_status = 'unpaid')`,
      )
      .bind(tx.hashar_id, tx.id, toState, now, fromState),
    db
      .prepare(`UPDATE hashars SET payment_status = 'paid' WHERE id = ?1 AND payment_status = 'unpaid' AND ${marker}`)
      .bind(tx.hashar_id, tx.id, toState, now),
    notifyOwnerStmt(db, {
      type: 'payment_confirmed',
      hasharId: tx.hashar_id,
      extra: { provider: tx.provider, amount: Math.round(tx.amount / 100) },
      cond: marker,
      params: [tx.id, toState, now],
    }),
  ];
}

/**
 * Bajarilgan to'lovni qaytarish (Payme state 2 → -2): hashar yana 'unpaid' (yashirin) bo'ladi — agar u hali
 * PENDING bo'lsa va boshqa muvaffaqiyatli to'lovi bo'lmasa. Egasiga "to'lov bekor qilindi" bildirishnomasi.
 */
export function refundStmts(db, { tx, toState, now, reason }) {
  const marker = 'EXISTS (SELECT 1 FROM payments WHERE id = ?2 AND state = ?3 AND cancel_time = ?4)';
  return [
    db
      .prepare('UPDATE payments SET state = ?3, cancel_time = ?4, reason = ?5 WHERE id = ?2 AND hashar_id = ?1 AND state = ?6')
      .bind(tx.hashar_id, tx.id, toState, now, reason, tx.state),
    db
      .prepare(
        `UPDATE hashars SET payment_status = 'unpaid'
         WHERE id = ?1 AND payment_status = 'paid' AND status = 'PENDING' AND ${marker} AND NOT ${OTHER_PAID}`,
      )
      .bind(tx.hashar_id, tx.id, toState, now),
    notifyOwnerStmt(db, {
      type: 'payment_cancelled',
      hasharId: tx.hashar_id,
      extra: { provider: tx.provider, amount: Math.round(tx.amount / 100) },
      cond: `${marker} AND EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND payment_status = 'unpaid')`,
      params: [tx.id, toState, now],
    }),
  ];
}

/** Bajarilmagan tranzaksiyani bekor qilish (hasharga ta'sir qilmaydi). */
export const cancelStmt = (db, { tx, fromState, toState, now, reason }) =>
  db
    .prepare('UPDATE payments SET state = ?2, cancel_time = ?3, reason = ?4 WHERE id = ?1 AND state = ?5')
    .bind(tx.id, toState, now, reason ?? null, fromState);

/**
 * To'lanmagan hasharni to'lovsiz e'lon qilish ('waived') + egasiga 'published' bildirishnomasi (bitta batch).
 * Birinchi so'rov — UPDATE: `meta.changes === 1` bo'lsa aynan shu batch e'lon qilgan. 'waived' qaytmas holat.
 */
export const waiveStmts = (db, hasharId) => [
  db.prepare("UPDATE hashars SET payment_status = 'waived' WHERE id = ?1 AND payment_status = 'unpaid'").bind(hasharId),
  notifyOwnerStmt(db, {
    type: 'published',
    hasharId,
    cond: "EXISTS (SELECT 1 FROM hashars WHERE id = ?1 AND payment_status = 'waived') AND NOT EXISTS (SELECT 1 FROM notifications WHERE hashar_id = ?1 AND type = 'published')",
  }),
];

/** Hasharning oxirgi muvaffaqiyatli to'lovi summasi (tiyin) — db.batch uchun so'rov (`amount` ustuni). */
export const lastPaidStmt = (db, hasharId) =>
  db.prepare(`SELECT p.amount FROM payments p WHERE p.hashar_id = ?1 AND ${PAID_SQL} ORDER BY p.id DESC LIMIT 1`).bind(hasharId);

/** payments qatori → PaymentDTO (summa so'mda; vaqtlar ISO). */
export function paymentDto(p) {
  return {
    id: p.id,
    provider: p.provider,
    amount: Math.round(p.amount / 100),
    amount_tiyin: p.amount,
    state: p.state,
    status: paymentStatus(p.provider, p.state),
    created_at: toIso(p.created_at),
    performed_at: msToIso(p.perform_time),
    cancelled_at: msToIso(p.cancel_time),
    reason: p.reason ?? null,
    note: p.note ?? null,
  };
}
