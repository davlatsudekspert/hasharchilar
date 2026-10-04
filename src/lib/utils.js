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

/** Ism bosh harfi(lari): "Aziz Karimov" → "AK". */
export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}

/** SPEC tartibi: PENDING sana bo'yicha o'sish, keyin COMPLETED eng yangisi. */
export function sortHashars(list) {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'PENDING' ? -1 : 1;
    if (a.status === 'PENDING') return String(a.date_time).localeCompare(String(b.date_time));
    return String(b.completed_at || b.date_time).localeCompare(String(a.completed_at || a.date_time));
  });
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
