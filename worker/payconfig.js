// To'lov provayderlari sozlamasi (Worker secret'lari) va to'lov havolalari. Sof funksiyalar — Node testlarida
// ham import qilinadi (cloudflare:* importlari yo'q).
//
// Worker secret'lari (CI GitHub secret'lardan o'tkazadi: HASHARCHILAR_PAYME_MERCHANT_ID va h.k.):
//   PAYME_MERCHANT_ID, PAYME_KEY          — Payme Business kassasi ID si va kaliti (Basic auth: "Paycom:<KEY>")
//   PAYME_TEST_KEY, PAYME_TEST_MODE=1     — ixtiyoriy: sinov rejimi (test.paycom.uz, test kaliti)
//   CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_SECRET_KEY — Click Shop API (md5 imzo)
//   CLICK_MERCHANT_USER_ID                — ixtiyoriy (Click Merchant API uchun; Shop API havolasida ishlatilmaydi)
// Kalitlar repoga HECH QACHON yozilmaydi; lokal testlarda soxta qiymatlar `--var` bilan beriladi (README → Testlar).

export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000; // Payme: 12 soatda bajarilmagan tranzaksiya bekor qilinadi
export const PAYME_CHECKOUT = 'https://checkout.paycom.uz';
export const PAYME_CHECKOUT_TEST = 'https://test.paycom.uz';
export const CLICK_PAY_URL = 'https://my.click.uz/services/pay';

const str = (v) => String(v ?? '').trim();
const isOn = (v) => ['1', 'true', 'yes'].includes(str(v).toLowerCase());

/** Payme sozlamasi: { enabled, merchantId, key, testMode, checkoutBase }. */
export function paymeConfig(env) {
  const merchantId = str(env?.PAYME_MERCHANT_ID);
  const testMode = isOn(env?.PAYME_TEST_MODE);
  // Sinov rejimida Payme sandbox test kaliti bilan murojaat qiladi (bo'lmasa asosiy kalit)
  const key = testMode ? str(env?.PAYME_TEST_KEY) || str(env?.PAYME_KEY) : str(env?.PAYME_KEY);
  return {
    enabled: Boolean(merchantId && key),
    merchantId,
    key,
    testMode,
    checkoutBase: testMode ? PAYME_CHECKOUT_TEST : PAYME_CHECKOUT,
  };
}

/** Click sozlamasi: { enabled, serviceId, merchantId, secretKey, merchantUserId }. */
export function clickConfig(env) {
  const serviceId = str(env?.CLICK_SERVICE_ID);
  const merchantId = str(env?.CLICK_MERCHANT_ID);
  const secretKey = str(env?.CLICK_SECRET_KEY);
  return {
    enabled: Boolean(serviceId && merchantId && secretKey),
    serviceId,
    merchantId,
    secretKey,
    merchantUserId: str(env?.CLICK_MERCHANT_USER_ID),
  };
}

/** Mijozga ko'rsatiladigan provayderlar holati (qo'lda to'lov doim mavjud — admin tasdiqlaydi). */
export const providersOf = (env) => ({ payme: paymeConfig(env).enabled, click: clickConfig(env).enabled, manual: true });

/** UTF-8 satr → base64. */
export function base64Utf8(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** To'lovdan keyin qaytish manzili: <origin>/#/hashar/<id>?tolov=1 */
export const returnUrl = (origin, hasharId) => `${origin}/#/hashar/${hasharId}?tolov=1`;

/**
 * Payme checkout havolasi: <base>/base64('m=<merchant>;ac.hashar_id=<id>;a=<tiyin>;c=<return_url>').
 * Summa tiyinda (5000 so'm = 500000).
 */
export function paymeCheckoutUrl(cfg, { hasharId, amountTiyin, returnTo }) {
  return `${cfg.checkoutBase}/${base64Utf8(`m=${cfg.merchantId};ac.hashar_id=${hasharId};a=${amountTiyin};c=${returnTo}`)}`;
}

/** Click to'lov havolasi (summa so'mda, transaction_param = hashar ID). */
export function clickPayUrl(cfg, { hasharId, amountSom, returnTo }) {
  const q = new URLSearchParams({
    service_id: cfg.serviceId,
    merchant_id: cfg.merchantId,
    amount: String(amountSom),
    transaction_param: String(hasharId),
    return_url: returnTo,
  });
  return `${CLICK_PAY_URL}?${q}`;
}

/**
 * Click imzosi uchun satr (md5 dan oldin):
 *   prepare:  click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time
 *   complete: click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time
 */
export function clickSignSource(body, secretKey, complete) {
  const f = (k) => String(body?.[k] ?? '');
  return (
    f('click_trans_id') + f('service_id') + secretKey + f('merchant_trans_id') +
    (complete ? f('merchant_prepare_id') : '') + f('amount') + f('action') + f('sign_time')
  );
}

/** Payme/Click tranzaksiya holati → umumiy status (tarix va admin ro'yxati uchun). */
export function paymentStatus(provider, state) {
  if (provider === 'payme') return { 1: 'pending', 2: 'paid', [-1]: 'cancelled', [-2]: 'refunded' }[state] ?? 'unknown';
  if (provider === 'click') return { 0: 'pending', 1: 'paid', [-1]: 'cancelled' }[state] ?? 'unknown';
  return state === 1 ? 'paid' : 'cancelled'; // manual
}

/** Muvaffaqiyatli (pul tushgan) to'lov sharti — SQL (p — payments aliasi). */
export const PAID_SQL = "((p.provider = 'payme' AND p.state = 2) OR (p.provider IN ('click', 'manual') AND p.state = 1))";
