// Ilova qulfi holati (faqat APK): PIN (PBKDF2 xesh) va sozlamalar @capacitor/preferences da,
// xato urinishlar soni va kutish vaqti ham u yerda (ilova qayta ochilsa ham saqlanadi).
// React komponentlar `useLock()` orqali obuna bo'ladi; ilova hayot sikli (fon/qaytish) shu yerda kuzatiladi.
import { useSyncExternalStore } from 'react';
import { api, getToken } from '../lib/api.js';
import { IS_NATIVE } from '../lib/config.js';
import { storage } from '../lib/storage.js';

const PREF_KEY = 'hashar_lock'; // {v, uid, salt, hash, iter, bio, timeout}
const ATTEMPTS_KEY = 'hashar_lock_attempts'; // {fails, level, until, at}
const HINT_KEY = 'hashar_lock_on'; // localStorage: '1' — birinchi chizishda qopqoq ko'rsatish uchun ishora

export const PIN_LENGTH = 4;
export const MAX_FAILS = 5; // shuncha xatodan keyin kutish
const BASE_COOLDOWN = 30_000; // 30 s, har safar ikki baravar
const MAX_COOLDOWN = 15 * 60_000; // 15 daqiqa
const ITERATIONS = 150_000;
/** Avtomatik qulflash variantlari (soniya). */
export const TIMEOUTS = [0, 30, 60, 300];
const DEFAULT_TIMEOUT = 0;
// Ilova ichidan ochilgan tashqi oyna (kamera, galereya, to'lov sahifasi, skaner) — qaytganda qulflanmaydi
const EXTERNAL_GRACE = 3 * 60_000;
const EXTERNAL_WINDOW = 5_000; // markExternal() dan keyin shuncha ms ichida fonga o'tilsa — ilova o'zi ochgan

// ---------------- Holat ----------------
let state = {
  loaded: false,
  enabled: false,
  uid: null,
  bio: false,
  timeout: DEFAULT_TIMEOUT,
  locked: false,
  fails: 0,
  level: 0,
  until: 0,
  epoch: 0, // har qulflash / qulf ekraniga qaytishda oshadi (biometrikni qayta so'rash uchun)
};
let config = null; // to'liq yozuv (salt, hash) — React holatiga chiqarilmaydi
// Kutish tugashi monoton soat bo'yicha ham (seans ichida tizim vaqtini oldinga surib chetlab o'tib bo'lmasin)
const mono = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
let monoUntil = 0;
const cooling = () => state.until > Date.now() || mono() < monoUntil;
const subs = new Set();

function set(patch) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
}
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const getLockState = () => state;
/** Qulf holati o'zgarishiga obuna (React'dan tashqari: skaner va h.k.). Qaytaradi: obunani bekor qilish. */
export const subscribeLock = subscribe;
export const useLock = () => useSyncExternalStore(subscribe, getLockState, getLockState);

/** Qulf yoqilgan bo'lishi mumkinmi (Preferences o'qilguncha qopqoq ko'rsatish uchun). */
export const lockHint = () => storage.get(HINT_KEY) === '1';

// ---------------- Preferences ----------------
// Diqqat: Capacitor plagin proksisini async funksiyadan qaytarib bo'lmaydi (Promise uning .then() ini chaqiradi →
// "Preferences.then() is not implemented") — shuning uchun modulning o'zi qaytariladi.
const prefsMod = () => import('@capacitor/preferences');
async function readJSON(key) {
  try {
    const { value } = await (await prefsMod()).Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
async function writeJSON(key, value) {
  const { Preferences: P } = await prefsMod();
  if (value == null) await P.remove({ key });
  else await P.set({ key, value: JSON.stringify(value) });
}

// ---------------- Kriptografiya (PBKDF2-SHA256) ----------------
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin, saltB64, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations }, key, 256);
  return toB64(new Uint8Array(bits));
}
/** Doimiy vaqtda solishtirish. */
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Oson taxmin qilinadigan PIN (1111, 1234, 4321 ...). */
export function weakPin(pin) {
  const s = String(pin);
  if (!/^\d{4}$/.test(s)) return true;
  if (/^(\d)\1{3}$/.test(s)) return true;
  const d = [...s].map(Number);
  const up = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const down = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return up || down;
}

