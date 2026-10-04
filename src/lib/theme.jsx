// Tungi rejim: 'system' (standart) | 'light' | 'dark'. Tanlov localStorage['hashar_theme'] da saqlanadi.
// <html class="dark"> qo'yiladi; admin panel doim yorug' rejimda (o'z uslubida).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isAdminRoute } from './router.js';
import { storage } from './storage.js';
import { setNativeTheme } from './native.js';

const KEY = 'hashar_theme';
const ThemeContext = createContext(null);

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

export const readThemePref = () => {
  const v = storage.get(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
};

/** <html> klassi, theme-color meta va native status bar. */
export function applyTheme(resolved) {
  const dark = resolved === 'dark' && !isAdminRoute();
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0e1a16' : '#ffffff');
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', dark ? 'dark' : 'light');
  setNativeTheme(dark);
}

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(readThemePref);
  const [sys, setSys] = useState(systemDark);
  const resolved = pref === 'system' ? (sys ? 'dark' : 'light') : pref;

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);

  useEffect(() => {
    applyTheme(resolved);
    // Admin paneldan chiqilganda/kirilganda qayta qo'llanadi
    const on = () => applyTheme(resolved);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [resolved]);

  const setTheme = useCallback((v) => {
    setPref(v);
    if (v === 'system') storage.remove(KEY);
    else storage.set(KEY, v);
  }, []);

  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme]);

  const value = useMemo(() => ({ pref, resolved, dark: resolved === 'dark', setTheme, toggle }), [pref, resolved, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext) || { pref: 'system', resolved: 'light', dark: false, setTheme: () => {}, toggle: () => {} };
}
