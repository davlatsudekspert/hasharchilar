// APK eslatmalari: qo'shilgan hasharlar ro'yxati yuklanganda / o'zgarganda src/native/reminders.js ga beriladi
// (1 kun va 2 soat oldin mahalliy bildirishnoma). Sozlamalarda o'chirilsa — barcha eslatmalar bekor qilinadi.
// Native modul faqat APK'da (dinamik import) yuklanadi — saytda u hech narsa qilmaydi va bundle'ga kirmaydi.
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from './auth.jsx';
import { IS_NATIVE } from './config.js';
import { Q } from './queries.js';
import { storage } from './storage.js';
import { useApi } from './store.js';

const KEY = 'hashar_reminders'; // '0' — o'chirilgan
const native = () => (IS_NATIVE ? import('../native/reminders.js') : Promise.resolve(null));
/** Eslatmalar shu qurilmada ishlaydimi (faqat APK). */
export const remindersSupported = () => native().then((m) => (m ? m.remindersSupported() : false)).catch(() => false);
const listeners = new Set();
export const remindersEnabled = () => storage.get(KEY) !== '0';
export function setRemindersEnabled(on) {
  if (on) storage.remove(KEY);
  else storage.set(KEY, '0');
  // APK moduli (bo'lsa): Preferences bilan sinxronlash, yoqilganda ruxsat so'rash, o'chirilganda bekor qilish
  native()
    .then((m) => m && m.setRemindersEnabled && m.setRemindersEnabled(on))
    .catch(() => {});
  listeners.forEach((fn) => fn());
}
const sub = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useRemindersEnabled = () => useSyncExternalStore(sub, remindersEnabled, remindersEnabled);

/** Faqat kelgusi (yakunlanmagan) hasharlar. */
const upcoming = (list) => (Array.isArray(list) ? list.filter((h) => h && h.status === 'PENDING') : []);

/** Xavfsiz chaqiruv (native modul xato bersa ham ilova ishlayveradi). */
export function pushReminders(list) {
  native()
    .then((m) => m && m.syncReminders(remindersEnabled() ? upcoming(list) : []))
    .catch(() => {});
}

export function useReminderSync() {
  const { user } = useAuth();
  const enabled = useRemindersEnabled();
  // Saytda so'rov yuborilmaydi (eslatmalar faqat APK'da); profil sahifasi yuklagan ro'yxat baribir uzatiladi
  const joined = useApi(IS_NATIVE && user ? Q.myJoined[0] : null, Q.myJoined[1]);
  const uid = user ? user.id : null;
  useEffect(() => {
    if (!uid) pushReminders([]);
  }, [uid]);
  useEffect(() => {
    if (joined.data) pushReminders(joined.data);
  }, [joined.data, enabled]);
}