// ---------------- Yuklash ----------------
let loading = null;
/** Preferences dan sozlama va urinishlarni o'qiydi (bir marta). Ilova ochilganda — qulflangan holda. */
export function loadLock() {
  if (!IS_NATIVE) {
    if (!state.loaded) set({ loaded: true });
    return Promise.resolve(state);
  }
  if (!loading) {
    loading = (async () => {
      const [cfg, att] = await Promise.all([readJSON(PREF_KEY), readJSON(ATTEMPTS_KEY)]);
      config = cfg && cfg.v === 1 && cfg.hash && cfg.salt ? cfg : null;
      if (config) storage.set(HINT_KEY, '1');
      else storage.remove(HINT_KEY);
      const a = normAttempts(att);
      monoUntil = a.until ? mono() + (a.until - Date.now()) : 0;
      set({
        loaded: true,
        enabled: !!config,
        uid: config ? config.uid ?? null : null,
        bio: !!(config && config.bio),
        timeout: config && TIMEOUTS.includes(config.timeout) ? config.timeout : DEFAULT_TIMEOUT,
        // Ilova ochildi: PIN bor va sessiya bor — qulflangan
        locked: !!config && !!getToken(),
        ...a,
        epoch: state.epoch + 1,
      });
      return state;
    })().catch((err) => {
      console.warn('AppLock', err);
      set({ loaded: true });
      return state;
    });
  }
  return loading;
}

function normAttempts(a) {
  const now = Date.now();
  let until = Number(a && a.until) || 0;
  const at = Number(a && a.at) || 0;
  // Soat orqaga surilgan bo'lsa (at kelajakda) — kutish hozirdan qayta boshlanadi
  if (until > now && at > now) until = now + (until - at);
  return {
    fails: Math.max(0, Number(a && a.fails) || 0),
    level: Math.max(0, Number(a && a.level) || 0),
    until: until > now ? until : 0,
  };
}

function saveAttempts() {
  const { fails, level, until } = state;
  return writeJSON(ATTEMPTS_KEY, fails || level || until ? { fails, level, until, at: Date.now() } : null).catch(() => {});
}

async function saveConfig(patch) {
  if (!config) return;
  config = { ...config, ...patch };
  await writeJSON(PREF_KEY, config);
  set({ bio: !!config.bio, timeout: config.timeout, uid: config.uid ?? null });
}

// ---------------- PIN ----------------
/** Yangi PIN o'rnatadi (yoki almashtiradi). Biometrika/vaqt sozlamasi saqlanadi. */
export async function setPin(pin, uid) {
  if (!/^\d{4}$/.test(String(pin))) throw new Error('PIN 4 ta raqam');
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(pin, salt, ITERATIONS);
  config = {
    v: 1,
    uid: uid ?? (config && config.uid) ?? null,
    salt,
    hash,
    iter: ITERATIONS,
    bio: !!(config && config.bio),
    timeout: config && TIMEOUTS.includes(config.timeout) ? config.timeout : DEFAULT_TIMEOUT,
  };
  await writeJSON(PREF_KEY, config);
  storage.set(HINT_KEY, '1');
  monoUntil = 0;
  set({ enabled: true, uid: config.uid, bio: config.bio, timeout: config.timeout, locked: false, fails: 0, level: 0, until: 0 });
  await saveAttempts();
}

/**
 * PIN ni tekshiradi (xato urinishlar hisoblanadi).
 * Natija: {ok:true} | {ok:false, left} (qolgan urinish) | {ok:false, until} (kutish tugash vaqti).
 */
