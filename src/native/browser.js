// Tashqi havola (to'lov sahifasi va h.k.): APK'da @capacitor/browser (Custom Tabs — ilova ichida, ortga qaytish oson),
// saytda — yangi oyna. Faqat http(s) havolalar ochiladi.
import { IS_NATIVE } from '../lib/config.js';

// Ilova qulfi moduli faqat APK'da kerak — saytning sahifa chunk'lariga statik qo'shilmasin (dinamik import)
const markExternal = () =>
  import('../lock/lockStore.js').then(
    (m) => m.markExternal(),
    () => {},
  );

// Plagin proksisi async funksiyadan qaytarilmaydi (Promise uning .then() ini chaqiradi) — modul qaytariladi
const browserMod = () => import('@capacitor/browser');

/** Aksent rangidagi panel (Custom Tabs toolbar). */
function toolbarColor() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--a-700').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : '#047857';
  } catch {
    return '#047857';
  }
}

/** Havolani ochadi. APK: Custom Tabs; sayt: yangi oyna. */
export async function openExternal(url) {
  const href = String(url || '');
  if (!/^https?:\/\//i.test(href)) throw new Error("Noto'g'ri havola");
  if (!IS_NATIVE) {
    window.open(href, '_blank', 'noopener');
    return;
  }
  // To'lov sahifasidan qaytganda ilova qulfi darhol so'ramasin (ilova o'zi ochdi)
  await markExternal();
  await (await browserMod()).Browser.open({ url: href, toolbarColor: toolbarColor(), presentationStyle: 'fullscreen' });
}

/** Ochiq Custom Tab'ni yopadi (APK). */
export async function closeExternal() {
  if (!IS_NATIVE) return;
  try {
    await (await browserMod()).Browser.close();
  } catch {
    /* ochiq oyna yo'q */
  }
}

/**
 * Foydalanuvchi tashqi oynani yopib ilovaga qaytganda chaqiriladi (APK: browserFinished).
 * Saytda — oyna qayta ko'ringanda (visibilitychange). Qaytadi — obunani bekor qilish.
 */
export function onExternalClosed(fn) {
  if (!IS_NATIVE) {
    const onVis = () => document.visibilityState === 'visible' && fn();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }
  let handle = null;
  let alive = true;
  browserMod()
    .then((m) => m.Browser.addListener('browserFinished', () => fn()))
    .then((h) => {
      handle = h;
      if (!alive) h.remove();
    })
    .catch(() => {});
  return () => {
    alive = false;
    if (handle) handle.remove();
  };
}
