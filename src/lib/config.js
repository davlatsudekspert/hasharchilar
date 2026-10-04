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
