// Email yuborish (Resend API) va bir martalik kod xatlari shabloni.
//
// Worker env:
//   RESEND_API_KEY — Resend API kaliti (Worker SECRET; repoda hech qachon yozilmaydi, logga chiqmaydi)
//   RESEND_FROM    — jo'natuvchi, masalan "Hasharchilar <no-reply@nfcstore.uz>" (standart — pastdagi DEFAULT_FROM)
//   EMAIL_MOCK=1   — FAQAT lokal dev / testlar: Resend chaqirilmaydi, kod javobda `dev_code` sifatida qaytadi.
//                    Production'da hech qachon o'rnatilmaydi.
import { HttpError } from './validate.js';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Hasharchilar <no-reply@nfcstore.uz>';
const SEND_TIMEOUT_MS = 8000;

export const SEND_FAILED = "Email yuborilmadi, birozdan keyin qayta urinib ko'ring";
export const EMAIL_DISABLED = 'Email xizmati sozlanmagan';

/** Soxta rejim (lokal dev / testlar): xat yuborilmaydi. */
export const isEmailMock = (env) => env?.EMAIL_MOCK === '1';

/** Email orqali ro'yxat/tasdiqlash yoqilganmi (kalit bor yoki soxta rejim). */
export const emailEnabled = (env) => Boolean(env?.RESEND_API_KEY) || isEmailMock(env);

/** Email xizmati o'chiq bo'lsa — 503. */
export function requireEmailService(env) {
  if (!emailEnabled(env)) throw new HttpError(503, EMAIL_DISABLED);
}

/**
 * Xat yuboradi (Resend). Xato bo'lsa HttpError 502 — foydalanuvchiga tushunarli matn bilan.
 * Logga faqat Resend javob statusi yoziladi (kalit, manzil, xat matni — hech qachon).
 */
export async function sendEmail(env, { to, subject, html, text }) {
  if (isEmailMock(env)) return { id: 'mock' };
  if (!env?.RESEND_API_KEY) throw new HttpError(503, EMAIL_DISABLED);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM || DEFAULT_FROM, to: [to], subject, html, text }),
      signal: ctrl.signal,
    });
  } catch (err) {
    console.error('Resend: so\'rov bajarilmadi:', err?.name === 'AbortError' ? 'timeout' : 'network');
    throw new HttpError(502, SEND_FAILED);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    console.error('Resend: xato javob, status', res.status);
    try {
      await res.body?.cancel();
    } catch {
      // e'tiborsiz
    }
    throw new HttpError(502, SEND_FAILED);
  }
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ---------- Shablon ----------

const PURPOSE_TEXT = {
  register: {
    subject: "ro'yxatdan o'tish kodi",
    title: "Ro'yxatdan o'tishni yakunlang",
    intro: "hasharchilar.uz'da ro'yxatdan o'tish uchun quyidagi tasdiqlash kodini kiriting:",
  },
  reset: {
    subject: 'parolni tiklash kodi',
    title: 'Parolni tiklash',
    intro: 'Hisobingiz parolini tiklash uchun quyidagi kodni kiriting:',
  },
  verify: {
    subject: 'emailni tasdiqlash kodi',
    title: 'Emailingizni tasdiqlang',
    intro: 'Email manzilingizni hasharchilar.uz hisobingizga bog\'lash uchun quyidagi kodni kiriting:',
  },
};

const EXPIRES_TEXT = 'Kod 10 daqiqa amal qiladi.';
const IGNORE_TEXT = "Agar bu siz bo'lmasangiz, xatni e'tiborsiz qoldiring.";

/** Bir martalik kod xati: { subject, html, text }. `code` — 6 raqam (foydalanuvchi matni shablonga kirmaydi). */
export function otpEmail(code, purpose) {
  const t = PURPOSE_TEXT[purpose] || PURPOSE_TEXT.verify;
  const digits = String(code).replace(/\D/g, '').slice(0, 6);
  const subject = `${digits} — hasharchilar.uz ${t.subject}`;
  const text = [
    'hasharchilar.uz',
    '',
    t.title,
    '',
    t.intro,
    '',
    `    ${digits}`,
    '',
    EXPIRES_TEXT,
    IGNORE_TEXT,
    '',
    '— hasharchilar.uz jamoasi',
  ].join('\n');

  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const mono = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace";
  const html = `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${t.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tasdiqlash kodingiz: ${digits}. ${EXPIRES_TEXT}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid #e1e8e4;border-radius:20px;overflow:hidden;">
        <tr>
          <td style="background:#059669;background-image:linear-gradient(135deg,#10b981,#047857);padding:22px 28px;">
            <span style="font-family:${font};font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">&#127807; hasharchilar<span style="color:#fcd34d;">.uz</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;font-family:${font};color:#0b1f17;">
            <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:800;color:#0b1f17;">${t.title}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#3c4f47;">${t.intro}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 28px;">
            <div style="display:inline-block;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:16px;padding:16px 22px;font-family:${mono};font-size:34px;line-height:1;font-weight:700;letter-spacing:10px;color:#047857;">${digits}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 28px;font-family:${font};">
            <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#0b1f17;font-weight:700;">${EXPIRES_TEXT}</p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#5f7168;">${IGNORE_TEXT}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #e1e8e4;background:#f0f4f2;font-family:${font};font-size:12px;line-height:1.5;color:#5f7168;">
            Mahallani birga obod qilamiz &middot; hasharchilar.uz
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  return { subject, html, text };
}
