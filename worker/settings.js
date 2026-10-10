// Admin sozlamalari (settings jadvali): hashar_fee — hashar e'lon qilish narxi (so'm, standart 5000; 0 — bepul),
// manual_payment_note — qo'lda to'lov uchun egasiga ko'rsatiladigan matn (masalan, karta raqami),
// payment_telegram — to'lov uchun yoziladigan Telegram admin (username, @ siz; standart developer_alii; '' — o'chiq).
// Ichki qiymatlar (checkin_secret) ham shu jadvalda, lekin API orqali hech qachon qaytarilmaydi.
import { ValidationError, charLength, cleanText } from './validate.js';

export const DEFAULT_FEE = 5000;
export const FEE_MAX = 10_000_000;
export const NOTE_MAX = 500;
export const DEFAULT_TELEGRAM = 'developer_alii';

/** Bazadagi qiymat → narx (buzilgan / yo'q bo'lsa standart). */
function storedFee(v) {
  const n = Number(v);
  return v != null && v !== '' && Number.isSafeInteger(n) && n >= 0 && n <= FEE_MAX ? n : DEFAULT_FEE;
}

/** { hashar_fee, manual_payment_note, payment_telegram } */
export async function getSettings(db) {
  const { results } = await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('hashar_fee', 'manual_payment_note', 'payment_telegram')")
    .all();
  const map = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    hashar_fee: storedFee(map.hashar_fee),
    manual_payment_note: map.manual_payment_note ?? '',
    payment_telegram: map.payment_telegram ?? DEFAULT_TELEGRAM,
  };
}

/** Narx: butun son 0..10 000 000 so'm (son yoki raqamli satr). */
export function parseFee(raw, label = 'Narx') {
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  const n = /^\d{1,8}$/.test(s) ? Number(s) : NaN;
  if (!(n >= 0 && n <= FEE_MAX)) {
    throw new ValidationError(`${label} 0 dan 10 000 000 so'mgacha butun son bo'lsin`);
  }
  return n;
}

/** Qo'lda to'lov izohi: ko'p qatorli, ≤ 500 belgi (bo'sh mumkin). */
export function parseNote(raw, label = 'Izoh') {
  if (raw != null && typeof raw !== 'string') throw new ValidationError(`${label} matn bo'lsin`);
  const note = cleanText(raw ?? '');
  if (charLength(note) > NOTE_MAX) throw new ValidationError(`${label} ${NOTE_MAX} belgidan oshmasin`);
  return note;
}

/** Telegram username: @ va t.me/ olib tashlanadi; 5–32 belgi (lotin harf, raqam, _) yoki bo'sh (o'chiq). */
export function parseTelegram(raw, label = 'Telegram') {
  if (raw != null && typeof raw !== 'string') throw new ValidationError(`${label} matn bo'lsin`);
  const u = String(raw ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '');
  if (u && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u)) {
    throw new ValidationError(`${label}: 5–32 belgili username (lotin harf, raqam, _), masalan developer_alii`);
  }
  return u;
}

/** Sozlamani yozish (UPSERT) — db.batch uchun so'rov. */
export const setSettingStmt = (db, key, value) =>
  db
    .prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value));
