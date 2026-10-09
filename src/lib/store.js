// Ma'lumot keshi (stale-while-revalidate): sahifalar orasida o'tganda ma'lumot darhol ko'rinadi, orqa fonda
// yangilanadi. Xotira + sessionStorage (sahifa yangilansa ham birinchi ekran darhol chiziladi).
// Bir xil kalitga parallel so'rovlar bitta so'rovga birlashtiriladi. `invalidate('hashars')` — shu prefiksli
// barcha kalitlarni eskirgan deb belgilaydi va ochiq sahifalar fonda qayta yuklaydi (eski ma'lumot ko'rinib turadi).
import { useCallback, useEffect, useRef, useState } from 'react';

const cache = new Map(); // key -> { data, t } (t — olingan vaqt; 0 — eskirgan)
const inflight = new Map(); // key -> Promise
const listeners = new Set(); // (prefixes, reload) => void
const SS = 'swr:';
const SS_MAX = 300_000; // bitta yozuv uchun (belgi)
const DEDUPE_MS = 4000; // shu vaqt ichida olingan ma'lumot qayta so'ralmaydi

function ssGet(key) {
  try {
    const raw = window.sessionStorage.getItem(SS + key);
    if (!raw) return undefined;
    const v = JSON.parse(raw);
    return v && 'd' in v ? { data: v.d, t: 0 } : undefined; // sessiyadan tiklangan — doim eskirgan (fonda yangilanadi)
  } catch {
    return undefined;
  }
}
function ssSet(key, data) {
  try {
    const raw = JSON.stringify({ d: data });
    if (raw.length <= SS_MAX) window.sessionStorage.setItem(SS + key, raw);
  } catch {
    /* kvota / private rejim — e'tiborsiz */
  }
}
function ssRemove(match) {
  try {
    const ss = window.sessionStorage;
    for (let i = ss.length - 1; i >= 0; i--) {
      const k = ss.key(i);
      if (k && k.startsWith(SS) && match(k.slice(SS.length))) ss.removeItem(k);
    }
  } catch {
    /* e'tiborsiz */
  }
}

function entry(key) {
  let e = cache.get(key);
  if (!e) {
    e = ssGet(key);
    if (e) cache.set(key, e);
  }
  return e;
}

const notify = (prefixes, reload) => listeners.forEach((fn) => fn(prefixes, reload));

export const peek = (key) => entry(key)?.data;
export const prime = (key, data) => {
  cache.set(key, { data, t: Date.now() });
  ssSet(key, data);
};

// Tartib hisoblagichi: so'rov eskirtirishdan (invalidate) keyin boshlangan bo'lsa — unga qo'shilinadi,
// oldin boshlangan bo'lsa — yangi so'rov yuboriladi (eski javob yangi ma'lumot ustiga yozilmaydi).
let clock = 0;
const staleAt = new Map(); // key -> clock

/** Kalitni yuklaydi (parallel so'rovlar birlashtiriladi) va keshga yozadi. */
export function fetchKey(key, fetcher, { force = false } = {}) {
  const e = cache.get(key);
  if (!force && e && e.t && Date.now() - e.t < DEDUPE_MS) return Promise.resolve(e.data);
  const cur = inflight.get(key);
  if (cur && cur.n > (staleAt.get(key) || 0)) return cur.p;
  const n = ++clock;
  const p = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      if (inflight.get(key)?.n === n) prime(key, data);
      return data;
    })
    .finally(() => {
      if (inflight.get(key)?.n === n) inflight.delete(key);
    });
  inflight.set(key, { n, p });
  return p;
}

/** Oldindan yuklash (masalan, havola ustiga kelganda yoki bo'sh vaqtda): xato e'tiborsiz. */
export function preload(key, fetcher) {
  if (cache.get(key)?.t) return;
  fetchKey(key, fetcher).catch(() => {});
}

