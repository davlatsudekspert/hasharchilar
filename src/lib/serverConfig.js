// Server sozlamalari (GET /api/config): `email_enabled` — email bilan ro'yxat yoqilganmi; v4: `hashar_fee` (so'm,
// 0 — bepul), `payments: {payme, click, manual}` (qaysi to'lov usullari yoqilgan), `manual_payment_note`.
// Ilova ochilganda bir marta so'raladi va localStorage'da saqlanadi (oflayn / sekin tarmoqda ham oxirgi ma'lum
// qiymat bilan ishlaydi). Eski server (marshrut yo'q) — email o'chiq, narx 0 hisoblanadi.
import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { storage } from './storage.js';

const KEY = 'hashar_config';
const listeners = new Set();

function normalize(c) {
  const fee = Number(c && c.hashar_fee);
  const p = (c && c.payments) || {};
  return {
    email_enabled: Boolean(c && c.email_enabled),
    hashar_fee: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0,
    payments: { payme: Boolean(p.payme), click: Boolean(p.click), manual: p.manual !== false },
    manual_payment_note: (c && typeof c.manual_payment_note === 'string' && c.manual_payment_note) || '',
  };
}

let state = { ...normalize(storage.getJSON(KEY) || {}), loaded: false };
let inflight = null;

function set(patch) {
  state = { ...state, ...patch };
  const { loaded, ...persist } = state;
  storage.setJSON(KEY, persist);
  listeners.forEach((fn) => fn());
}

/** /api/config ni (qayta) yuklaydi. */
export function loadServerConfig() {
  if (!inflight) {
    inflight = api
      .config()
      .then((c) => set({ ...normalize(c), loaded: true }))
      .catch((err) => {
        // 404 — eski server (email yo'q); tarmoq xatosi — oxirgi ma'lum qiymat qoladi
        set(err && err.status === 404 ? { ...normalize({}), loaded: true } : { loaded: true });
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Server 410 email_required qaytarsa — email yoqilgan deb belgilanadi (config hali kelmagan bo'lsa ham). */
export const markEmailEnabled = () => set({ email_enabled: true, loaded: true });

export const getServerConfig = () => state;

function subscribe(fn) {
  listeners.add(fn);
  if (!state.loaded && !inflight) loadServerConfig();
  return () => listeners.delete(fn);
}

/** React hook: { email_enabled, hashar_fee, payments, manual_payment_note, loaded }. */
export const useServerConfig = () => useSyncExternalStore(subscribe, getServerConfig, getServerConfig);
