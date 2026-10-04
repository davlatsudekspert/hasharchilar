// Native (Capacitor) imkoniyatlari va ularning web zaxiralari.
// Plaginlar dinamik import qilinadi — sayt bundle'iga faqat kerak bo'lganda yuklanadi.
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { IS_NATIVE } from './config.js';
import { closeTopModal, runBackHandlers } from './modals.js';
import { getRoute, goBack } from './router.js';
import { storage } from './storage.js';

// ---------------- Ishga tushirish ----------------
export async function initNative() {
  if (!IS_NATIVE) return;
  document.documentElement.classList.add('is-native');
  try {
    const { App } = await import('@capacitor/app');
    // Orqaga: modal → sahifa ichki holati (wizard qadami, ochiq sheet) → sahifa tarixi → ilovadan chiqish
    await App.addListener('backButton', () => {
      if (closeTopModal()) return;
      if (runBackHandlers()) return;
      if (getRoute().name === 'home') App.exitApp();
      else goBack('/');
    });
    // OS kamera paytida ilovani o'ldirgan bo'lsa — surat shu hodisa bilan qaytadi
    await App.addListener('appRestoredResult', (r) => {
      restorePhoto(r).catch(() => {});
    });
  } catch (err) {
    console.warn('App listeners', err);
  }
  watchKeyboard();
}

// ---------------- Klaviatura ----------------
// APK'da klaviatura ochilganda WebView kichrayadi (SystemBars IME inset) va fixed pastki panellar
// klaviatura ustiga chiqib, maydonni yopadi. Shunda html.kb-open → tab bar va action bar yashiriladi.
const TEXT_INPUT = /^(text|search|email|tel|url|password|number|date|time|datetime-local|month|week)$/i;
const isEditable = (el) =>
  !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT.test(el.type || 'text')));

function watchKeyboard() {
  const root = document.documentElement;
  const full = {}; // kenglik (orientatsiya) → klaviaturasiz eng katta balandlik
  const update = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    full[w] = Math.max(full[w] || 0, h);
    root.classList.toggle('kb-open', isEditable(document.activeElement) && full[w] - h > 120);
  };
  update();
  window.addEventListener('resize', update);
  document.addEventListener('focusin', () => setTimeout(update, 60));
  document.addEventListener('focusout', () => setTimeout(update, 60));
}

/** O'rnatilgan APK versionCode (App.getInfo().build) yoki null. */
export async function nativeBuild() {
  if (!IS_NATIVE) return null;
  try {
    const { App } = await import('@capacitor/app');
    const n = Number((await App.getInfo()).build);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

let lastDark = null;
/** Status bar matni/foni joriy mavzuga mos. */
export async function setNativeTheme(dark) {
  if (!IS_NATIVE || lastDark === dark) return;
  lastDark = dark;
  try {
    await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  } catch {
    /* eski yadro */
  }
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: dark ? '#0e1a16' : '#ffffff' }).catch(() => {});
  } catch {
    /* Android 15+ da fon rangi yo'q — e'tiborsiz */
  }
}

let splashHidden = false;
/** Birinchi ma'lumot yuklangach splash ekranni yashiradi. */
export async function hideSplash() {
  if (!IS_NATIVE || splashHidden) return;
  splashHidden = true;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch (err) {
    console.warn('SplashScreen', err);
  }
}

// ---------------- Haptika ----------------
/** @param {'light'|'medium'|'heavy'|'success'|'warning'|'error'|'select'} kind */
export async function haptic(kind = 'light') {
  if (!IS_NATIVE) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    // Android'da selectionChanged() faqat selectionStart() dan keyin tebranadi — yengil impact ishlatamiz
    if (kind === 'select') return void (await Haptics.impact({ style: ImpactStyle.Light }));
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      const type = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[kind];
      return void (await Haptics.notification({ type }));
    }
    const style = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[kind] || ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {
    /* tebranish yo'q */
  }
}

