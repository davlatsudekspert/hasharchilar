// v3 ijtimoiy qism: izohlar, ommaviy profil, reyting (leaderboard).
import { Hono } from 'hono';
import { isAdmin, requireAuth, requireVerifiedEmail } from './auth.js';
import { HASHAR_SELECT, PUBLISHED_SQL, VISIBLE_SQL, assertVisible, toDto } from './hashars.js';
import { avatarUrl } from './media.js';
import { deleteCommentNotificationsStmt, maybePurgeNotifications, notifyCommentStmt } from './notify.js';
import { limitComment } from './ratelimit.js';
import { ForbiddenError, NotFoundError, ValidationError, parseCommentBody, parseId, readJson, toIso } from './validate.js';

const COMMENTS_LIMIT = 200; // bitta hashar uchun ko'rsatiladigan oxirgi izohlar
const PROFILE_HASHARS = 20;
const LEADERBOARD_LIMIT = 50;
const HASHAR_NOT_FOUND = 'Hashar topilmadi';
const USER_NOT_FOUND = 'Foydalanuvchi topilmadi';
const COMMENT_NOT_FOUND = 'Izoh topilmadi';

// ---------- Izohlar ----------

const COMMENT_SELECT = `
  SELECT cm.id, cm.body, cm.created_at, cm.user_id, u.name AS user_name, u.avatar_key AS user_avatar_key
  FROM comments cm JOIN users u ON u.id = cm.user_id`;

/** DB qatori → CommentDTO. */
const commentDto = (r, uid) => ({
  id: r.id,
  body: r.body,
  created_at: toIso(r.created_at),
  user: { id: r.user_id, name: r.user_name, avatar_url: avatarUrl(r.user_avatar_key) },
  is_mine: uid != null && r.user_id === uid,
});

/** Hashar mavjud va joriy foydalanuvchiga ko'rinadi (to'lanmagan — faqat egasi / admin), aks holda 404. */
async function requireHashar(c, db, id) {
  const h = await db.prepare('SELECT id, creator_id, payment_status FROM hashars WHERE id = ?1').bind(id).first();
  if (!h) throw new NotFoundError(HASHAR_NOT_FOUND);
  assertVisible(c, h);
}

export const socialRoutes = new Hono();

// GET /api/hashars/:id/comments — oxirgi 200 ta, eski → yangi
socialRoutes.get('/hashars/:id/comments', async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user')?.id ?? null;
  const db = c.env.DB;
  const [h, list] = await db.batch([
    db.prepare('SELECT id, creator_id, payment_status FROM hashars WHERE id = ?1').bind(id),
    db.prepare(`${COMMENT_SELECT} WHERE cm.hashar_id = ?1 ORDER BY cm.id DESC LIMIT ${COMMENTS_LIMIT}`).bind(id),
  ]);
  if (!h.results.length) throw new NotFoundError(HASHAR_NOT_FOUND);
  assertVisible(c, h.results[0]);
  return c.json(list.results.reverse().map((r) => commentDto(r, uid)));
});

// POST /api/hashars/:id/comments — {body} → 201 CommentDTO
socialRoutes.post('/hashars/:id/comments', requireVerifiedEmail, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  const body = parseCommentBody((await readJson(c)).body);
  await requireHashar(c, db, id);
  await limitComment(c, uid);
  // Hashar shu orada o'chirilgan bo'lsa tashqi kalit xatosi o'rniga 0 qator → 404
  const row = await db
    .prepare(
      `INSERT INTO comments (hashar_id, user_id, body)
       SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM hashars WHERE id = ?1)
       RETURNING id`,
    )
    .bind(id, uid, body)
    .first();
  if (!row) throw new NotFoundError(HASHAR_NOT_FOUND);
  // Egasi va qatnashuvchilarga bildirishnoma + yangi izoh (bitta batch)
  const [, full] = await db.batch([
    notifyCommentStmt(db, { hasharId: id, actorId: uid, commentId: row.id, body }),
    db.prepare(`${COMMENT_SELECT} WHERE cm.id = ?1`).bind(row.id),
  ]);
  await maybePurgeNotifications(db);
  return c.json(commentDto(full.results[0], uid), 201);
});

/** Izohni o'chirish (o'chirilgan bo'lsa true) — uning bildirishnomalari (matn parchasi bilan) ham, bitta batch'da. */
export async function deleteComment(db, id) {
  const [, r] = await db.batch([deleteCommentNotificationsStmt(db, id), db.prepare('DELETE FROM comments WHERE id = ?1').bind(id)]);
  return r.meta.changes === 1;
}

// DELETE /api/comments/:id — o'z izohi yoki administrator
socialRoutes.delete('/comments/:id', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'), COMMENT_NOT_FOUND);
  const user = c.get('user');
  const db = c.env.DB;
  const cm = await db.prepare('SELECT user_id FROM comments WHERE id = ?1').bind(id).first();
  if (!cm) throw new NotFoundError(COMMENT_NOT_FOUND);
  if (cm.user_id !== user.id && !isAdmin(user, c.env)) throw new ForbiddenError("Faqat o'z izohingizni o'chira olasiz");
  if (!(await deleteComment(db, id))) throw new NotFoundError(COMMENT_NOT_FOUND);
  return c.json({ ok: true });
});