export async function checkPin(pin) {
  if (!config) return { ok: false, left: 0 };
  if (cooling()) {
    const until = Math.max(state.until, Date.now() + Math.max(0, monoUntil - mono()));
    if (until !== state.until) set({ until });
    return { ok: false, until };
  }
  // Urinish tekshiruvdan OLDIN yoziladi — tekshiruv paytida ilovani o'ldirib, hisobni chetlab o'tib bo'lmaydi
  const fails = state.fails + 1;
  set({ fails });
  await saveAttempts();
  const hash = await derive(pin, config.salt, config.iter || ITERATIONS);
  if (sameText(hash, config.hash)) {
    monoUntil = 0;
    set({ fails: 0, level: 0, until: 0 });
    await saveAttempts();
    return { ok: true };
  }
  if (fails >= MAX_FAILS) {
    const wait = Math.min(BASE_COOLDOWN * 2 ** state.level, MAX_COOLDOWN);
    monoUntil = mono() + wait;
    set({ fails: 0, level: state.level + 1, until: Date.now() + wait });
    await saveAttempts();
    return { ok: false, until: state.until };
  }
  return { ok: false, left: MAX_FAILS - fails };
}

/** Qulfni butunlay o'chiradi (PIN, biometrika, urinishlar). */
export async function clearLock() {
  config = null;
  monoUntil = 0;
  storage.remove(HINT_KEY);
  set({ enabled: false, uid: null, bio: false, timeout: DEFAULT_TIMEOUT, locked: false, fails: 0, level: 0, until: 0 });
  await Promise.all([writeJSON(PREF_KEY, null), writeJSON(ATTEMPTS_KEY, null)]).catch(() => {});
}

export const setBiometric = (on) => saveConfig({ bio: !!on });
export const setLockTimeout = (sec) => saveConfig({ timeout: TIMEOUTS.includes(sec) ? sec : DEFAULT_TIMEOUT });

// ---------------- Qulflash / ochish ----------------
export function lockNow() {
  if (!state.enabled || !getToken()) return;
  set({ locked: true, epoch: state.epoch + 1 });
}
/** Qulfni ochadi. Ilova "Darhol" rejimida oddiy fonga o'tib bo'lgan bo'lsa — ochmaydi (false). */
export function unlock() {
  if (hidden && bg && !bg.external && state.timeout === 0) return false;
  if (state.locked) set({ locked: false });
  return true;
}
/** Qulf ochilguncha kutadi (masalan, tizim ruxsat oynasi biometrik oyna bilan to'qnashmasin). */
export async function whenUnlocked() {
  await loadLock();
  if (!state.locked) return undefined;
  return new Promise((resolve) => {
    const off = subscribe(() => {
      if (!state.locked) {
        off();
        resolve();
      }
    });
  });
}

// ---------------- Hayot sikli: fon va qaytish ----------------
// Qisqa oraliqlar (bosish, biometrika) — monoton soat (tizim vaqti o'zgarsa ham to'g'ri);
// fonda o'tgan vaqt — Date.now() (qurilma uxlaganda ham yuradi)
let lastExternal = -1e9; // markExternal() vaqti
let hidden = false; // haqiqatan fonga chiqildimi (appStateChange false)
let bg = null; // { at, external }
let bioBusy = false;
let bioEnded = -1e9;

/** Ilova o'zi tashqi oyna ochmoqda (kamera, galereya, ulashish, skaner, to'lov sahifasi) — qaytishda darhol qulflanmaydi. */
export function markExternal() {
  lastExternal = mono();
}
/** Biometrik oyna ochiq (u ham ilovani pauza qiladi — qulflash hisoblanmaydi). */
export function setBioBusy(on) {
  bioBusy = !!on;
  if (!on) bioEnded = mono();
}
const bioRecent = () => bioBusy || mono() - bioEnded < 1500;
/** Ilova ekranda (fonda emas) — biometrik oynani faqat shunda ochish mumkin. */
export const appActive = () => !hidden;