// ---------------- Ulashish ----------------
/**
 * Havolani ulashadi. Natija: 'shared' | 'copied' | 'cancelled' | 'failed'.
 * Native — Capacitor Share; web — navigator.share, bo'lmasa buferga nusxa.
 */
export async function shareLink({ title, text, url }) {
  if (IS_NATIVE) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: 'Ulashish' });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err && err.message))) return 'cancelled';
    }
  } else if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// ---------------- Geolokatsiya ----------------
/** Xato turi: 'denied' | 'unavailable' | 'timeout' | 'unsupported'. */
export class GeoError extends Error {
  constructor(kind, message) {
    super(message || kind);
    this.kind = kind;
  }
}

export const GEO_MESSAGES = {
  denied: "Joylashuvga ruxsat berilmadi. Sozlamalardan ruxsat bering.",
  unavailable: "Joylashuv xizmati o'chiq — telefonda GPS (Joylashuv) ni yoqing.",
  timeout: "Joylashuvni aniqlab bo'lmadi. Qayta urinib ko'ring.",
  unsupported: 'Qurilmangiz joylashuvni aniqlay olmaydi.',
};

/** Joriy joylashuv {lat, lng}. Native — Capacitor Geolocation (ruxsat so'raladi), web — navigator.geolocation. */
export async function getCurrentPosition() {
  if (IS_NATIVE) {
    let Geolocation;
    try {
      ({ Geolocation } = await import('@capacitor/geolocation'));
    } catch {
      Geolocation = null;
    }
    if (Geolocation) {
      try {
        let perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
          perm = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        }
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') throw new GeoError('denied');
        const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        return { lat: p.coords.latitude, lng: p.coords.longitude };
      } catch (err) {
        if (err instanceof GeoError) throw err;
        const msg = String((err && err.message) || '');
        if (/denied|permission/i.test(msg)) throw new GeoError('denied');
        if (/disabled|services|unavailable/i.test(msg)) throw new GeoError('unavailable');
        if (/timeout/i.test(msg)) throw new GeoError('timeout');
        // Native xato — web API bilan urinib ko'ramiz
      }
    }
  }
  if (!navigator.geolocation) throw new GeoError('unsupported');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => reject(new GeoError(err && err.code === 2 ? 'unavailable' : err && err.code === 3 ? 'timeout' : 'denied')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60000 },
    );
  });
}

// ---------------- Kamera ----------------
/** Native kamera mavjudmi (web'da fayl input ishlatiladi). */
export const HAS_NATIVE_CAMERA = IS_NATIVE;

/** Kamera xatosi turi: 'denied' (ruxsat yo'q) | 'unavailable' (plagin yo'q) | 'failed'. */
export class CameraError extends Error {
  constructor(kind, message) {
    super(message || kind);
    this.kind = kind;
  }
}

export const CAMERA_DENIED_MESSAGE =
  "Kameraga ruxsat berilmadi. Telefon Sozlamalari → Ilovalar → Hasharchilar → Ruxsatlar bo'limida kamerani yoqing yoki «Galereya» dan tanlang.";

const PENDING_KEY = 'hashar_camera_pending';

/**
 * Native kamera bilan surat oladi → File. Bekor qilinsa null. Xato — CameraError.
 * @param {string} [tag] — qaysi forma uchun (OS ilovani o'ldirsa, surat shu formaga qaytariladi)
 */
export async function takeNativePhoto(tag) {
  let Camera;
  try {
    ({ Camera } = await import('@capacitor/camera'));
  } catch {
    throw new CameraError('unavailable', "Kamerani ochib bo'lmadi");
  }
  let perm = await Camera.checkPermissions().catch(() => null);
  if (perm && perm.camera !== 'granted') {
    perm = await Camera.requestPermissions({ permissions: ['camera'] }).catch(() => null);
    if (perm && perm.camera !== 'granted') throw new CameraError('denied', CAMERA_DENIED_MESSAGE);
  }
  if (tag) storage.setJSON(PENDING_KEY, { tag, hash: window.location.hash, at: Date.now() });
  try {
    const res = await Camera.takePhoto({ quality: 85, targetWidth: 1600, targetHeight: 1600, correctOrientation: true, saveToGallery: false });
    return await photoFile(res);
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (/cancel/i.test(msg)) return null;
    if (/denied|permission/i.test(msg)) throw new CameraError('denied', CAMERA_DENIED_MESSAGE);
    throw new CameraError('failed', "Kamerani ochib bo'lmadi");
  } finally {
    storage.remove(PENDING_KEY);
  }
}

