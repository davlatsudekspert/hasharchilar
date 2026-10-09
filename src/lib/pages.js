// Sahifalar reyestri: bosh sahifa asosiy bundle'da, qolganlari alohida (lazy) chunk'lar.
// - loadPage(name): chunk'ni yuklaydi (bir marta), yuklangach komponent sinxron beriladi (Suspense "chaqnashi" yo'q);
// - prefetchRoute('/hashar/5'): havola ustiga kelganda / bosilganda — sahifa kodi + ma'lumoti oldindan;
// - idlePrefetch(): bo'sh vaqtda ehtimoliy keyingi sahifalar kodi;
// - sahifa o'tishi animatsiyasi: View Transitions API (bo'lmasa — CSS .page-enter), prefers-reduced-motion hurmat qilinadi.
import { lazy } from 'react';
import { flushSync } from 'react-dom';
import HomePage from '../pages/HomePage.jsx';
import { getToken } from './api.js';
import { preloadRouteData } from './queries.js';
import { getRoute, parseHash, setPrefetcher, setTransitionHook } from './router.js';

const LOADERS = {
  map: () => import('../pages/MapPage.jsx'),
  list: () => import('../pages/ListPage.jsx'),
  hashar: () => import('../pages/HasharPage.jsx'),
  create: () => import('../pages/CreatePage.jsx'),
  results: () => import('../pages/ResultsPage.jsx'),
  leaderboard: () => import('../pages/LeaderboardPage.jsx'),
  profile: () => import('../pages/ProfilePage.jsx'),
  user: () => import('../pages/UserPage.jsx'),
  about: () => import('../pages/AboutPage.jsx'),
  login: () => import('../pages/LoginPage.jsx'),
  notifications: () => import('../pages/NotificationsPage.jsx'),
  payment: () => import('../pages/PaymentPage.jsx'),
  notfound: () => import('../pages/NotFoundPage.jsx'),
};

const resolved = { home: HomePage }; // name -> komponent (yuklangan)
const promises = new Map();

/** Sahifa chunk'ini yuklaydi. Xato bo'lsa keyingi urinishda qayta so'raladi. */
export function loadPage(name) {
  if (resolved[name]) return Promise.resolve(resolved[name]);
  const loader = LOADERS[name] || LOADERS.notfound;
  if (!promises.has(name)) {
    promises.set(
      name,
      loader().then(
        (m) => (resolved[name] = m.default),
        (err) => {
          promises.delete(name);
          throw err;
        },
      ),
    );
  }
  return promises.get(name);
}

// Sinxron "thenable": chunk allaqachon yuklangan bo'lsa React.lazy to'xtamasdan (Suspense'siz) chizadi
const syncThenable = (value) => ({ then: (resolve) => resolve(value) });
// Har marshrut uchun BITTA barqaror komponent: chunk yuklangach turi o'zgarmaydi (aks holda sahifa qayta o'rnatilib,
// formadagi holat — masalan, email kodi bosqichi — yo'qolardi)
const lazies = Object.fromEntries(
  Object.keys(LOADERS).map((n) => [n, lazy(() => (resolved[n] ? syncThenable({ default: resolved[n] }) : loadPage(n).then((c) => ({ default: c }))))]),
);

/** Marshrut nomi → komponent (identifikatori barqaror). */
export const pageFor = (name) => (name === 'home' ? HomePage : lazies[name] || lazies.notfound);
export const isPageLoaded = (name) => !!resolved[name];

/** "/hashar/5" kabi manzil uchun sahifa kodi va ma'lumotini oldindan yuklaydi. */
export function prefetchRoute(to) {
  try {
    const r = parseHash(`#${to}`);
    if (r.name === 'admin') return;
    loadPage(r.name).catch(() => {});
    preloadRouteData(r, { authed: !!getToken() });
  } catch {
    /* e'tiborsiz */
  }
}

/** Bo'sh vaqtda ehtimoliy keyingi sahifalar kodini yuklaydi (MapLibre emas — u faqat xaritada). */
export function idlePrefetch() {
  const queue = ['list', 'hashar', 'profile', 'create', 'results', 'map', 'notifications', 'leaderboard', 'about'];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 400));
  const step = () => {
    const name = queue.shift();
    if (!name) return;
    loadPage(name)
      .catch(() => {})
      .finally(() => idle(step, { timeout: 4000 }));
  };
  // Birinchi ekran va uning so'rovlari tugashiga imkon beramiz
  setTimeout(() => idle(step, { timeout: 4000 }), 1800);
}

// ---------------- Sahifa o'tishi (View Transitions) ----------------
const TAB_ROOTS = new Set(['home', 'map', 'list', 'results', 'profile', 'leaderboard', 'about', 'notifications']);
const reducedMotion = () => !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// View Transition butun yangi sahifani ekran "muzlagan" holda chizadi (eski kadr → yangi sahifa → yangi kadr).
// Sekin qurilmada bu 100+ ms qotish beradi — shunday bo'lsa CSS zaxira animatsiyasiga (.page-enter) o'tamiz:
// juda kuchsiz qurilmada darhol, boshqalarida bitta juda sekin (2× byudjet) yoki 2 ta sekin o'tishdan keyin
// (shu seans davomida).
const VT_BUDGET_MS = 90;
const weakDevice = () => {
  try {
    return (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2);
  } catch {
    return false;
  }
};
let vtSlow = weakDevice() ? 2 : 0;
let navSeq = 0;
let progressTimer = null;

function setLoading(on) {
  const root = document.documentElement;
  clearTimeout(progressTimer);
  if (on) progressTimer = setTimeout(() => root.classList.add('nav-loading'), 120); // tez yuklansa — ko'rsatilmaydi
  else root.classList.remove('nav-loading');
}

function transition(next, dir, commit) {
  const my = ++navSeq;
  const prev = getRoute();
  const run = () => {
    setLoading(false);
    if (my !== navSeq) return; // keyinroq boshqa sahifaga o'tildi
    const root = document.documentElement;
    const canVT =
      typeof document.startViewTransition === 'function' &&
      !reducedMotion() &&
      document.visibilityState === 'visible' &&
      next.name !== 'admin' &&
      prev.name !== 'admin' &&
      vtSlow < 2 &&
      !root.classList.contains('modal-open');
    if (!canVT) {
      commit();
      return;
    }
    root.dataset.nav = dir === 'back' ? 'back' : TAB_ROOTS.has(prev.name) && TAB_ROOTS.has(next.name) ? 'tab' : 'forward';
    root.classList.add('vt-running');
    try {
      const t0 = performance.now();
      const t = document.startViewTransition(() => flushSync(commit));
      // ready — animatsiya boshlanishi: shu paytgacha ekran qotib turadi
      t.ready.then(
        () => {
          const dt = performance.now() - t0;
          if (dt > VT_BUDGET_MS) vtSlow += dt > 2 * VT_BUDGET_MS ? 2 : 1;
        },
        () => {},
      );
      t.finished.finally(() => root.classList.remove('vt-running'));
    } catch {
      root.classList.remove('vt-running');
      commit();
    }
  };
  if (next.name === 'admin' || isPageLoaded(next.name)) return run();
  // Sahifa kodi hali yo'q — qisqa kutamiz (yuqorida ingichka progress chizig'i), keyin baribir o'tamiz
  setLoading(true);
  const timeout = new Promise((r) => setTimeout(r, 1200));
  Promise.race([loadPage(next.name), timeout]).then(run, run);
}

setTransitionHook(transition);
setPrefetcher(prefetchRoute);
