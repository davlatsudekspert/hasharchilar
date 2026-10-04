// Kiruvchi ma'lumotlarni tekshirish va HTTP xato turlari.

// ---------- Xato turlari (onError ularni { error } JSON ga aylantiradi) ----------

/** Status kodli xato. `headers` — javobga qo'shiladigan qo'shimcha header'lar. */
export class HttpError extends Error {
  constructor(status, message, headers = null) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}
export class ValidationError extends HttpError {
  constructor(message) { super(400, message); }
}
export class AuthError extends HttpError {
  constructor(message = 'Avval tizimga kiring') { super(401, message); }
}
export class ForbiddenError extends HttpError {
  constructor(message = "Bu amal uchun ruxsat yo'q") { super(403, message); }
}
export class NotFoundError extends HttpError {
  constructor(message = 'Topilmadi') { super(404, message); }
}
export class ConflictError extends HttpError {
  constructor(message) { super(409, message); }
}
export class RateLimitError extends HttpError {
  constructor(message, retryAfterSec) {
    super(429, message, { 'retry-after': String(Math.max(1, retryAfterSec | 0)) });
  }
}

const BAD_REQUEST = "So'rov formati noto'g'ri";

// ---------- So'rov tanasini o'qish ----------

/** JSON obyektni o'qiydi (massiv/yaroqsiz JSON → 400). */
export async function readJson(c) {
  let body;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError(BAD_REQUEST);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError(BAD_REQUEST);
  return body;
}

const MAX_FORM_BYTES = 6 * 1024 * 1024; // 5 MB rasm + matn maydonlari
const TOO_LARGE = 'Rasm hajmi 5 MB dan oshmasligi kerak';

/**
 * So'rov tanasini oqim sifatida o'qiydi; `max` baytdan oshsa 413.
 * Content-Length bo'lmasa (chunked) ham xotirada ko'pi bilan `max` bayt yig'iladi.
 */
async function readBodyLimited(req, max) {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      chunks.length = 0; // yig'ilgani darhol bo'shatiladi
      // Qolgan qismi saqlanmasdan o'qib tashlanadi: yarim o'qilgan tana bilan javob qaytarish
      // lokal wrangler dev (miniflare) da keyingi so'rovni "Network connection lost" bilan buzadi.
      while (!(await reader.read()).done);
      throw new HttpError(413, TOO_LARGE);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

/** multipart/form-data (yoki urlencoded) formani o'qiydi (≤ 6 MB). */
export async function readForm(c) {
  const len = Number(c.req.header('content-length') || 0);
  if (len > MAX_FORM_BYTES) throw new HttpError(413, TOO_LARGE);
  const type = c.req.header('content-type') || '';
  if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)/i.test(type)) {
    throw new ValidationError(BAD_REQUEST);
  }
  const bytes = await readBodyLimited(c.req.raw, MAX_FORM_BYTES);
  try {
    return await new Response(bytes, { headers: { 'content-type': type } }).formData();
  } catch {
    throw new ValidationError(BAD_REQUEST);
  }
}

// ---------- Matn yordamchilari ----------

// Boshqaruv belgilari (\n va \t dan tashqari) olib tashlanadi
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Bir qatorli matn: boshqaruv belgilari va ortiqcha bo'shliqlarsiz. */
export function cleanLine(raw) {
  return String(raw ?? '').replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
}

/** Belgilar soni (Unicode code point) — SQLite length() kabi; emoji = 1, JS .length da 2. */
export const charLength = (s) => [...s].length;

