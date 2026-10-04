// Hash router (sayt va Capacitor APK da bir xil ishlaydi): `#/`, `#/xarita`, `#/hashar/12`, `#/u/3`, `#admin`...
import { useSyncExternalStore } from 'react';

const ROUTES = [
  ['home', /^\/$/],
  ['map', /^\/xarita$/],
  ['list', /^\/hasharlar$/],
  ['hashar', /^\/hashar\/(\d+)$/],
  ['create', /^\/yaratish$/],
  ['results', /^\/natijalar$/],
  ['leaderboard', /^\/reyting$/],
  ['profile', /^\/profil$/],
  ['user', /^\/u\/(\d+)$/],
  ['about', /^\/haqida$/],
  ['login', /^\/kirish$/],
];

/** Joriy manzil admin panelmi (#admin yoki #/admin). */
export const isAdminRoute = (hash = typeof window !== 'undefined' ? window.location.hash : '') =>
  /^#\/?admin(\/|$|\?)/.test(hash);

/** "#/hashar/5?x=1" → { name, path, params: {id}, query } */
export function parseHash(hash) {
  if (isAdminRoute(hash)) return { name: 'admin', path: '/admin', params: {}, query: {}, hash };
  let h = String(hash || '').replace(/^#/, '');
  if (!h.startsWith('/')) h = `/${h}`;
  const qi = h.indexOf('?');
  let path = qi === -1 ? h : h.slice(0, qi);
  const query = qi === -1 ? {} : Object.fromEntries(new URLSearchParams(h.slice(qi + 1)));
  if (path.length > 1) path = path.replace(/\/+$/, '');
  for (const [name, re] of ROUTES) {
    const m = path.match(re);
    if (m) return { name, path, params: m[1] ? { id: Number(m[1]) } : {}, query, hash };
  }
  return { name: 'notfound', path, params: {}, query, hash };
}

// ---- Holat (useSyncExternalStore uchun barqaror snapshot) ----
let current = parseHash(typeof window !== 'undefined' ? window.location.hash : '');
let pendingPush = false;
let lastWasPop = false;
const scrollPositions = new Map();
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

function onHashChange() {
  const next = parseHash(window.location.hash);
  lastWasPop = !pendingPush;
  pendingPush = false;
  if (next.hash === current.hash) return;
  current = next;
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener(
    'scroll',
    () => {
      scrollPositions.set(current.hash, window.scrollY);
    },
    { passive: true },
  );
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getRoute = () => current;
export const navWasPop = () => lastWasPop;
export const savedScroll = (hash) => scrollPositions.get(hash) || 0;

/** React hook: joriy marshrut. */
export function useRoute() {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}

/**
 * Sahifaga o'tish. `to` — "/xarita" ko'rinishida.
 * replace=true — tarixga yangi yozuv qo'shmaydi.
 */
export function navigate(to, { replace = false } = {}) {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (target === window.location.hash) return;
  scrollPositions.delete(target);
  pendingPush = true;
  if (replace) {
    window.history.replaceState(window.history.state, '', target);
    onHashChange();
  } else {
    window.location.hash = target;
  }
}

/** Orqaga: tarix bo'lsa — history.back(), aks holda bosh sahifa. */
export function goBack(fallback = '/') {
  if (window.history.length > 1 && current.name !== 'home') window.history.back();
  else navigate(fallback, { replace: true });
}

// ---- Admin panel (eski API bilan moslik) ----
export function openAdmin() {
  navigate('/admin');
}
export function closeAdmin() {
  if (!isAdminRoute()) return;
  navigate('/', { replace: false });
  window.scrollTo(0, 0);
}
export function useAdminRoute() {
  return useRoute().name === 'admin';
}
