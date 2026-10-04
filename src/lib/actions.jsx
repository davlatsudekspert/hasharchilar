// Ilova darajasidagi amallar: kirishni talab qilish (AuthModal), qo'shilish/chiqish, ulashish.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import AuthModal from '../components/AuthModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { shareUrl } from './config.js';
import { haptic, shareLink } from './native.js';
import { invalidate } from './store.js';

const ActionsContext = createContext(null);

export function ActionsProvider({ children }) {
  const auth = useAuth();
  const toast = useToast();
  const [authReason, setAuthReason] = useState(null);
  const resolver = useRef(null);
  const [busyId, setBusyId] = useState(null);

  /** Kirgan bo'lsa true; aks holda AuthModal ochiladi va natija kutiladi. */
  const requireAuth = useCallback(
    (reason = 'login') => {
      if (auth.user) return Promise.resolve(true);
      return new Promise((resolve) => {
        resolver.current = resolve;
        setAuthReason(reason);
      });
    },
    [auth.user],
  );

  const finishAuth = (ok, user) => {
    setAuthReason(null);
    const r = resolver.current;
    resolver.current = null;
    if (ok && user) toast(`Xush kelibsiz, ${user.name}!`);
    invalidate('');
    r?.(ok);
  };

  const refreshAfterChange = useCallback(
    (id) => {
      invalidate('hashars', `hashar:${id}`, 'stats', 'me:', 'user:', 'leaderboard');
      auth.refresh().catch(() => {});
    },
    [auth],
  );

  /** Qo'shilish. Muvaffaqiyatli bo'lsa server javobi ({joined, volunteer_count}). */
  const join = useCallback(
    async (id) => {
      if (!(await requireAuth('join'))) return null;
      setBusyId(id);
      try {
        const r = await api.join(id);
        haptic('success');
        toast("Siz ro'yxatga olindingiz. Rahmat! 🌱");
        refreshAfterChange(id);
        return r;
      } catch (e) {
        toast(e.message, 'error');
        if (e.status === 409) refreshAfterChange(id); // joy qolmagan — sahifadagi holat yangilanadi
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [requireAuth, toast, refreshAfterChange],
  );

  const leave = useCallback(
    async (id) => {
      setBusyId(id);
      try {
        const r = await api.leave(id);
        haptic('light');
        toast('Siz hashardan chiqdingiz', 'info');
        refreshAfterChange(id);
        return r;
      } catch (e) {
        toast(e.message, 'error');
        if (e.status === 409) refreshAfterChange(id); // masalan, hashar yakunlangan — holat yangilanadi
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [toast, refreshAfterChange],
  );

  const share = useCallback(
    async (h) => {
      haptic('light');
      const res = await shareLink({
        title: h.title,
        text: `${h.title} — hasharga qo'shiling!`,
        url: shareUrl(`/hashar/${h.id}`),
      });
      if (res === 'copied') toast('Havola nusxalandi');
      else if (res === 'failed') toast("Ulashib bo'lmadi", 'error');
    },
    [toast],
  );

  const value = useMemo(
    () => ({ requireAuth, join, leave, share, busyId, refreshAfterChange }),
    [requireAuth, join, leave, share, busyId, refreshAfterChange],
  );

  return (
    <ActionsContext.Provider value={value}>
      {children}
      {authReason && <AuthModal reason={authReason} onClose={() => finishAuth(false)} onSuccess={(u) => finishAuth(true, u)} />}
    </ActionsContext.Provider>
  );
}

export function useActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions ActionsProvider ichida ishlatilishi kerak');
  return ctx;
}
