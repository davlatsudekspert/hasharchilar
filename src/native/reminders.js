// Mahalliy eslatmalar (APK, @capacitor/local-notifications): qo'shilgan har bir kelgusi hashar uchun
// 1 kun va 2 soat oldin bildirishnoma. ID'lar hashar ID'sidan barqaror hisoblanadi (hashar*10 + tur),
// shuning uchun qayta sinxronlashda takrorlanmaydi; ro'yxatda yo'q hasharlar (chiqildi / o'chirildi /
// yakunlandi) eslatmalari bekor qilinadi. Bildirishnoma bosilsa — #/hashar/<id> ochiladi.
// Vaqt: date_time — Toshkent vaqti (UTC+5) → aniq lahza (epoch) → qurilma o'z vaqt zonasida ko'rsatadi.
import { IS_NATIVE } from '../lib/config.js';
import { storage } from '../lib/storage.js';

const CHANNEL_ID = 'eslatmalar';
const KIND = 'hashar_reminder';
const PREF_KEY = 'hashar_reminders'; // '0' — o'chirilgan (localStorage bilan bir xil kalit — src/lib/reminders.js)
const SEEN_KEY = 'hashar_reminders_seen'; // localStorage: sozlama Preferences bilan sinxronlangan
const PERM_ASKED = 'hashar_reminders_asked'; // Preferences: ruxsat avtomatik bir marta so'raldi
const DAY = 24 * 3600e3;
const OFFSETS = [
  { kind: 1, before: DAY },
  { kind: 2, before: 2 * 3600e3 },
];
const TZ_OFFSET = 5 * 3600e3; // Toshkent UTC+5, yozgi vaqt yo'q
// Ilova qulfi moduli faqat APK'da kerak — dinamik import (tizim ruxsat oynasi oldidan markExternal)
const markExternal = () =>
  import('../lock/lockStore.js').then(
    (m) => m.markExternal(),
    () => {},
  );

// Diqqat: Capacitor plagin proksisini async funksiyadan qaytarib / Promise bilan uzatib bo'lmaydi (Promise uning
// .then() ini chaqiradi → "LocalNotifications.then() is not implemented") — shuning uchun modul qaytariladi.
const lnMod = () => import('@capacitor/local-notifications');
const prefsMod = () => import('@capacitor/preferences');

/** Barqaror bildirishnoma ID (Java int chegarasida). */
export const reminderId = (hasharId, kind) => (Number(hasharId) % 200_000_000) * 10 + kind;

/** "YYYY-MM-DDTHH:MM" (Toshkent) → epoch ms yoki NaN. */
export function tashkentToEpoch(dt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(dt || ''));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TZ_OFFSET;
}
const hhmm = (dt) => String(dt || '').slice(11, 16);

/**
 * Tunda (23:00–07:00 Toshkent) tushgan "1 kun oldin" eslatmasi hashardan oldingi kun kechqurun 21:00 ga suriladi.
 * "1 kun oldin" vaqti doim hashardan oldingi kalendar kunida — sana o'zgarmaydi (matnda "Ertaga" to'g'ri qoladi).
 */
export function softenNight(at) {
  const local = new Date(at + TZ_OFFSET);
  const h = local.getUTCHours();
  if (h >= 7 && h < 23) return at;
  const d = new Date(local);
  d.setUTCHours(21, 0, 0, 0);
  return d.getTime() - TZ_OFFSET;
}

