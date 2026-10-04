// Umumiy yordamchilar: sana (Toshkent vaqti), masofa, telefon, tartiblash.
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

export const TASHKENT = { lat: 41.3111, lng: 69.2797 };

/** Hozirgi Toshkent vaqti "YYYY-MM-DDTHH:MM" (UTC+5). */
export function tashkentNow(offsetMinutes = 0) {
  return new Date(Date.now() + (5 * 60 + offsetMinutes) * 60000).toISOString().slice(0, 16);
}

/** Ertangi kun (Toshkent) "YYYY-MM-DD". */
export const tashkentTomorrow = () => tashkentNow(24 * 60).slice(0, 10);

function parts(iso) {
  let s = String(iso || '');
  // "...Z" — haqiqiy UTC lahza (created_at, completed_at): Toshkent vaqtiga (UTC+5) o'tkaziladi.
  // date_time ("YYYY-MM-DDTHH:MM", allaqachon Toshkent vaqti) o'zgarmaydi.
  if (/Z$/i.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) s = new Date(t + 5 * 3600e3).toISOString();
  }
  const [date = '', time = ''] = s.replace(' ', 'T').split('T');
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, time: time.slice(0, 5), date };
}

/** "2027-10-11T09:00" → "11-oktabr, 09:00" (bugun/ertaga bo'lsa shunday yoziladi). */
export function formatDateTime(iso) {
  const { y, m, d, time, date } = parts(iso);
  if (!y || !m || !d) return '';
  const today = tashkentNow().slice(0, 10);
  if (date === today) return `Bugun, ${time}`;
  if (date === tashkentTomorrow()) return `Ertaga, ${time}`;
  const year = String(y) !== today.slice(0, 4) ? ` ${y}` : '';
  return `${d}-${MONTHS[m - 1]}${year}, ${time}`;
}