// ---------- Ommaviy profil ----------

// GET /api/users/:id — telefon raqami HECH QACHON qaytarilmaydi
socialRoutes.get('/users/:id', async (c) => {
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  const uid = c.get('user')?.id ?? null;
  const db = c.env.DB;
  // Statistika — faqat e'lon qilingan hasharlar; ro'yxatda to'lanmaganlari faqat egasining o'ziga
  const [u, hashars] = await db.batch([
    db
      .prepare(
        `SELECT u.id, u.name, u.bio, u.district, u.avatar_key, u.created_at,
           (SELECT COUNT(*) FROM hashars h WHERE h.creator_id = u.id AND ${PUBLISHED_SQL}) AS created,
           (SELECT COUNT(*) FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
              WHERE v.user_id = u.id AND h.creator_id <> u.id AND ${PUBLISHED_SQL}) AS joined,
           (SELECT COUNT(*) FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
              WHERE v.user_id = u.id AND h.status = 'COMPLETED' AND ${PUBLISHED_SQL}) AS completed
         FROM users u WHERE u.id = ?1`,
      )
      .bind(id),
    db
      .prepare(`${HASHAR_SELECT} WHERE h.creator_id = ? AND ${VISIBLE_SQL} ORDER BY h.id DESC LIMIT ${PROFILE_HASHARS}`)
      .bind(uid, id),
  ]);
  const row = u.results[0];
  if (!row) throw new NotFoundError(USER_NOT_FOUND);
  return c.json({
    id: row.id,
    name: row.name,
    bio: row.bio,
    district: row.district,
    avatar_url: avatarUrl(row.avatar_key),
    created_at: toIso(row.created_at),
    stats: { created: row.created, joined: row.joined, completed: row.completed },
    hashars: hashars.results.map((r) => toDto(r, uid)),
  });
});

// ---------- Reyting ----------

/** Toshkent (UTC+5) bo'yicha joriy oy boshi — UTC da 'YYYY-MM-DD HH:MM:SS' (created_at bilan solishtirish uchun). */
export function tashkentMonthStartUtc(now = Date.now()) {
  const t = new Date(now + 5 * 3600e3);
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - 5 * 3600e3;
  return new Date(start).toISOString().slice(0, 19).replace('T', ' ');
}

// GET /api/leaderboard?period=all|month — top 50; score = completed*10 + joined*3 + created*5 + checkins*5
// (v4: QR davomat bonusi). Faqat e'lon qilingan (to'langan / bepul) hasharlar hisoblanadi.
socialRoutes.get('/leaderboard', async (c) => {
  const period = c.req.query('period') || 'all';
  if (period !== 'all' && period !== 'month') throw new ValidationError("period qiymati noto'g'ri (all yoki month)");
  // Barcha vaqt satrlari '' dan katta — 'all' uchun shart doim bajariladi
  const since = period === 'month' ? tashkentMonthStartUtc() : '';
  const { results } = await c.env.DB.prepare(
    `WITH j AS (SELECT v.user_id AS uid, COUNT(*) AS n FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
                WHERE h.creator_id <> v.user_id AND v.joined_at >= ?1 AND ${PUBLISHED_SQL} GROUP BY v.user_id),
          d AS (SELECT v.user_id AS uid, COUNT(*) AS n FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
                WHERE h.status = 'COMPLETED' AND h.completed_at >= ?1 AND ${PUBLISHED_SQL} GROUP BY v.user_id),
          k AS (SELECT h.creator_id AS uid, COUNT(*) AS n FROM hashars h
                WHERE h.created_at >= ?1 AND ${PUBLISHED_SQL} GROUP BY h.creator_id),
          q AS (SELECT v.user_id AS uid, COUNT(*) AS n FROM volunteers v JOIN hashars h ON h.id = v.hashar_id
                WHERE v.checked_in_at IS NOT NULL AND v.checked_in_at >= ?1 AND ${PUBLISHED_SQL} GROUP BY v.user_id),
          s AS (SELECT u.id, u.name, u.avatar_key, u.district,
                       COALESCE(j.n, 0) AS joined, COALESCE(d.n, 0) AS completed, COALESCE(k.n, 0) AS created,
                       COALESCE(q.n, 0) AS checkins
                FROM users u LEFT JOIN j ON j.uid = u.id LEFT JOIN d ON d.uid = u.id LEFT JOIN k ON k.uid = u.id
                  LEFT JOIN q ON q.uid = u.id
                WHERE u.blocked_at IS NULL)
     SELECT *, completed * 10 + joined * 3 + created * 5 + checkins * 5 AS score FROM s
     WHERE completed + joined + created + checkins > 0
     ORDER BY score DESC, completed DESC, id ASC
     LIMIT ${LEADERBOARD_LIMIT}`,
  )
    .bind(since)
    .all();
  return c.json(
    results.map((r) => ({
      user: { id: r.id, name: r.name, avatar_url: avatarUrl(r.avatar_key), district: r.district },
      joined: r.joined,
      completed: r.completed,
      created: r.created,
      checkins: r.checkins,
      score: r.score,
    })),
  );
});