/** Bitta hashar uchun kerakli bildirishnomalar (o'tib ketganlari tashlab yuboriladi). */
function plan(h, now) {
  const start = tashkentToEpoch(h.date_time);
  if (!Number.isFinite(start) || start <= now) return [];
  const title = String(h.title || 'Hashar').slice(0, 80);
  const place = h.address ? String(h.address).slice(0, 90) : '';
  const time = hhmm(h.date_time);
  const items = Array.isArray(h.items) && h.items.length ? `Olib keling: ${h.items.slice(0, 4).join(', ')}.` : '';
  const out = [];
  for (const { kind, before } of OFFSETS) {
    let at = start - before;
    if (kind === 1) at = softenNight(at);
    if (at <= now + 60_000) continue;
    const n =
      kind === 1
        ? {
            title: `Ertaga hashar: ${title}`,
            body: [`Soat ${time} da${place ? `, ${place}` : ''}.`, items || "Kayfiyat va qo'lqopni unutmang!"].join(' '),
          }
        : {
            title: `2 soatdan so'ng: ${title}`,
            body: `Hashar soat ${time} da boshlanadi${place ? ` — ${place}` : ''}. Sizni kutamiz!`,
          };
    out.push({
      id: reminderId(h.id, kind),
      title: n.title,
      body: n.body,
      largeBody: n.body,
      channelId: CHANNEL_ID,
      group: 'hashar-eslatmalar',
      autoCancel: true,
      schedule: { at: new Date(at), allowWhileIdle: true },
      // Aniq budilnik (SCHEDULE_EXACT_ALARM) shart emas — bir necha daqiqa farq muhim emas
      isExactNotification: false,
      extra: { kind: KIND, hashar_id: Number(h.id), type: kind, at, sig: `${at}|${n.title}|${n.body}` },
    });
  }
  return out;
}

// ---------------- Sozlama (yoqish / o'chirish) ----------------
/** Eslatmalar yoqilganmi (standart — ha). Sinxron: localStorage; Preferences — zaxira nusxa. */
export function remindersEnabled() {
  return storage.get(PREF_KEY) !== '0';
}

/** Yoqadi/o'chiradi: localStorage + Preferences; o'chirilsa barcha eslatmalar bekor qilinadi. */
export async function setRemindersEnabled(on) {
  if (on) storage.remove(PREF_KEY);
  else storage.set(PREF_KEY, '0');
  storage.set(SEEN_KEY, '1');
  if (!IS_NATIVE) return;
  try {
    await (await prefsMod()).Preferences.set({ key: PREF_KEY, value: on ? '1' : '0' });
  } catch {
    /* e'tiborsiz */
  }
  if (on) await ensureReminderPermission(true);
  else await cancelAllReminders();
}

/**
 * WebView ma'lumotlari tozalangan bo'lsa — sozlama Preferences dan tiklanadi; aks holda Preferences yangilanadi.
 * Qaytadi: true — foydalanuvchi eslatmalarni hozirgina qayta yoqdi (ruxsatni yana so'rash mumkin).
 */
async function syncSetting() {
  try {
    const { Preferences: P } = await prefsMod();
    const { value } = await P.get({ key: PREF_KEY });
    if (storage.get(SEEN_KEY) !== '1') {
      if (value === '0') storage.set(PREF_KEY, '0');
      storage.set(SEEN_KEY, '1');
      return false;
    }
    const on = remindersEnabled();
    if (value !== (on ? '1' : '0')) await P.set({ key: PREF_KEY, value: on ? '1' : '0' });
    return on && value === '0';
  } catch {
    return false;
  }
}

// ---------------- Ruxsat va kanal ----------------
/**
 * Bildirishnoma ruxsati: 'granted' | 'denied'. `force` bo'lmasa — avtomatik faqat bir marta so'raladi
 * (rad etilsa har safar bezovta qilinmaydi; Sozlamalarda yoqilganda qayta so'raladi).
 */
