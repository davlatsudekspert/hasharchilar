// Hashar e'lon qilish to'lovi: to'lov havolalari, GET /api/hashars/:id/payment (egasi/admin) va
// provayder callback'lari (Payme JSON-RPC — worker/payme.js, Click — worker/click.js).
// Narx — settings.hashar_fee (so'm, standart 5000; 0 — bepul). Qo'lda to'lov — admin tasdiqlaydi
// (POST /api/admin/hashars/:id/mark-paid), egasiga settings.manual_payment_note ko'rsatiladi.
import { Hono } from 'hono';
import { isAdmin, requireAuth } from './auth.js';
import { clickHandler } from './click.js';
import { lastPaidStmt, paymentDto, waiveStmts } from './payledger.js';
import { handlePayme } from './payme.js';
import { clickConfig, clickPayUrl, paymeCheckoutUrl, paymeConfig, providersOf, returnUrl } from './payconfig.js';
import { getSettings } from './settings.js';
import { NotFoundError, parseId } from './validate.js';

const HASHAR_NOT_FOUND = 'Hashar topilmadi';
const HISTORY_LIMIT = 50;

/**
 * To'lovdan keyin qaytiladigan sayt manzili: so'rov kelgan veb-sahifa (Origin — shu host yoki Vite dev),
 * aks holda SITE_URL (ixtiyoriy env) yoki API ning o'z manzili (sayt va API — bitta Worker).
 * APK (https://localhost, capacitor://) uchun — sayt manzili (to'lov tashqi brauzerda ochiladi).
 */
export function siteOrigin(c) {
  const self = new URL(c.req.url);
  const origin = c.req.header('origin');
  if (origin) {
    try {
      const o = new URL(origin);
      if ((o.protocol === 'https:' || o.protocol === 'http:') && (o.host === self.host || o.origin === 'http://localhost:5173')) {
        return o.origin;
      }
    } catch {
      // buzilgan Origin — e'tiborsiz
    }
  }
  const site = String(c.env?.SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/\s]+$/.test(site)) return site;
  return self.origin;
}

/**
 * Egasiga ko'rsatiladigan to'lov ma'lumotlari: { amount (so'm), payme_url?, click_url?, manual_note? }.
 * Havolalar faqat sozlangan provayderlar uchun.
 */
export function paymentInfo(c, hasharId, settings) {
  const amount = settings.hashar_fee;
  const out = { amount };
  if (amount > 0) {
    const back = returnUrl(siteOrigin(c), hasharId);
    const payme = paymeConfig(c.env);
    if (payme.enabled) out.payme_url = paymeCheckoutUrl(payme, { hasharId, amountTiyin: amount * 100, returnTo: back });
    const click = clickConfig(c.env);
    if (click.enabled) out.click_url = clickPayUrl(click, { hasharId, amountSom: amount, returnTo: back });
  }
  if (settings.manual_payment_note) out.manual_note = settings.manual_payment_note;
  return out;
}

export const paymentRoutes = new Hono();

// GET /api/hashars/:id/payment — egasi yoki admin: {hashar_id, status, amount, currency, providers,
// payme_url?, click_url?, manual_note?, history: PaymentDTO[]}. Havolalar faqat to'lanmagan hasharda.
// amount: to'lanmagan — joriy narx (so'm); to'langan — haqiqatan to'langan summa (oxirgi muvaffaqiyatli to'lov),
// to'lov yozuvi bo'lmasa (bepul / v4 dan oldingi / 'waived') — null.
// Narx 0 (bepul) bo'lsa egasining to'lanmagan hashari shu yerda bepul e'lon qilinadi ('waived' + 'published'):
// "0 so'm to'lang" ko'rsatilmaydi (narx 0 ga tushganda ham, to'lov qaytarilganda ham).
paymentRoutes.get('/hashars/:id/payment', requireAuth, async (c) => {
  const id = parseId(c.req.param('id'));
  const user = c.get('user');
  const db = c.env.DB;
  const [h, hist, last] = await db.batch([
    db.prepare('SELECT id, creator_id, payment_status FROM hashars WHERE id = ?1').bind(id),
    db.prepare(`SELECT * FROM payments WHERE hashar_id = ?1 ORDER BY id DESC LIMIT ${HISTORY_LIMIT}`).bind(id),
    lastPaidStmt(db, id),
  ]);
  const row = h.results[0];
  // Boshqalarga hashar borligi ham aytilmaydi
  if (!row || (row.creator_id !== user.id && !isAdmin(user, c.env))) throw new NotFoundError(HASHAR_NOT_FOUND);
  const settings = await getSettings(db);
  let status = row.payment_status;
  if (status === 'unpaid' && settings.hashar_fee === 0 && row.creator_id === user.id) {
    await db.batch(waiveStmts(db, id));
    const now = await db.prepare('SELECT payment_status FROM hashars WHERE id = ?1').bind(id).first();
    if (!now) throw new NotFoundError(HASHAR_NOT_FOUND);
    status = now.payment_status;
  }
  const paid = last.results[0];
  const info = status === 'unpaid' ? paymentInfo(c, id, settings) : { amount: paid ? Math.round(paid.amount / 100) : null };
  return c.json({
    hashar_id: id,
    status,
    ...info,
    currency: 'UZS',
    providers: providersOf(c.env),
    history: hist.results.map(paymentDto),
  });
});

// Payme Merchant API (JSON-RPC). POST bo'lmagan so'rovlarga ham JSON-RPC xatosi (-32300).
paymentRoutes.all('/payments/payme', handlePayme);

// Click Shop API
paymentRoutes.post('/payments/click/prepare', clickHandler(0));
paymentRoutes.post('/payments/click/complete', clickHandler(1));
