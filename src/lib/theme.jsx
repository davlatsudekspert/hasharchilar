// Mavzu: rejim 'system' (standart) | 'light' | 'dark' va rang aksenti 'zumrad' (standart) | 'okean' | 'shafaq' | 'binafsha'.
// Tanlov localStorage['hashar_theme'] va localStorage['hashar_accent'] da; index.html dagi skript birinchi chizishdan
// oldin qo'llaydi. <html class="dark" data-accent="..."> qo'yiladi; admin panel doim yorug' rejimda (aksent saqlanadi).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isAdminRoute } from './router.js';
import { storage } from './storage.js';
import { setNativeTheme } from './native.js';

const KEY = 'hashar_theme';
const ACCENT_KEY = 'hashar_accent';
const ThemeContext = createContext(null);

/** Aksentlar: nomi, tavsifi va tanlagich/oldindan ko'rish uchun asosiy ranglar (CSS dagi --a-* bilan bir xil). */
export const ACCENTS = [
  { id: 'zumrad', label: 'Zumrad', hint: "Yashil — standart", c400: '#34d399', c500: '#10b981', c600: '#059669', c700: '#047857' },
  { id: 'okean', label: 'Okean', hint: "Ko'k-feruza", c400: '#1dc2df', c500: '#06a5c4', c600: '#0784a6', c700: '#0b6986' },
  { id: 'shafaq', label: 'Shafaq', hint: "To'q sariq-marjon", c400: '#ff8452', c500: '#f86b36', c600: '#e35319', c700: '#be3f0d' },
  { id: 'binafsha', label: 'Binafsha', hint: 'Siyohrang', c400: '#a78bfa', c500: '#8b5cf6', c600: '#7c3aed', c700: '#6d28d9' },
];
const ACCENT_IDS = new Set(ACCENTS.map((a) => a.id));

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

export const readThemePref = () => {
  const v = storage.get(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
};
export const readAccent = () => {
  const v = storage.get(ACCENT_KEY);
  return ACCENT_IDS.has(v) ? v : 'zumrad';
};

/** CSS o'zgaruvchisining hisoblangan qiymati (masalan '--a-600' → '#059669'). */
export function cssVar(name, fallback = '') {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

// Aksent o'zgarganini kuzatuvchilar (xarita qatlamlari kabi React'dan tashqari joylar uchun)
const accentListeners = new Set();
export function onAccentChange(fn) {
  accentListeners.add(fn);
  return () => accentListeners.delete(fn);
}

let appliedKey = ''; // oxirgi qo'llangan holat ("dark|aksent")

/** Meta teg qiymati faqat o'zgarganda yoziladi (color-scheme / theme-color yozilsa butun hujjat stili qayta hisoblanadi). */
function setMeta(name, value) {
  const m = document.querySelector(`meta[name="${name}"]`);
  if (m && m.getAttribute('content') !== value) m.setAttribute('content', value);
}

/**
 * <html> klassi/atributi, theme-color meta va native status bar. Holat o'zgarmagan bo'lsa hech narsa qilmaydi:
 * har sahifa o'tishida (hashchange) chaqiriladi — getComputedStyle va meta yozuvlari ~1000 elementli sahifada
 * sekin telefonda 100+ ms "muzlash" berardi.
 */
export function applyTheme(resolved, accent = readAccent()) {
  const dark = resolved === 'dark' && !isAdminRoute();
  const key = `${dark ? 1 : 0}|${accent}`;
  if (key === appliedKey) return;
  appliedKey = key;
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  const prevAccent = root.getAttribute('data-accent');
  if (prevAccent !== accent) root.setAttribute('data-accent', accent);
  // Status bar / brauzer paneli rangi — sahifa sarlavhasi (surface) rangi, aksent tusida
  const bar = cssVar('--c-surface', dark ? '#0e1a16' : '#ffffff');
  setMeta('theme-color', bar);
  setMeta('color-scheme', dark ? 'dark' : 'light');
  setNativeTheme(dark, bar);
  if (prevAccent !== accent) accentListeners.forEach((fn) => fn(accent));
}

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(readThemePref);
  const [accent, setAccentState] = useState(readAccent);
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
    applyTheme(resolved, accent);
    // Admin paneldan chiqilganda/kirilganda qayta qo'llanadi
    const on = () => applyTheme(resolved, accent);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [resolved, accent]);

  const setTheme = useCallback((v) => {
    setPref(v);
    if (v === 'system') storage.remove(KEY);
    else storage.set(KEY, v);
  }, []);

  const setAccent = useCallback((v) => {
    if (!ACCENT_IDS.has(v)) return;
    setAccentState(v);
    if (v === 'zumrad') storage.remove(ACCENT_KEY);
    else storage.set(ACCENT_KEY, v);
  }, []);

  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme]);

  const value = useMemo(
    () => ({ pref, resolved, dark: resolved === 'dark', accent, setTheme, setAccent, toggle }),
    [pref, resolved, accent, setTheme, setAccent, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const FALLBACK = { pref: 'system', resolved: 'light', dark: false, accent: 'zumrad', setTheme: () => {}, setAccent: () => {}, toggle: () => {} };
export function useTheme() {
  return useContext(ThemeContext) || FALLBACK;
}