export async function ensureReminderPermission(force = false) {
  if (!IS_NATIVE) return 'denied';
  try {
    const { LocalNotifications: LN } = await lnMod();
    let p = await LN.checkPermissions();
    if (p.display === 'granted') return 'granted';
    if (p.display === 'denied' && !force) return 'denied';
    const { Preferences: P } = await prefsMod();
    if (!force) {
      const { value } = await P.get({ key: PERM_ASKED });
      if (value === '1') return 'denied';
    }
    await P.set({ key: PERM_ASKED, value: '1' });
    await markExternal(); // ruxsat oynasi — qulf darhol ishlamasin
    p = await LN.requestPermissions();
    return p.display === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

let channelReady = null;
function ensureChannel(LN) {
  if (!channelReady) {
    channelReady = LN.createChannel({
      id: CHANNEL_ID,
      name: 'Eslatmalar',
      description: "Qo'shilgan hasharlaringiz haqida 1 kun va 2 soat oldin eslatma",
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#10B981',
    }).catch(() => {
      channelReady = null;
    });
  }
  return channelReady;
}

// ---------------- Bosilganda hasharni ochish ----------------
function openHashar(id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return;
  const target = `#/hashar/${n}`;
  if (window.location.hash !== target) window.location.hash = target;
}
if (IS_NATIVE) {
  // Modul ilova ishga tushganda yuklanadi (actions.jsx orqali) — sovuq start bosilishi ham yetib keladi
  lnMod()
    .then(({ LocalNotifications: LN }) =>
      LN.addListener('localNotificationActionPerformed', (a) => {
        const extra = a && a.notification && a.notification.extra;
        if (extra && extra.kind === KIND) openHashar(extra.hashar_id);
      }),
    )
    .catch(() => {});
}

// ---------------- Sinxronlash ----------------
async function pendingOurs(LN) {
  const { notifications = [] } = await LN.getPending();
  return notifications.filter((n) => n && n.extra && n.extra.kind === KIND);
}

/** Barcha hashar eslatmalarini bekor qiladi. */
async function cancelAllReminders() {
  if (!IS_NATIVE) return;
  try {
    const { LocalNotifications: LN } = await lnMod();
    const ours = await pendingOurs(LN);
    if (ours.length) await LN.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  } catch {
    /* e'tiborsiz */
  }
}

let queue = Promise.resolve();
/**
 * Qo'shilgan kelgusi hasharlar ro'yxati bo'yicha eslatmalarni moslashtiradi (bo'sh ro'yxat — hammasi bekor).
 * Ketma-ket chaqiruvlar navbatda bajariladi.
 */
export function syncReminders(hashars) {
  if (!IS_NATIVE) return Promise.resolve();
  const list = Array.isArray(hashars) ? hashars : [];
  queue = queue.then(() => doSync(list)).catch((err) => console.warn('reminders', err));
  return queue;
}

async function doSync(list) {
  const reenabled = await syncSetting();
  const { LocalNotifications: LN } = await lnMod();
  const now = Date.now();
  const wanted = remindersEnabled()
    ? list
        .filter((h) => h && h.id != null && (h.status == null || h.status === 'PENDING') && h.joined !== false)
        .flatMap((h) => plan(h, now))
    : [];
  const pending = await pendingOurs(LN).catch(() => []);
  const want = new Map(wanted.map((n) => [n.id, n]));
  const stale = pending.filter((p) => {
    const w = want.get(p.id);
    return !w || !p.extra || p.extra.sig !== w.extra.sig;
  });
  const have = new Set(pending.filter((p) => !stale.includes(p)).map((p) => p.id));
  const fresh = wanted.filter((n) => !have.has(n.id));
  if (stale.length) await LN.cancel({ notifications: stale.map((p) => ({ id: p.id })) });
  if (!fresh.length) return;
  // Ruxsat oynasi qulf ekrani (biometrik oyna) ustiga chiqmasin — avval qulf ochilsin
  const { whenUnlocked } = await import('../lock/lockStore.js');
  await whenUnlocked();
  if ((await ensureReminderPermission(reenabled)) !== 'granted') return;
  await ensureChannel(LN);
  await LN.schedule({ notifications: fresh });
}

/** Bitta hashar eslatmalarini bekor qiladi (chiqish / o'chirish / yakunlash). */
export async function cancelReminders(hasharId) {
  if (!IS_NATIVE || hasharId == null) return;
  try {
    const { LocalNotifications: LN } = await lnMod();
    await LN.cancel({ notifications: OFFSETS.map((o) => ({ id: reminderId(hasharId, o.kind) })) });
  } catch {
    /* e'tiborsiz */
  }
}

/** Eslatmalar shu qurilmada ishlaydimi (faqat APK). */
export async function remindersSupported() {
  if (!IS_NATIVE) return false;
  try {
    await lnMod();
    return true;
  } catch {
    return false;
  }
}
