// Yengil ma'lumot keshi (SWR uslubida): sahifalar orasida o'tganda ma'lumot darhol ko'rinadi,
// orqa fonda yangilanadi. `invalidate('hashars')` — shu prefiksli barcha so'rovlarni qayta yuklaydi.
import { useCallback, useEffect, useRef, useState } from 'react';

const cache = new Map(); // key -> data
const listeners = new Set(); // (prefix) => void

export const peek = (key) => cache.get(key);
export const prime = (key, data) => cache.set(key, data);

/** Shu prefiksli kalitlarni eskirgan deb belgilaydi va ochiq sahifalarni yangilaydi. */
export function invalidate(...prefixes) {
  for (const k of [...cache.keys()]) if (prefixes.some((p) => k.startsWith(p))) cache.delete(k);
  listeners.forEach((fn) => fn(prefixes));
}

/** Barcha keshni tozalaydi (foydalanuvchi almashganda). */
export function clearCache() {
  cache.clear();
  listeners.forEach((fn) => fn(['']));
}

/**
 * @param {string|null} key   null bo'lsa so'rov yuborilmaydi
 * @param {() => Promise<any>} fetcher
 */
export function useApi(key, fetcher) {
  const [state, setState] = useState(() => ({
    data: key ? cache.get(key) : undefined,
    error: null,
    loading: !!key && !cache.has(key),
  }));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return undefined;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: !cache.has(k), error: null }));
    try {
      const data = await fetcherRef.current();
      cache.set(k, data);
      if (my === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (my === seq.current) setState((s) => ({ data: s.data, error, loading: false }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!key) {
      setState({ data: undefined, error: null, loading: false });
      return;
    }
    setState({ data: cache.get(key), error: null, loading: !cache.has(key) });
    load();
  }, [key, load]);

  useEffect(() => {
    const fn = (prefixes) => {
      const k = keyRef.current;
      if (k && prefixes.some((p) => k.startsWith(p))) load();
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, [load]);

  const mutate = useCallback((updater) => {
    const k = keyRef.current;
    if (!k) return;
    setState((s) => {
      const data = typeof updater === 'function' ? updater(s.data) : updater;
      cache.set(k, data);
      return { ...s, data };
    });
  }, []);

  return { ...state, reload: load, mutate };
}
