// Birinchi administratorni tayinlash (bir martalik).
// Bazada role='admin' bo'lgan birorta ham foydalanuvchi bo'lmagandagina ishlaydi: tizimga kirgan
// foydalanuvchi maxfiy bootstrap kalitini yuborsa, o'zi admin bo'ladi. Repoda faqat kalitning
// SHA-256 xeshi turadi (yuqori entropiyali tasodifiy kalit — xeshdan tiklab bo'lmaydi).
// Birinchi admin paydo bo'lgach endpoint doim 409 qaytaradi; keyingi adminlarni panel orqali tayinlang.
import { Hono } from 'hono';
import { requireAuth, sha256Hex } from './auth.js';
import { limitAuth } from './ratelimit.js';
import { ConflictError, ForbiddenError, readJson } from './validate.js';

const BOOTSTRAP_TOKEN_SHA256 = '081bf4a695d005700ebc19ae26cacce04ab6ba6befd0b57976ba92bd712f7c77';

export const bootstrapRoutes = new Hono();

bootstrapRoutes.post('/bootstrap-admin', requireAuth, async (c) => {
  await limitAuth(c); // urinishlar IP bo'yicha cheklanadi (login bilan bir xil)
  const body = await readJson(c);
  const token = typeof body.token === 'string' ? body.token : '';
  const hash = await sha256Hex(token);
  // Doimiy vaqtli solishtirish
  let diff = hash.length ^ BOOTSTRAP_TOKEN_SHA256.length;
  for (let i = 0; i < Math.min(hash.length, BOOTSTRAP_TOKEN_SHA256.length); i++) {
    diff |= hash.charCodeAt(i) ^ BOOTSTRAP_TOKEN_SHA256.charCodeAt(i);
  }
  if (!token || diff !== 0) throw new ForbiddenError("Kalit noto'g'ri");

  const existing = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first();
  if (existing.n > 0) throw new ConflictError('Administrator allaqachon tayinlangan');

  const user = c.get('user');
  await c.env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(user.id).run();
  return c.json({ ok: true, user_id: user.id });
});