/** takePhoto natijasi (webPath/uri) → File yoki null. */
async function photoFile(res) {
  const src = res && (res.webPath || res.uri);
  if (!src) return null;
  const blob = await (await fetch(src)).blob();
  return new File([blob], `rasm-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
}

// ---------------- Tiklangan surat (appRestoredResult) ----------------
let restored = null; // { tag, file }
const restoredSubs = new Set();

async function restorePhoto(r) {
  if (!r || r.pluginId !== 'Camera') return;
  const pending = storage.getJSON(PENDING_KEY, null);
  storage.remove(PENDING_KEY);
  // 30 daqiqadan eski belgi — boshqa seans qoldig'i
  if (!r.success || !pending || !pending.tag || Date.now() - (pending.at || 0) > 30 * 60000) return;
  const file = await photoFile(r.data);
  if (!file) return;
  restored = { tag: pending.tag, file };
  if (pending.hash && pending.hash !== window.location.hash) window.location.hash = pending.hash;
  restoredSubs.forEach((cb) => cb());
}

/** Shu forma uchun tiklangan surat bormi (olib qo'ymaydi). */
export const peekRestoredPhoto = (tag) => (restored && restored.tag === tag ? restored.file : null);
/** Tiklangan suratni oladi (bir marta). */
export function takeRestoredPhoto(tag) {
  const f = peekRestoredPhoto(tag);
  if (f) restored = null;
  return f;
}
/** Surat tiklanganda chaqiriladi; qaytadi — obunani bekor qilish. */
export function onRestoredPhoto(cb) {
  restoredSubs.add(cb);
  return () => restoredSubs.delete(cb);
}

// ---------------- Tarmoq ----------------
/** Onlayn holatga obuna. Qaytadi: obunani bekor qilish funksiyasi. */
export function watchNetwork(cb) {
  let cleanup = () => {};
  if (IS_NATIVE) {
    let handle = null;
    let alive = true;
    import('@capacitor/network')
      .then(async ({ Network }) => {
        const s = await Network.getStatus();
        if (alive) cb(s.connected);
        handle = await Network.addListener('networkStatusChange', (st) => cb(st.connected));
        if (!alive) handle.remove();
      })
      .catch(() => {});
    cleanup = () => {
      alive = false;
      if (handle) handle.remove();
    };
  } else {
    const on = () => cb(true);
    const off = () => cb(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    cb(navigator.onLine !== false);
    cleanup = () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }
  return cleanup;
}

// ---------------- Token zaxirasi (Preferences) ----------------
const PREF_TOKEN = 'hashar_token';
/** Native: tokenni Preferences ga ham yozadi (WebView ma'lumotlari tozalansa tiklash uchun). */
export async function mirrorToken(token) {
  if (!IS_NATIVE) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    if (token) await Preferences.set({ key: PREF_TOKEN, value: token });
    else await Preferences.remove({ key: PREF_TOKEN });
  } catch {
    /* e'tiborsiz */
  }
}
/** Native: localStorage bo'sh bo'lsa Preferences dan tokenni tiklaydi. */
export async function restoreToken(get, set) {
  if (!IS_NATIVE || get()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Promise.race([
      Preferences.get({ key: PREF_TOKEN }),
      new Promise((r) => setTimeout(() => r({ value: null }), 800)),
    ]);
    if (value) set(value);
  } catch {
    /* e'tiborsiz */
  }
}