/** Ko'p qatorli matn (tavsif): qator ko'chirishlar saqlanadi. */
export function cleanText(raw) {
  return String(raw ?? '').replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** LIKE uchun maxsus belgilarni ( \ % _ ) ekranlaydi — ESCAPE '\' bilan ishlatiladi. */
export function escapeLike(s) {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const LIKE_MAX_BYTES = 50; // D1: LIKE/GLOB shabloni ≤ 50 bayt
const utf8 = new TextEncoder();

/** Qidiruv so'zidan '%...%' shablon; D1 limitiga sig'maydigan qismi kesiladi. */
export function likePattern(q) {
  let body = '';
  let bytes = 2; // ikki tomondagi '%'
  for (const ch of q) {
    const piece = escapeLike(ch);
    const n = utf8.encode(piece).length;
    if (bytes + n > LIKE_MAX_BYTES) break;
    body += piece;
    bytes += n;
  }
  return `%${body}%`;
}

/** SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) → ISO 'YYYY-MM-DDTHH:MM:SSZ'. */
export function toIso(s) {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
}

// ---------- Maydonlar ----------

/** Telefonni +998XXXXXXXXX ko'rinishiga keltiradi. */
export function parsePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const full = digits.length === 9 ? `998${digits}` : digits;
  if (!/^998\d{9}$/.test(full)) throw new ValidationError("Telefon raqami noto'g'ri (+998 90 123 45 67)");
  return `+${full}`;
}

/** Foydalanuvchi ismi: 2–60 belgi. */
export function parseName(raw) {
  const name = cleanLine(raw);
  if (name.length < 2 || name.length > 60) throw new ValidationError("Ism 2–60 belgidan iborat bo'lsin");
  return name;
}

export const PASSWORD_MAX = 128;

/** Yangi parol: kamida 6 belgi. */
export function parsePassword(raw) {
  const pw = typeof raw === 'string' ? raw : '';
  if (pw.length < 6) throw new ValidationError("Parol kamida 6 belgidan iborat bo'lsin");
  if (pw.length > PASSWORD_MAX) throw new ValidationError('Parol juda uzun');
  return pw;
}

/** URL dagi musbat butun ID; noto'g'ri bo'lsa — 404. */
export function parseId(raw, message = 'Hashar topilmadi') {
  const s = String(raw ?? '');
  if (!/^[1-9]\d{0,9}$/.test(s)) throw new NotFoundError(message);
  return Number(s);
}

// Toshkent vaqti — doimiy UTC+5 (yozgi vaqt yo'q)
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const PAST_TOLERANCE_MS = 60 * 60 * 1000; // 1 soat bag'rikenglik
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * 'YYYY-MM-DDTHH:MM' (Toshkent vaqti) ni tekshiradi.
 * notPast=true bo'lsa, o'tmishdagi sana rad etiladi (1 soat bag'rikenglik bilan).
 */
export function parseDateTime(raw, { notPast = false, now = Date.now() } = {}) {
  const s = String(raw ?? '').trim();
  const m = DATE_TIME_RE.exec(s);
  const invalid = () => new ValidationError("Sana va vaqtni to'g'ri kiriting");
  if (!m) throw invalid();
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (y < 2000 || y > 2100 || h > 23 || mi > 59) throw invalid();
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const dt = new Date(utc);
  // 2027-02-30 kabi mavjud bo'lmagan sanalarni ushlaydi
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw invalid();
  if (notPast && utc - TASHKENT_OFFSET_MS < now - PAST_TOLERANCE_MS) {
    throw new ValidationError("Sana o'tmishda bo'lishi mumkin emas");
  }
  return s;
}

/** "Kerakli narsalar": JSON massiv, ≤ 12 ta, har biri ≤ 40 belgi. */
export function parseItems(raw) {
  if (raw == null || raw === '') return [];
  let arr;
  try {
    arr = JSON.parse(String(raw));
  } catch {
    throw new ValidationError("Kerakli narsalar formati noto'g'ri");
  }
  if (!Array.isArray(arr)) throw new ValidationError("Kerakli narsalar formati noto'g'ri");
  const items = [];
  for (const it of arr) {
    if (typeof it !== 'string' && typeof it !== 'number') throw new ValidationError("Kerakli narsalar formati noto'g'ri");
    const s = cleanLine(it);
    if (!s) continue;
    if (s.length > 40) throw new ValidationError("Har bir narsa nomi 40 belgidan oshmasin");
    if (!items.some((x) => x.toLowerCase() === s.toLowerCase())) items.push(s);
  }
  if (items.length > 12) throw new ValidationError("Kerakli narsalar 12 tadan oshmasin");
  return items;
}

/** Koordinata: son va [-max, max] oralig'ida. */
function parseCoord(raw, max) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  const n = s === '' ? NaN : Number(s);
  if (!Number.isFinite(n) || Math.abs(n) > max) throw new ValidationError('Joylashuvni xaritada belgilang');
  return Math.round(n * 1e6) / 1e6;
}

/** Hashar yaratish formasidagi maydonlarni tekshiradi va tozalaydi. */
export function parseHasharFields(form, { now = Date.now() } = {}) {
  const str = (k) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : '';
  };

  // Uzunlik belgilar (code point) bo'yicha — D1 dagi CHECK (length(...)) bilan bir xil hisob
  const title = cleanLine(str('title'));
  const titleLen = charLength(title);
  if (titleLen < 3 || titleLen > 120) throw new ValidationError("Sarlavha 3–120 belgidan iborat bo'lsin");

  const description = cleanText(str('description'));
  if (charLength(description) > 1000) throw new ValidationError('Tavsif 1000 belgidan oshmasin');

  const address = cleanLine(str('address'));
  if (charLength(address) > 200) throw new ValidationError('Manzil 200 belgidan oshmasin');

  return {
    title,
    description,
    address,
    lat: parseCoord(form.get('lat'), 90),
    lng: parseCoord(form.get('lng'), 180),
    date_time: parseDateTime(str('date_time'), { notPast: true, now }),
    items: parseItems(form.get('items')),
  };
}
