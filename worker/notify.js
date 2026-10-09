// Bildirishnomalar markazi: yaratish (join, comment, completed, payment_confirmed, payment_cancelled, published)
// va /api/me/notifications* marshrutlari. Qoidalar: o'ziga bildirishnoma yuborilmaydi (actor = qabul qiluvchi
// bo'lsa yozilmaydi), bloklangan foydalanuvchiga yozilmaydi, ro'yxat sahifasi ≤ 50 ta.
import { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { avatarUrl } from './media.js';
import { limitNotifyRead } from './ratelimit.js';
import { ValidationError, readJson, toIso } from './validate.js';

const PAGE_DEFAULT = 30;
const PAGE_MAX = 50;
const READ_IDS_MAX = 100;
const KEEP_DAYS = 180; // bundan eski bildirishnomalar vaqti-vaqti bilan o'chiriladi

// Qabul qiluvchi bloklanmagan foydalanuvchi bo'lsin (r.uid — qabul qiluvchi ID si)
const ACTIVE_USER = 'EXISTS (SELECT 1 FROM users ru WHERE ru.id = r.uid AND ru.blocked_at IS NULL)';

/**
 * Hashar egasiga bildirishnoma (to'lov / e'lon). `cond` — qo'shimcha SQL sharti (?1 — hashar ID si,
 * keyingi parametrlar `params` dan ?2, ?3 ...). Natija — db.batch uchun so'rov.
 */
export function notifyOwnerStmt(db, { type, hasharId, extra = {}, cond = '1', params = [] }) {
  return db
    .prepare(
      `INSERT INTO notifications (user_id, type, hashar_id, data)
       SELECT r.uid, '${type}', r.hid, json_patch(json_object('title', r.title), ?${params.length + 2})
       FROM (SELECT h.creator_id AS uid, h.id AS hid, h.title FROM hashars h WHERE h.id = ?1) r
       WHERE ${ACTIVE_USER} AND (${cond})`,
    )
    .bind(hasharId, ...params, JSON.stringify(extra));
}

/**
 * Hasharga kimdir qo'shildi → egasiga. Volunteers INSERT dan OLDIN, xuddi shu shartlar bilan (bitta batch):
 * faqat haqiqatan yangi qo'shilishda yoziladi. Shu odamdan o'qilmagan "join" bo'lsa takrorlanmaydi.
 */
export function notifyJoinStmt(db, hasharId, actorId) {
  return db
    .prepare(
      `INSERT INTO notifications (user_id, type, hashar_id, actor_id, data)
       SELECT r.uid, 'join', r.hid, ?2, json_object('title', r.title)
       FROM (SELECT h.creator_id AS uid, h.id AS hid, h.title, h.max_volunteers FROM hashars h
             WHERE h.id = ?1 AND h.status = 'PENDING' AND h.payment_status <> 'unpaid') r
       WHERE r.uid <> ?2 AND ${ACTIVE_USER}
         AND NOT EXISTS (SELECT 1 FROM volunteers v WHERE v.hashar_id = ?1 AND v.user_id = ?2)
         AND (r.max_volunteers IS NULL OR (SELECT COUNT(*) FROM volunteers v WHERE v.hashar_id = ?1) < r.max_volunteers)
         AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = r.uid AND n.type = 'join'
                           AND n.hashar_id = ?1 AND n.actor_id = ?2 AND n.read_at IS NULL)`,
    )
    .bind(hasharId, actorId);
}

/** Izoh → hashar egasi va barcha qatnashuvchilarga (izoh muallifidan tashqari). */
export function notifyCommentStmt(db, { hasharId, actorId, commentId, body }) {
  return db
    .prepare(
      `INSERT INTO notifications (user_id, type, hashar_id, actor_id, data)
       SELECT r.uid, 'comment', h.id, ?2, json_object('title', h.title, 'comment_id', ?3, 'excerpt', substr(?4, 1, 120))
       FROM (SELECT creator_id AS uid FROM hashars WHERE id = ?1
             UNION SELECT user_id FROM volunteers WHERE hashar_id = ?1) r
       JOIN hashars h ON h.id = ?1
       WHERE r.uid <> ?2 AND ${ACTIVE_USER}`,
    )
    .bind(hasharId, actorId, commentId, body);
}

/**
 * Izoh o'chirilganda (muallif yoki moderator) uning bildirishnomalari ham o'chadi — o'chirilgan matn parchasi
 * (excerpt) hech kimda qolmasin. Izoh DELETE dan OLDIN, bitta batch'da: hashar_id izohdan olinadi
 * (idx_notifications_hashar ishlatiladi), so'ng data.comment_id bo'yicha.
 */
export function deleteCommentNotificationsStmt(db, commentId) {
  return db
    .prepare(
      `DELETE FROM notifications
       WHERE hashar_id = (SELECT hashar_id FROM comments WHERE id = ?1) AND type = 'comment'
         AND json_extract(data, '$.comment_id') = ?1`,
    )
    .bind(commentId);
}

/**
 * Hashar yakunlandi → qatnashuvchilarga (egasidan tashqari). Faqat shu so'rov qo'shgan "keyin" rasmi bo'lsa
 * (ya'ni aynan shu so'rov yakunlagan bo'lsa) yoziladi — parallel yakunlashda takrorlanmaydi.
 */
export function notifyCompletedStmt(db, { hasharId, ownerId, afterKey }) {
  return db
    .prepare(
      `INSERT INTO notifications (user_id, type, hashar_id, actor_id, data)
       SELECT r.uid, 'completed', h.id, ?2, json_object('title', h.title)
       FROM (SELECT user_id AS uid FROM volunteers WHERE hashar_id = ?1) r
       JOIN hashars h ON h.id = ?1 AND h.status = 'COMPLETED'
       WHERE r.uid <> ?2 AND ${ACTIVE_USER}
         AND EXISTS (SELECT 1 FROM hashar_media m WHERE m.hashar_id = ?1 AND m.photo_type = 'AFTER' AND m.r2_key = ?3)`,
    )
    .bind(hasharId, ownerId, afterKey);
}

/** Eski bildirishnomalarni vaqti-vaqti bilan tozalash (~1% chaqiruvlarda). */
export async function maybePurgeNotifications(db) {
  if (Math.random() >= 0.01) return;
  await db.prepare(`DELETE FROM notifications WHERE created_at < datetime('now', '-${KEEP_DAYS} days')`).run();
}

// ---------- DTO ----------

function parseData(s) {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Foydalanuvchiga ko'rsatiladigan matn (o'zbekcha). */
export function notificationText(type, { actor, title, data = {} }) {
  const who = actor || 'Kimdir';
  const t = title ? `“${title}”` : 'hashar';
  switch (type) {
    case 'join':
      return `${who} hasharingizga qo'shildi: ${t}`;
    case 'comment':
      return `${who} izoh qoldirdi: ${t}`;
    case 'completed':
      return `${t} hashari yakunlandi. Ishtirokingiz uchun rahmat!`;
    case 'payment_confirmed':
      return `To'lov tasdiqlandi${data.amount ? ` (${data.amount} so'm)` : ''} — ${t} hashari e'lon qilindi`;
    case 'payment_cancelled':
      return `To'lov bekor qilindi — ${t} hashari e'londan olindi`;
    case 'published':
      return `${t} hashari e'lon qilindi`;
    default:
      return t;
  }
}

const NOTIF_SELECT = `
  SELECT n.id, n.type, n.hashar_id, n.actor_id, n.data, n.read_at, n.created_at,
         a.name AS actor_name, a.avatar_key AS actor_avatar_key, h.title AS hashar_title
  FROM notifications n
  LEFT JOIN users a ON a.id = n.actor_id
  LEFT JOIN hashars h ON h.id = n.hashar_id`;

/** DB qatori → NotificationDTO. Hashar o'chirilgan bo'lsa `hashar` = {id, title (nusxa), deleted: true}. */
function notificationDto(r) {
  const data = parseData(r.data);
  const title = r.hashar_title ?? data.title ?? null;
  const actor = r.actor_id != null && r.actor_name != null
    ? { id: r.actor_id, name: r.actor_name, avatar_url: avatarUrl(r.actor_avatar_key) }
    : null;
  return {
    id: r.id,
    type: r.type,
    text: notificationText(r.type, { actor: actor?.name, title, data }),
    hashar: r.hashar_id != null ? { id: r.hashar_id, title, deleted: r.hashar_title == null } : null,
    actor,
    data,
    read: r.read_at != null,
    read_at: toIso(r.read_at),
    created_at: toIso(r.created_at),
  };
}

const unreadCount = (db, uid) =>
  db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?1 AND read_at IS NULL').bind(uid);

// ---------- Marshrutlar: /api/me/notifications* ----------

export const notifyRoutes = new Hono();

// GET /api/me/notifications?before=<id>&limit= — yangilari birinchi, sahifa ≤ 50
notifyRoutes.get('/me/notifications', requireAuth, async (c) => {
  const uid = c.get('user').id;
  const rawBefore = c.req.query('before');
  const rawLimit = c.req.query('limit');
  let before = Number.MAX_SAFE_INTEGER;
  if (rawBefore != null && rawBefore !== '') {
    if (!/^[1-9]\d{0,15}$/.test(rawBefore)) throw new ValidationError("before qiymati noto'g'ri");
    before = Number(rawBefore);
  }
  let limit = PAGE_DEFAULT;
  if (rawLimit != null && rawLimit !== '') {
    limit = /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!(limit >= 1 && limit <= PAGE_MAX)) throw new ValidationError(`limit 1–${PAGE_MAX} oralig'ida bo'lsin`);
  }
  const db = c.env.DB;
  const [list, unread] = await db.batch([
    db.prepare(`${NOTIF_SELECT} WHERE n.user_id = ?1 AND n.id < ?2 ORDER BY n.id DESC LIMIT ?3`).bind(uid, before, limit + 1),
    unreadCount(db, uid),
  ]);
  const rows = list.results;
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(notificationDto);
  return c.json({
    items,
    unread_count: unread.results[0].n,
    has_more: hasMore,
    next_before: hasMore ? items[items.length - 1].id : null,
  });
});

// GET /api/me/notifications/unread-count → {count}
notifyRoutes.get('/me/notifications/unread-count', requireAuth, async (c) => {
  const row = await unreadCount(c.env.DB, c.get('user').id).first();
  return c.json({ count: row.n });
});

// POST /api/me/notifications/read — {ids: [..]} (≤ 100) yoki {all: true} → {ok, updated, unread_count}
notifyRoutes.post('/me/notifications/read', requireAuth, async (c) => {
  const uid = c.get('user').id;
  const body = await readJson(c);
  const db = c.env.DB;
  let stmt;
  if (body.all === true) {
    stmt = db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ?1 AND read_at IS NULL").bind(uid);
  } else if (Array.isArray(body.ids)) {
    const ids = [...new Set(body.ids)];
    if (!ids.length || ids.length > READ_IDS_MAX || !ids.every((x) => Number.isSafeInteger(x) && x > 0)) {
      throw new ValidationError(`ids — 1–${READ_IDS_MAX} ta musbat butun son bo'lsin`);
    }
    stmt = db
      .prepare(
        `UPDATE notifications SET read_at = datetime('now')
         WHERE user_id = ?1 AND read_at IS NULL AND id IN (SELECT value FROM json_each(?2))`,
      )
      .bind(uid, JSON.stringify(ids));
  } else {
    throw new ValidationError('ids yoki all: true yuboring');
  }
  await limitNotifyRead(c, uid);
  const [upd, unread] = await db.batch([stmt, unreadCount(db, uid)]);
  return c.json({ ok: true, updated: upd.meta.changes, unread_count: unread.results[0].n });
});