function onBackground() {
  hidden = true;
  bg = null;
  // Faqat biometrik oyna ochiq paytda e'tiborsiz (u ilovani pauza qiladi). Qulf ekrani hali yopilayotgan
  // bo'lsa ham (locked=true, chiqish animatsiyasi) vaqt yoziladi — aks holda qaytishda qulflanmay qoladi.
  if (!state.enabled || !getToken()) return;
  if (bioBusy) {
    // Sozlamalardan (ochiq holatda) ochilgan biometrik oyna: vaqt yoziladi, lekin hozir qulflanmaydi.
    // Oyna o'zi ilovani pauza qilgan bo'lsa — qaytishda bioRecent() e'tiborsiz qoldiradi; foydalanuvchi
    // shu payt Home bosib chiqib ketgan bo'lsa — keyin qaytganda vaqt bo'yicha qulflanadi.
    if (!state.locked) bg = { at: Date.now(), external: false };
    return;
  }
  const external = mono() - lastExternal < EXTERNAL_WINDOW;
  bg = { at: Date.now(), external };
  // "Darhol": oddiy fonga o'tishda shu zahoti qulflanadi (so'nggi ilovalar ro'yxatida ham ko'rinmaydi)
  if (!external && state.timeout === 0 && !state.locked) lockNow();
}

function onForeground() {
  // appStateChange(true) har onResume da keladi (shaffof biometrik/ruxsat oynasidan keyin ham) —
  // faqat haqiqiy fondan qaytish hisobga olinadi
  if (!hidden) return;
  hidden = false;
  const b = bg;
  bg = null;
  if (bioRecent()) return;
  if (state.locked) {
    // Qulf ekranidan fonga chiqib qaytdi — biometrikani yana so'raymiz
    set({ epoch: state.epoch + 1 });
    return;
  }
  if (!b || !state.enabled) return;
  const limit = b.external ? Math.max(state.timeout * 1000, EXTERNAL_GRACE) : state.timeout * 1000;
  const away = Date.now() - b.at;
  // Soat orqaga surilgan bo'lsa (away < 0) — xavfsiz tomonga: qulflanadi
  if (away < 0 || away >= limit) lockNow();
}

/** Bosilgan element tashqi oyna ochadimi: fayl tanlagich, tel:/mailto:/geo:, yangi oynadagi havola. */
function opensExternal(el) {
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest('input[type="file"]')) return true;
  const label = el.closest('label');
  if (label && label.querySelector('input[type="file"]')) return true;
  const a = el.closest('a[href]');
  if (!a) return false;
  const href = a.getAttribute('href') || '';
  return /^(tel|mailto|sms|geo|intent):/i.test(href) || (a.target === '_blank' && /^https?:/i.test(href));
}

let started = false;
/** App plaginining appStateChange hodisasiga obuna (bir marta). */
export async function startLifecycle() {
  if (!IS_NATIVE || started) return;
  started = true;
  // Faqat haqiqatan boshqa ilova ochadigan bosishlar (fayl/galereya, tel:, tashqi havola) — oddiy bosish emas
  document.addEventListener('click', (e) => opensExternal(e.target) && markExternal(), true);
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => (isActive ? onForeground() : onBackground()));
  } catch (err) {
    console.warn('AppLock lifecycle', err);
  }
}

/** "PIN ni unutdim": sessiya (token + Preferences nusxasi), foydalanuvchi keshi va qulf o'chiriladi. */
export async function forgetAndSignOut() {
  try {
    await Promise.race([api.logout(), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* server xatosi — baribir lokal chiqamiz */
  }
  storage.remove('hashar_token');
  storage.remove('hashar_user');
  try {
    window.sessionStorage.clear();
  } catch {
    /* e'tiborsiz */
  }
  try {
    await (await prefsMod()).Preferences.remove({ key: 'hashar_token' });
  } catch {
    /* e'tiborsiz */
  }
  await clearLock();
}
