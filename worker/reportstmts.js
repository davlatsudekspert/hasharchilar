// Nishon (hashar / izoh / foydalanuvchi) o'chirilganda shikoyat va bloklarni tozalovchi SQL so'rovlar.
// Alohida fayl: auth.js / hashars.js / social.js / admin.js batch'lariga kiradi (reports.js bilan aylanma import bo'lmasin).

const CLOSE_SET = "SET status = 'resolved', resolved_at = datetime('now') WHERE status = 'open'";

/** Hashar o'chirilganda: uning va izohlarining ochiq shikoyatlari yopiladi (izohlar o'chishidan OLDIN). `guard` — qo'shimcha shart. */
export const closeHasharReportsStmt = (db, hasharId, guard = '1') =>
  db
    .prepare(
      `UPDATE reports ${CLOSE_SET} AND ${guard}
         AND ((target_type = 'hashar' AND target_id = ?1)
           OR (target_type = 'comment' AND target_id IN (SELECT id FROM comments WHERE hashar_id = ?1)))`,
    )
    .bind(hasharId);

/** Izoh o'chirilganda: uning ochiq shikoyatlari yopiladi. */
export const closeCommentReportsStmt = (db, commentId) =>
  db.prepare(`UPDATE reports ${CLOSE_SET} AND target_type = 'comment' AND target_id = ?1`).bind(commentId);

/**
 * Foydalanuvchi o'chirilganda (hisobni o'chirish / admin): uning kontentiga ochiq shikoyatlar yopiladi (hashar, izoh),
 * o'zi yuborgan va o'ziga qaratilgan shikoyatlar hamda ikki tomonlama bloklar o'chiriladi. Hashar / izohlar
 * o'chirilishidan OLDIN batch'ga qo'yiladi. FK kaskadi bilan bir xil natija, lekin DO adapterida ham aniq.
 */
export const purgeUserReportsStmts = (db, userId) => [
  db
    .prepare(
      `UPDATE reports ${CLOSE_SET}
         AND ((target_type = 'hashar' AND target_id IN (SELECT id FROM hashars WHERE creator_id = ?1))
           OR (target_type = 'comment' AND target_id IN (
                SELECT id FROM comments WHERE user_id = ?1 OR hashar_id IN (SELECT id FROM hashars WHERE creator_id = ?1))))`,
    )
    .bind(userId),
  db.prepare("DELETE FROM reports WHERE reporter_id = ?1 OR (target_type = 'user' AND target_id = ?1)").bind(userId),
  db.prepare('DELETE FROM user_blocks WHERE user_id = ?1 OR blocked_id = ?1').bind(userId),
];