/** Shu prefiksli kalitlarni eskirgan deb belgilaydi va ochiq sahifalarni (fonda) yangilaydi. */
export function invalidate(...prefixes) {
  const hit = (k) => prefixes.some((p) => k.startsWith(p));
  const n = ++clock;
  for (const [k, e] of cache) if (hit(k)) cache.set(k, { data: e.data, t: 0 });
  for (const k of [...cache.keys(), ...inflight.keys()]) if (hit(k)) staleAt.set(k, n);
  ssRemove(hit);
  notify(prefixes, true);
}

/**
 * Keshdagi ma'lumotni so'rovsiz yangilaydi (optimistik o'zgarish): `fn(data, key)` yangi qiymat qaytaradi
 * (o'zgarmasa — o'sha obyekt). Masalan, "saqlangan" belgisini barcha ro'yxatlarda bir zumda almashtirish.
 */
export function updateCached(prefix, fn) {
  const touched = [];
  for (const [k, e] of cache) {
    if (!k.startsWith(prefix) || e.data === undefined) continue;
    const next = fn(e.data, k);
    if (next !== e.data) {
      cache.set(k, { data: next, t: e.t });
      ssSet(k, next);
      touched.push(k);
    }
  }
  if (touched.length) notify(touched, false);
}

// Ilova/oyna qayta ko'ringanda (fondan qaytish) 30 s dan eski ma'lumot fonda yangilanadi
const STALE_ON_FOCUS_MS = 30000;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    const old = [...cache.entries()].filter(([, e]) => !e.t || now - e.t > STALE_ON_FOCUS_MS).map(([k]) => k);
    if (old.length) notify(old, true);
  });
}

/** Barcha keshni tozalaydi (foydalanuvchi almashganda). */
export function clearCache() {
  cache.clear();
  inflight.clear();
  staleAt.clear();
  ssRemove(() => true);
  notify([''], true);
}

/**
 * @param {string|null} key   null bo'lsa so'rov yuborilmaydi
 * @param {() => Promise<any>} fetcher
 * Natija: { data, error, loading (ma'lumot hali yo'q), validating (fonda yangilanmoqda), reload, mutate }
 */
export function useApi(key, fetcher) {
  const [state, setState] = useState(() => {
    const e = key ? entry(key) : undefined;
    return { data: e?.data, error: null, loading: !!key && !e, validating: false };
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async (force = false) => {
    const k = keyRef.current;
    if (!k) return undefined;
    const my = ++seq.current;
    const has = !!entry(k);
    setState((s) => ({ ...s, loading: !has && s.data === undefined, validating: true, error: null }));
    try {
      const data = await fetchKey(k, () => fetcherRef.current(), { force });
      if (my === seq.current && keyRef.current === k) setState({ data, error: null, loading: false, validating: false });
      return data;
    } catch (error) {
      if (my === seq.current && keyRef.current === k) setState((s) => ({ data: s.data, error, loading: false, validating: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!key) {
      setState({ data: undefined, error: null, loading: false, validating: false });
      return;
    }
    const e = entry(key);
    setState({ data: e?.data, error: null, loading: !e, validating: false });
    load();
  }, [key, load]);

  useEffect(() => {
    const fn = (prefixes, reload) => {
      const k = keyRef.current;
      if (!k || !prefixes.some((p) => k.startsWith(p))) return;
      if (reload) load(true);
      else {
        const e = cache.get(k);
        if (e) setState((s) => (s.data === e.data ? s : { ...s, data: e.data }));
      }
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, [load]);

  const mutate = useCallback((updater) => {
    const k = keyRef.current;
    if (!k) return;
    setState((s) => {
      const data = typeof updater === 'function' ? updater(s.data) : updater;
      cache.set(k, { data, t: cache.get(k)?.t || Date.now() });
      ssSet(k, data);
      return { ...s, data };
    });
  }, []);

  const reload = useCallback(() => load(true), [load]);
  return { ...state, reload, mutate };
}
