// Saqlanganlar (xatcho'p): POST/DELETE /api/hashars/:id/save, GET /api/me/saves.
// Faqat kirgan foydalanuvchi; to'lanmagan boshqa hashar saqlanmaydi (404), ro'yxatda faqat ko'rinadiganlari.
import { Hono } from 'hono';
import { isAdmin, requireAuth } from './auth.js';
import { VISIBLE_SQL, assertVisible, getMeta, hasharSelect, toDto } from './hashars.js';
import { limitSave } from './ratelimit.js';
import { ValidationError, parseId, toIso } from './validate.js';

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;

export const saveRoutes = new Hono();

// POST /api/hashars/:id/save → {saved: true} (idempotent)
saveRoutes.post('/hashars/:id/save', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  const db = c.env.DB;
  const h = await getMeta(db, id);
  assertVisible(c, h, { allowAdmin: false });
  await limitSave(c, uid);
  // Hashar shu orada o'chirilgan bo'lsa tashqi kalit xatosi o'rniga 0 qator
  await db
    .prepare('INSERT OR IGNORE INTO saves (user_id, hashar_id) SELECT ?1, id FROM hashars WHERE id = ?2')
    .bind(uid, id)
    .run();
  return c.json({ saved: true });
});

// DELETE /api/hashars/:id/save → {saved: false} (idempotent; hashar o'chirilgan bo'lsa ham)
saveRoutes.delete('/hashars/:id/save', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const uid = c.get('user').id;
  await limitSave(c, uid);
  await c.env.DB.prepare('DELETE FROM saves WHERE user_id = ?1 AND hashar_id = ?2').bind(uid, id).run();
  return c.json({ saved: false });
});

// GET /api/me/saves?offset=&limit= — HasharDTO[] (+ saved_at), oxirgi saqlangani birinchi
saveRoutes.get('/me/saves', requireAuth, async (c) => {
  const user = c.get('user');
  const int = (k, def) => {
    const v = c.req.query(k);
    if (v == null || v === '') return def;
    if (!/^\d{1,6}$/.test(v)) throw new ValidationError(`${k} qiymati noto'g'ri`);
    return Number(v);
  };
  const offset = int('offset', 0);
  const limit = int('limit', PAGE_DEFAULT);
  if (limit < 1 || limit > PAGE_MAX) throw new ValidationError(`limit 1–${PAGE_MAX} oralig'ida bo'lsin`);
  const { results } = await c.env.DB.prepare(
    `${hasharSelect(', sv.created_at AS saved_at')}
     JOIN saves sv ON sv.hashar_id = h.id AND sv.user_id = ?1
     WHERE ${VISIBLE_SQL}
     ORDER BY sv.created_at DESC, h.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(user.id, limit, offset)
    .all();
  const admin = isAdmin(user, c.env);
  return c.json(results.map((r) => ({ ...toDto(r, user.id, { admin }), saved_at: toIso(r.saved_at) })));
});
