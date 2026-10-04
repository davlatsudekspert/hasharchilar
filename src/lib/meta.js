// Kategoriyalar, nishonlar (badges), yo'l ko'rsatish havolalari, .ics kalendar fayli.
import { shareUrl } from './config.js';

export const CATEGORIES = [
  {
    id: 'cleaning',
    label: 'Tozalash',
    short: 'Tozalash',
    text: "Ko'cha, bog', ariq va hovlilarni axlatdan tozalash",
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300',
    tint: 'from-sky-500 to-cyan-500',
    color: '#0ea5e9',
  },
  {
    id: 'greening',
    label: "Ko'kalam\u00adzorlashtirish",
    short: "Ko'kalam",
    text: "Daraxt va gul ko'chatlari ekish, sug'orish",
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
    tint: 'from-emerald-500 to-lime-500',
    color: '#10b981',
  },
  {
    id: 'repair',
    label: "Ta'mirlash",
    short: "Ta'mir",
    text: "Maydoncha, skameyka, devorlarni bo'yash va tuzatish",
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300',
    tint: 'from-violet-500 to-fuchsia-500',
    color: '#8b5cf6',
  },
  {
    id: 'other',
    label: 'Boshqa',
    short: 'Boshqa',
    text: "Mahalla uchun boshqa foydali ishlar",
    chip: 'bg-slate-200 text-slate-800 dark:bg-slate-400/15 dark:text-slate-300',
    tint: 'from-slate-500 to-slate-400',
    color: '#64748b',
  },
];

export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];

/** Nishonlar: statistika asosida mijozda hisoblanadi. */
export const BADGES = [
  { id: 'member', title: 'Hasharchi', text: "Hasharchilar safiga qo'shildingiz", icon: 'leaf', test: () => true, goal: () => [1, 1] },
  { id: 'first', title: 'Birinchi qadam', text: 'Birinchi hasharda qatnashing', icon: 'spark', goal: (s) => [s.joined + s.created, 1] },
  { id: 'active', title: "Faol ko'ngilli", text: "5 ta hasharga qo'shiling", icon: 'hand', goal: (s) => [s.joined, 5] },
  { id: 'hero', title: 'Mahalla qahramoni', text: "10 ta hasharga qo'shiling", icon: 'medal', goal: (s) => [s.joined, 10] },
  { id: 'organizer', title: 'Tashkilotchi', text: "Birinchi hasharingizni e'lon qiling", icon: 'flag', goal: (s) => [s.created, 1] },
  { id: 'leader', title: 'Yetakchi', text: "5 ta hashar e'lon qiling", icon: 'crown', goal: (s) => [s.created, 5] },
  { id: 'result', title: 'Natijador', text: 'Yakunlangan hasharda qatnashing', icon: 'check', goal: (s) => [s.completed, 1] },
  { id: 'master', title: 'Obodonchi', text: '10 ta yakunlangan hashar', icon: 'trophy', goal: (s) => [s.completed, 10] },
];

export function computeBadges(stats) {
  const s = { created: 0, joined: 0, completed: 0, ...(stats || {}) };
  return BADGES.map((b) => {
    const [have, need] = b.goal(s);
    return { ...b, have: Math.min(have, need), need, earned: have >= need };
  });
}

/** Ball (reyting bilan bir xil formula). */
export const scoreOf = (s) => (s ? (s.completed || 0) * 10 + (s.joined || 0) * 3 + (s.created || 0) * 5 : 0);

/** Daraja: har 50 ball — yangi daraja. */
export function levelOf(score) {
  const level = Math.floor(score / 50) + 1;
  const into = score % 50;
  return { level, into, need: 50, pct: Math.round((into / 50) * 100) };
}

export const googleDirections = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const yandexDirections = (lat, lng) => `https://yandex.uz/maps/?rtext=~${lat},${lng}&rtt=auto`;

// ---------------- .ics ----------------
const pad = (n) => String(n).padStart(2, '0');
const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** "2027-04-11T09:00" (Toshkent, UTC+5) → "20270411T040000Z" */
function toUtcStamp(local, addHours = 0) {
  const [d, t = '09:00'] = String(local).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const ms = Date.UTC(y, m - 1, day, hh - 5 + addHours, mm);
  const x = new Date(ms);
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
}

export function buildIcs(h) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const url = shareUrl(`/hashar/${h.id}`);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hasharchilar.uz//UZ',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:hashar-${h.id}@hasharchilar.uz`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toUtcStamp(h.date_time)}`,
    `DTEND:${toUtcStamp(h.date_time, 3)}`,
    `SUMMARY:${icsEscape(`Hashar: ${h.title}`)}`,
    `DESCRIPTION:${icsEscape(`${h.description || ''}\n\n${url}`)}`,
    `LOCATION:${icsEscape(h.address || `${h.lat}, ${h.lng}`)}`,
    `GEO:${h.lat};${h.lng}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(h.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** .ics faylni yuklab beradi. */
export function downloadIcs(h) {
  const blob = new Blob([buildIcs(h)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hashar-${h.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Google Calendar shabloni havolasi (APK da .ics yuklab olish o'rniga). */
export function googleCalendarUrl(h) {
  const start = toUtcStamp(h.date_time);
  const end = toUtcStamp(h.date_time, 3);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Hashar: ${h.title}`,
    dates: `${start}/${end}`,
    details: `${h.description || ''}\n\n${shareUrl(`/hashar/${h.id}`)}`,
    location: h.address || `${h.lat}, ${h.lng}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
