// Ilova sozlamalari: API manzili va platforma (sayt yoki Android APK).
import { Capacitor } from '@capacitor/core';

/**
 * API bazaviy manzili. Saytda bo'sh ('' → shu domen), APK'da build paytida
 * `VITE_API_BASE=https://...` beriladi. Oxiridagi "/" olib tashlanadi.
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

/** Capacitor ichida (Android ilova) ishlayaptimi? */
export const IS_NATIVE = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

/**
 * Google Play uchun build (`VITE_PLAY=1`, CI → .aab): ilova yangilanishini Play o'zi qiladi —
 * APK'ni saytdan yangilash taklifi ko'rsatilmaydi (Play qoidasi: ilova o'zini Play'dan tashqarida yangilamaydi).
 */
export const IS_PLAY = import.meta.env.VITE_PLAY === '1';

/**
 * Media yo'lini to'liq URL ga aylantiradi.
 * - `http(s)://`, `blob:`, `data:` — o'zgarishsiz;
 * - `/demo/...` — statik web fayl (APK ichida ham lokal ochiladi);
 * - `/api/...` — API_BASE qo'shiladi (APK uchun muhim).
 */
export function mediaUrl(path) {
  if (!path) return null;
  const p = String(path);
  if (/^(https?:|blob:|data:)/i.test(p)) return p;
  if (p.startsWith('/demo/')) return p;
  return API_BASE + (p.startsWith('/') ? p : `/${p}`);
}

/** API manzili ("/api/..." yo'l uchun). */
export const apiUrl = (path) => `${API_BASE}${path}`;

/** Production sayt manzili (APK'da API_BASE bo'sh bo'lsa — zaxira). */
const DEFAULT_SITE = 'https://hasharchilar-api.davlatsudekspert.workers.dev';

/**
 * Ulashish havolalari uchun sayt manzili: saytda — joriy origin, APK'da — API (sayt) domeni.
 * Havola formati: `<SITE_URL>/#/hashar/<id>`.
 */
export const SITE_URL = (() => {
  if (IS_NATIVE) return API_BASE || DEFAULT_SITE;
  try {
    return window.location.origin;
  } catch {
    return DEFAULT_SITE;
  }
})();

export const shareUrl = (path) => `${SITE_URL}/#${path.startsWith('/') ? path : `/${path}`}`;