/** "2027-10-11T09:00" → "Shanba, 11-oktabr 2027 · 09:00" (tafsilot uchun). */
export function formatDateLong(iso) {
  const { y, m, d, time } = parts(iso);
  if (!y || !m || !d) return '';
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${d}-${MONTHS[m - 1]} ${y}${time ? ` · ${time}` : ''}`;
}

/** Faqat sana: "11-oktabr 2027". */
export function formatDay(iso) {
  const { y, m, d } = parts(iso);
  if (!y || !m || !d) return '';
  return `${d}-${MONTHS[m - 1]} ${y}`;
}

/** Qisqa raqamli sana: "04.10.2026" (tor jadval kataklari uchun). */
export function formatDateShort(iso) {
  const { y, m, d } = parts(iso);
  if (!y || !m || !d) return '';
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** "2026-10" → "oktabr 2026" (a'zo bo'lgan sana). */
export function formatMonth(iso) {
  const { y, m } = parts(iso);
  if (!y || !m) return '';
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Geolokatsiya xatosi turi: 'denied' (ruxsat yo'q, kod 1), 'unavailable' (GPS/joylashuv xizmati
 * o'chiq, kod 2), 'timeout' (aniqlab bo'lmadi, kod 3).
 */
export function geoErrorKind(err) {
  if (err && err.code === 2) return 'unavailable';
  if (err && err.code === 3) return 'timeout';
  return 'denied';
}

/** Ikki nuqta orasidagi masofa (km), haversine formulasi. */
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const formatKm = (km) => (km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

/** Telefonni +998XXXXXXXXX ko'rinishiga keltiradi; noto'g'ri bo'lsa null. */
export function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 9) digits = `998${digits}`;
  return /^998\d{9}$/.test(digits) ? `+${digits}` : null;
}

/** "+998901234567" → "+998 90 123 45 67". */
export function formatPhone(phone) {
  const n = normalizePhone(phone);
  if (!n) return phone || '';
  return `+998 ${n.slice(4, 6)} ${n.slice(6, 9)} ${n.slice(9, 11)} ${n.slice(11, 13)}`;
}

/**
 * Ism bosh harfi(lari): "Aziz Karimov" → "AK". Har so'zdan birinchi harf/raqam olinadi (emoji, tirnoq,
 * ʻ belgilari o'tkazib yuboriladi; harfi yo'q so'z tashlanadi). Kod nuqtasi bo'yicha — surrogat juftlik bo'linmaydi.
 */
const INITIAL_RE = /[\p{Lu}\p{Ll}\p{Lt}\p{Lo}\p{N}]/u;
export function initials(name) {
  const letters = String(name || '')
    .trim()
    .split(/\s+/)
    .map((w) => Array.from(w).find((ch) => INITIAL_RE.test(ch)))
    .filter(Boolean);
  if (!letters.length) return '?';
  return (letters[0] + (letters[1] || '')).toUpperCase();
}

/** Boshlangandan keyin shuncha vaqt "Hozir" (qo'shilish mumkin), keyin — o'tib ketgan. */
const ONGOING_MIN = 3 * 60;

/**
 * Sanasi o'tib ketgan, lekin yakunlanmagan (PENDING) hashar: tashkilotchi "Yakunlash"ni bosmagan.
 * Kutilayotganlar qatorida ko'rsatilmaydi, "Qatnashish" va "Kalendar" o'chiriladi.
 */
export function isOverdue(h) {
  return !!h && h.status === 'PENDING' && !!h.date_time && String(h.date_time) < tashkentNow(-ONGOING_MIN);
}

/** Ko'rinadigan holat: 'PENDING' | 'COMPLETED' | 'PAST' (o'tib ketgan, yakunlanmagan). */
export const statusOf = (h) => (isOverdue(h) ? 'PAST' : h.status);

/**
 * Tartib: kelgusi PENDING (yaqini birinchi) → COMPLETED (eng yangisi) → o'tib ketgan PENDING (yaqinda o'tgani birinchi).
 * Server SPEC bo'yicha PENDING'ni sana o'sishida beradi — eskirganlar tepada qolmasligi uchun mijozda qayta saralanadi.
 */
export function compareHashars(a, b) {
  const rank = (h) => (h.status === 'COMPLETED' ? 1 : isOverdue(h) ? 2 : 0);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return String(a.date_time).localeCompare(String(b.date_time));
  if (ra === 2) return String(b.date_time).localeCompare(String(a.date_time));
  return String(b.completed_at || b.date_time).localeCompare(String(a.completed_at || a.date_time));
}

export function sortHashars(list) {
  return [...list].sort(compareHashars);
}

/** Qidiruv: nom, manzil, tavsif bo'yicha (katta-kichik harf farqsiz). */
export function matchesQuery(h, q) {
  if (!q) return true;
  return `${h.title || ''} ${h.address || ''} ${h.description || ''}`.toLowerCase().includes(q);
}

/** "12 ko'ngilli" */
export const volunteersLabel = (n) => `${n || 0} ko'ngilli`;

/** OpenStreetMap havolasi (tashqi xaritada ochish). */
export const osmLink = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

export const cx = (...c) => c.filter(Boolean).join(' ');

/** "3 daqiqa oldin" kabi nisbiy vaqt (UTC "…Z" yoki SQLite "YYYY-MM-DD HH:MM:SS" UTC). */
export function timeAgo(iso) {
  if (!iso) return '';
  let s = String(iso);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = `${s.replace(' ', 'T')}Z`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return 'hozirgina';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} soat oldin`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} kun oldin`;
  return formatDay(iso);
}

/** Hashar boshlanishigacha qolgan vaqt: "3 kun qoldi", "Bugun", "Hozir" (boshlangan), null (o'tib ketgan). */
export function countdown(dateTime) {
  const now = tashkentNow();
  const d = String(dateTime || '');
  if (!d) return null;
  if (d < now) return d >= tashkentNow(-ONGOING_MIN) ? 'Hozir' : null;
  const today = now.slice(0, 10);
  if (d.slice(0, 10) === today) return 'Bugun';
  if (d.slice(0, 10) === tashkentTomorrow()) return 'Ertaga';
  const days = Math.round((Date.parse(`${d.slice(0, 10)}T00:00Z`) - Date.parse(`${today}T00:00Z`)) / 86400000);
  return `${days} kun qoldi`;
}

/** Sana qismlari kartadagi "kalendar varag'i" uchun: { day: "11", month: "APR" }. */
const MONTHS_SHORT = ['YAN', 'FEV', 'MAR', 'APR', 'MAY', 'IYN', 'IYL', 'AVG', 'SEN', 'OKT', 'NOY', 'DEK'];
export function dateBadge(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y) return { day: '–', month: '' };
  return { day: String(d), month: MONTHS_SHORT[m - 1] };
}

/** Ismdan barqaror rang indeksi (avatar fonlari uchun). */
export function hashIndex(str, n) {
  let h = 0;
  for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}

export const pluralTa = (n) => `${n || 0} ta`;
