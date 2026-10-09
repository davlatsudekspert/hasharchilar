// Bildirishnomalar: o'qilmaganlar soni (header qo'ng'iroqchasi, tab bar nuqtasi). Ilova ko'rinib turganda
// 60 s da bir yangilanadi; ilova/ilova oynasi qayta ochilganda darhol. Server marshruti yo'q bo'lsa (eski worker) — jim.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api, getToken } from './api.js';
import { useAuth } from './auth.jsx';
import { onAppResume } from './native.js';
import { invalidate, updateCached, useApi } from './store.js';

let state = { count: 0, supported: true };
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

/** Javobdan sonni ajratadi: {count} | {unread} | son. */
const countOf = (r) => Math.max(0, Number(r && typeof r === 'object' ? r.count ?? r.unread ?? 0 : r) || 0);

let inflight = null;
/** Serverdan o'qilmaganlar sonini yangilaydi. */
export function refreshUnread() {
  if (!getToken()) {
    set({ count: 0 });
    return Promise.resolve(0);
  }
  if (!state.supported) return Promise.resolve(state.count);
  if (!inflight) {
    inflight = api
      .unreadCount()
      .then((r) => {
        const n = countOf(r);
        // Yangi bildirishnoma keldi — ochiq ro'yxat (sahifa / header oynasi) ham yangilansin
        if (n > state.count) invalidate('me:notifications');
        set({ count: n });
        return n;
      })
      .catch((e) => {
        if (e && e.status === 404) set({ supported: false, count: 0 });
        return state.count;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Lokal o'zgartirish (masalan, o'qildi deb belgilanganda). */
export const setUnread = (n) => set({ count: Math.max(0, n) });

/** React: { count, supported }. */
export const useUnread = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/** Ilova qobig'ida bir marta: kirgan foydalanuvchi uchun so'rov sikli. */
export function useNotificationsPolling() {
  const { user } = useAuth();
  const uid = user ? user.id : null;
  useEffect(() => {
    if (!uid) {
      set({ count: 0 });
      return undefined;
    }
    set({ supported: true });
    const tick = () => {
      if (document.visibilityState === 'visible') refreshUnread();
    };
    // Birinchi so'rov — asosiy kontentdan keyin
    const first = setTimeout(tick, 1200);
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    const offResume = onAppResume(tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      offResume();
    };
  }, [uid]);
}

/** Bildirishnoma turi bo'yicha qisqa sarlavha, ikkinchi qator va havola (server `text` — zaxira). */
export function describeNotification(n) {
  const d = (n && typeof n.data === 'object' && n.data) || {};
  const actor = (n.actor && n.actor.name) || 'Kimdir';
  const title = (n.hashar && n.hashar.title) || d.title || '';
  const hid = (n.hashar && !n.hashar.deleted && n.hashar.id) || null;
  const link = hid ? `/hashar/${hid}` : null;
  const excerpt = d.excerpt || d.body;
  switch (n.type) {
    case 'join':
      return { kind: 'join', actor, text: "hasharingizga qo'shildi", sub: title, link };
    case 'comment':
      return { kind: 'comment', actor, text: 'izoh qoldirdi', sub: excerpt ? `“${String(excerpt).slice(0, 100)}” · ${title}` : title, link };
    case 'completed':
      return { kind: 'completed', text: 'Siz qatnashgan hashar yakunlandi', sub: title ? `${title} — natijani ko'ring` : "Natijani ko'ring", link };
    case 'payment_confirmed':
      return { kind: 'paid', text: "To'lov tasdiqlandi — hashar e'lon qilindi", sub: title, link };
    case 'payment_cancelled':
      return { kind: 'cancelled', text: "To'lov bekor qilindi", sub: title, link: hid ? `/tolov/${hid}` : null };
    case 'published':
      return { kind: 'published', text: "Hasharingiz e'lon qilindi", sub: title, link };
    default:
      return { kind: 'info', text: n.text || 'Yangi bildirishnoma', sub: title, link };
  }
}

/** O'qilganmi (server `read` yoki `read_at`). */
export const isRead = (n) => Boolean(n && (n.read || n.read_at));

const FEED_KEY = 'me:notifications';
const itemsOf = (r) => (Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : []);

/**
 * Bildirishnomalar ro'yxati: birinchi sahifa keshda (header oynasi va sahifa bir xil), "Yana" — `before` bilan.
 * `poll` — ko'rinib turganda 60 s da yangilash.
 */
export function useNotificationFeed({ enabled = true, poll = false } = {}) {
  const first = useApi(enabled ? FEED_KEY : null, () => api.notifications());
  const [older, setOlder] = useState([]);
  const [moreState, setMoreState] = useState({ busy: false, next: undefined });
  const head = itemsOf(first.data);
  const items = [...head, ...older.filter((o) => !head.some((h) => h.id === o.id))];
  const next = moreState.next !== undefined ? moreState.next : first.data?.next_before ?? null;
  const hasMore = moreState.next !== undefined ? moreState.next != null : Boolean(first.data?.has_more);

  // Server unread_count qaytarsa — badge darhol mos
  useEffect(() => {
    const n = first.data && first.data.unread_count;
    if (typeof n === 'number') setUnread(n);
  }, [first.data]);

  const reload = first.reload;
  useEffect(() => {
    if (!enabled || !poll) return undefined;
    const tick = () => document.visibilityState === 'visible' && reload();
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    const off = onAppResume(tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      off();
    };
  }, [enabled, poll, reload]);

  const loadMore = useCallback(async () => {
    if (!next || moreState.busy) return;
    setMoreState((m) => ({ ...m, busy: true }));
    try {
      const r = await api.notifications(next);
      setOlder((o) => [...o, ...itemsOf(r)]);
      setMoreState({ busy: false, next: r && r.has_more ? r.next_before : null });
    } catch {
      setMoreState((m) => ({ ...m, busy: false }));
    }
  }, [next, moreState.busy]);

  /** O'qildi deb belgilash (optimistik). ids yo'q — hammasi. */
  const markRead = useCallback(
    async (ids) => {
      const all = !ids;
      const set = new Set(ids || []);
      const mark = (n) => (all || set.has(n.id) ? (n.read || n.read_at ? n : { ...n, read: true, read_at: new Date().toISOString() }) : n);
      const unreadBefore = items.filter((n) => !(n.read || n.read_at) && (all || set.has(n.id))).length;
      updateCached(FEED_KEY, (d) => (d && Array.isArray(d.items) ? { ...d, items: d.items.map(mark), unread_count: all ? 0 : Math.max(0, (d.unread_count || 0) - unreadBefore) } : d));
      setOlder((o) => o.map(mark));
      setUnread(all ? 0 : state.count - unreadBefore);
      try {
        const r = await api.markRead(all ? { all: true } : { ids: [...set] });
        if (r && typeof r.unread_count === 'number') setUnread(r.unread_count);
      } catch {
        refreshUnread();
      }
    },
    [items],
  );

  return { items, loading: first.loading, error: first.error, reload, loadMore, hasMore, loadingMore: moreState.busy, markRead, unsupported: first.error && first.error.status === 404 };
}
