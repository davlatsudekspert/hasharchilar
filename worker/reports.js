// UGC moderatsiya (Google Play): shikoyatlar (hashar / izoh / foydalanuvchi) va foydalanuvchilarni bloklash.
//   POST /api/reports, POST|DELETE /api/users/:id/block, GET /api/me/blocks.
// Administrator tomoni (ro'yxat, hal qilish) — worker/admin.js (adminReportRoutes).
import { Hono } from 'hono';
import { assertVisible } from './hashars.js';
import { avatarUrl } from './media.js';
import { limitBlock, limitReport } from './ratelimit.js';
import { requireAuth } from './auth.js';
import {
  NotFoundError,
  ValidationError,
  charLength,
  cleanText,
  parseId,
  readJson,
  toIso,
} from './validate.js';

export const REPORT_TARGETS = ['hashar', 'comment', 'user'];
export const REPORT_REASONS = ['spam', 'abuse', 'sexual', 'child_safety', 'violence', 'fraud', 'other'];
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];
export const REPORT_DETAILS_MAX = 500;

const USER_NOT_FOUND = 'Foydalanuvchi topilmadi';
const TARGET_NOT_FOUND = {
  hashar: 'Hashar topilmadi',
  comment: 'Izoh topilmadi',
  user: USER_NOT_FOUND,
};

// ---------- Marshrutlar ----------

export const reportRoutes = new Hono();

/** Shikoyat nishoni: { ownerId, hashar? } — mavjud va ko'rinadigan bo'lishi shart (aks holda 404). */
async function loadTarget(c, db, type, id) {
  if (type === 'hashar') {
    const h = await db.prepare('SELECT id, creator_id, payment_status FROM hashars WHERE id = ?1').bind(id).first();
    if (!h) throw new NotFoundError(TARGET_NOT_FOUND.hashar);
    assertVisible(c, h, { allowAdmin: false });
    return h.creator_id;
  }
  if (type === 'comment') {
    const cm = await db
      .prepare(
        `SELECT cm.user_id, h.creator_id, h.payment_status FROM comments cm JOIN hashars h ON h.id = cm.hashar_id
         WHERE cm.id = ?1`,
      )
      .bind(id)
      .first();
    if (!cm) throw new NotFoundError(TARGET_NOT_FOUND.comment);
    assertVisible(c, cm, { allowAdmin: false });
    return cm.user_id;
  }
  const u = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(id).first();
  if (!u) throw new NotFoundError(USER_NOT_FOUND);
  return u.id;
}

// POST /api/reports — {target_type, target_id, reason, details?} → 201 {ok, id}; takror (shu foydalanuvchi, shu nishon) →
// 200 {ok, id} (ochiq bo'lsa sabab / izoh yangilanadi)
reportRoutes.post('/reports', requireAuth, async (c) => {
  const uid = c.get('user').id;
  const db = c.env.DB;
  const body = await readJson(c);
  const type = body.target_type;
  if (!REPORT_TARGETS.includes(type)) throw new ValidationError("Shikoyat nishoni noto'g'ri");
  const tid = typeof body.target_id === 'number' ? body.target_id : Number(body.target_id);
  if (!Number.isSafeInteger(tid) || tid < 1) throw new ValidationError("Nishon identifikatori noto'g'ri");
  if (!REPORT_REASONS.includes(body.reason)) throw new ValidationError('Shikoyat sababini tanlang');
  const details = cleanText(typeof body.details === 'string' ? body.details : '');
  if (charLength(details) > REPORT_DETAILS_MAX) throw new ValidationError(`Izoh ${REPORT_DETAILS_MAX} belgidan oshmasin`);

  const ownerId = await loadTarget(c, db, type, tid);
  if (ownerId === uid) throw new ValidationError("O'zingizga shikoyat qila olmaysiz");
  await limitReport(c, uid);

  const find = () =>
    db
      .prepare('SELECT id, status FROM reports WHERE reporter_id = ?1 AND target_type = ?2 AND target_id = ?3')
      .bind(uid, type, tid)
      .first();
  let existing = await find();
  if (!existing) {
    const ins = await db
      .prepare(
        `INSERT OR IGNORE INTO reports (reporter_id, target_type, target_id, reason, details)
         VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id`,
      )
      .bind(uid, type, tid, body.reason, details)
      .first();
    if (ins) return c.json({ ok: true, id: ins.id }, 201);
    existing = await find(); // parallel so'rov oldin yozib qo'ygan
  }
  if (existing.status === 'open') {
    await db
      .prepare("UPDATE reports SET reason = ?2, details = ?3 WHERE id = ?1 AND status = 'open'")
      .bind(existing.id, body.reason, details)
      .run();
  }
  return c.json({ ok: true, id: existing.id });
});

// POST /api/users/:id/block → {ok, blocked: true} (idempotent)
reportRoutes.post('/users/:id/block', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  const uid = c.get('user').id;
  if (id === uid) throw new ValidationError("O'zingizni bloklay olmaysiz");
  await limitBlock(c, uid);
  // Foydalanuvchi shu orada o'chirilgan bo'lsa tashqi kalit xatosi o'rniga 0 qator → 404
  const db = c.env.DB;
  const u = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(id).first();
  if (!u) throw new NotFoundError(USER_NOT_FOUND);
  await db
    .prepare('INSERT OR IGNORE INTO user_blocks (user_id, blocked_id) SELECT ?1, id FROM users WHERE id = ?2')
    .bind(uid, id)
    .run();
  return c.json({ ok: true, blocked: true });
});

// DELETE /api/users/:id/block → {ok, blocked: false} (idempotent)
reportRoutes.delete('/users/:id/block', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'), USER_NOT_FOUND);
  const uid = c.get('user').id;
  if (id === uid) throw new ValidationError("O'zingizni bloklay olmaysiz");
  await limitBlock(c, uid);
  const db = c.env.DB;
  const u = await db.prepare('SELECT id FROM users WHERE id = ?1').bind(id).first();
  if (!u) throw new NotFoundError(USER_NOT_FOUND);
  await db.prepare('DELETE FROM user_blocks WHERE user_id = ?1 AND blocked_id = ?2').bind(uid, id).run();
  return c.json({ ok: true, blocked: false });
});

// GET /api/me/blocks — [{id, name, avatar_url, blocked_at}], oxirgi bloklangani birinchi
reportRoutes.get('/me/blocks', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.avatar_key, b.created_at AS blocked_at
     FROM user_blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.user_id = ?1 ORDER BY b.created_at DESC, u.id DESC LIMIT 500`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json(results.map((r) => ({ id: r.id, name: r.name, avatar_url: avatarUrl(r.avatar_key), blocked_at: toIso(r.blocked_at) })));
});
