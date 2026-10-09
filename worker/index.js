// hasharchilar.uz — Hono API (Cloudflare Workers + D1 yoki SQLite Durable Object + R2).
// Statik React build (dist/) Workers Static Assets orqali beriladi; bu yerga faqat /api/* keladi.
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { adminRoutes } from './admin.js';
import { authRoutes, optionalAuth } from './auth.js';
import { checkinRoutes } from './checkin.js';
import { DoDatabase } from './d1-adapter.js';
import { emailEnabled } from './email.js';
import { HasharDB } from './do-db.js';
import { geoRoutes } from './geo.js';
import { getStats, hasharRoutes } from './hashars.js';
import { mediaRoutes } from './media.js';
import { notifyRoutes } from './notify.js';
import { providersOf } from './payconfig.js';
import { paymentRoutes } from './payments.js';
import { saveRoutes } from './saves.js';
import { getSettings } from './settings.js';
import { socialRoutes } from './social.js';
import { HttpError } from './validate.js';

const app = new Hono();

// ---------- CORS (sayt, Capacitor APK, lokal dev) ----------

const ALLOWED_ORIGINS = new Set([
  'https://localhost', // Capacitor Android (androidScheme: https)
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5173', // Vite dev
]);

/** Ruxsat etilgan origin yoki null. So'rov kelgan host'ning o'zi ham ruxsat etiladi. */
function allowedOrigin(origin, requestUrl) {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const o = new URL(origin);
    if ((o.protocol === 'https:' || o.protocol === 'http:') && o.host === new URL(requestUrl).host) return origin;
  } catch {
    // "null" yoki buzilgan origin
  }
  return null;
}

app.use('/api/*', async (c, next) => {
  const allow = allowedOrigin(c.req.header('origin'), c.req.url);

  // Preflight
  if (c.req.method === 'OPTIONS') {
    const headers = { vary: 'Origin' };
    if (allow) {
      Object.assign(headers, {
        'access-control-allow-origin': allow,
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type, X-Client',
        'access-control-max-age': '86400',
      });
    }
    return new Response(null, { status: 204, headers });
  }

  await next();

  const h = c.res.headers;
  h.append('vary', 'Origin');
  if (allow) h.set('access-control-allow-origin', allow);
  h.set('x-content-type-options', 'nosniff');
  // JSON javoblar keshlanmaydi (rasm/APK o'z cache-control'ini qo'yadi)
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
});

// ---------- Autentifikatsiya (mehmon ham o'tadi; majburiylari requireAuth bilan) ----------

app.use('/api/*', optionalAuth);

// ---------- Marshrutlar ----------

app.get('/api/health', (c) => c.json({ ok: true }));
// Mijoz sozlamalari: email bilan ro'yxat yoqilganmi (RESEND_API_KEY yoki EMAIL_MOCK); v4: hashar e'lon qilish
// narxi (so'm; 0 — bepul), sozlangan to'lov usullari va qo'lda to'lov izohi
app.get('/api/config', async (c) => {
  const s = await getSettings(c.env.DB);
  return c.json({
    email_enabled: emailEnabled(c.env),
    hashar_fee: s.hashar_fee,
    payments: providersOf(c.env),
    manual_payment_note: s.manual_payment_note,
  });
});
app.get('/api/stats', getStats);
app.route('/api', authRoutes); // /api/auth/*, /api/me, /api/me/email/*
app.route('/api/hashars', hasharRoutes);
app.route('/api', socialRoutes); // /api/hashars/:id/comments, /api/comments/:id, /api/users/:id, /api/leaderboard
app.route('/api', paymentRoutes); // /api/hashars/:id/payment, /api/payments/payme, /api/payments/click/*
app.route('/api', saveRoutes); // /api/hashars/:id/save, /api/me/saves
app.route('/api', notifyRoutes); // /api/me/notifications, /unread-count, /read
app.route('/api', checkinRoutes); // /api/hashars/:id/checkin-code, /checkin, /checkins
app.route('/api/geo', geoRoutes); // /api/geo/search, /api/geo/reverse (Nominatim proksi + kesh)
app.route('/api', mediaRoutes); // /api/media/*, /api/app, /api/app/download
app.route('/api/admin', adminRoutes); // admin panel (faqat administratorlar)

// ---------- Xatolar ----------

app.notFound((c) => c.json({ error: 'Topilmadi' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    if (err.headers) for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
    return c.json(err.code ? { error: err.message, code: err.code } : { error: err.message }, err.status);
  }
  if (err instanceof HTTPException && err.status < 500) {
    return c.json({ error: "So'rov noto'g'ri" }, err.status);
  }
  console.error(err);
  return c.json({ error: 'Server xatosi' }, 500);
});

// ---------- Baza: D1 (binding DB) bo'lsa — o'zi, aks holda HasharDB Durable Object ----------

// DO id izolyatsiya bo'yicha keshlanadi; stub esa har so'rovda yangi (stub — I/O obyekti,
// boshqa so'rov kontekstida ishlatib bo'lmaydi; yaratish arzon, tarmoqqa murojaat qilmaydi).
let doId = null;

/** env.DB bor bo'lsa env o'zgarishsiz; yo'q bo'lsa DB = D1 bilan bir xil adapter (HASHAR_DB ustida). */
function withDb(env) {
  if (env.DB) return env;
  if (!env.HASHAR_DB) throw new Error("Baza binding'i yo'q: na D1 (DB), na Durable Object (HASHAR_DB)");
  doId ??= env.HASHAR_DB.idFromName('main');
  // eeur — O'zbekistonga eng yaqin hudud (faqat birinchi yaratilishda ahamiyatli)
  const stub = env.HASHAR_DB.get(doId, { locationHint: 'eeur' });
  return { ...env, DB: new DoDatabase(stub) };
}

export { HasharDB };

export default {
  fetch: (req, env, ctx) => app.fetch(req, withDb(env), ctx),
};
