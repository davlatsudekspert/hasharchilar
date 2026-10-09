// Ilova darajasidagi amallar: kirishni talab qilish (AuthModal), emailni tasdiqlashni talab qilish
// (EmailVerifyScreen), qo'shilish/chiqish, ulashish.
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { api, onEmailUnverified } from './api.js';
import { onPasswordLogin, useAuth } from './auth.jsx';
import { shareUrl } from './config.js';
import { haptic, shareLink } from './native.js';
import { getServerConfig, useServerConfig } from './serverConfig.js';
import { refreshUnread } from './notifications.js';
import { invalidate } from './store.js';
import { IS_NATIVE } from './config.js';

// "Emailni tasdiqlang" bosqichi shu brauzer sessiyasida o'zi bir marta ko'rsatilganmi (keyin — banner va amallar)
const PROMPTED_KEY = 'hashar_verify_prompted';
function promptedOnce() {
  try {
    if (window.sessionStorage.getItem(PROMPTED_KEY) === '1') return true;
    window.sessionStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    /* e'tiborsiz */
  }
  return false;
}

/** Email xizmati yoqilgan va foydalanuvchi emaili tasdiqlanmagan. */
export const needsEmailVerify = (user) => Boolean(user) && user.email_verified === false && getServerConfig().email_enabled;

// Kirish va email tasdiqlash oynalari kerak bo'lgandagina yuklanadi (asosiy bundle yengilroq)
const AuthModal = lazy(() => import('../components/AuthModal.jsx'));
const EmailVerifyScreen = lazy(() => import('../components/EmailVerifyScreen.jsx'));

const ActionsContext = createContext(null);

export function ActionsProvider({ children }) {
  const auth = useAuth();
  const toast = useToast();
  const [authReason, setAuthReason] = useState(null);
  const resolver = useRef(null);
  const [busyId, setBusyId] = useState(null);
  const [verifyReason, setVerifyReason] = useState(null);
  const verifyResolvers = useRef([]);
  // Eng so'nggi foydalanuvchi (AuthModal dan keyin render kutilmasin)
  const userRef = useRef(auth.user);
  userRef.current = auth.user ?? userRef.current;
  if (!auth.user && auth.ready) userRef.current = null;

  /** "Emailni tasdiqlang" oynasini ochadi; natija — tasdiqlandimi. Ochiq bo'lsa o'sha oynani kutadi. */
  const promptVerify = useCallback((reason = 'action') => {
    return new Promise((resolve) => {
      verifyResolvers.current.push(resolve);
      // Aniq sabab (masalan, 'join') umumiy 'login' dan ustun
      setVerifyReason((r) => (!r || r === 'login' ? reason : r));
    });
  }, []);

  const finishVerify = (ok) => {
    setVerifyReason(null);
    const list = verifyResolvers.current;
    verifyResolvers.current = [];
    if (ok) invalidate('');
    list.forEach((r) => r(ok));
  };

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
    if (ok && user) userRef.current = user;
    setAuthReason(null);
    const r = resolver.current;
    resolver.current = null;
    if (ok && user) toast(`Xush kelibsiz, ${user.name}!`);
    invalidate('');
    r?.(ok);
  };

  /** Kirgan va (email yoqilgan bo'lsa) emaili tasdiqlangan bo'lsa true; aks holda kerakli oyna ochiladi. */
  const requireVerified = useCallback(
    async (reason = 'action') => {
      if (!(await requireAuth(reason))) return false;
      if (!needsEmailVerify(userRef.current)) return true;
      return promptVerify(reason);
    },
    [requireAuth, promptVerify],
  );

  // Mehmon uchun kirish oynasi kodi bo'sh vaqtda oldindan (birinchi "Qatnashish" bosilganda kutilmasin)
  useEffect(() => {
    if (!auth.ready || auth.user) return undefined;
    const t = setTimeout(() => import('../components/AuthModal.jsx').catch(() => {}), 3500);
    return () => clearTimeout(t);
  }, [auth.ready, auth.user]);

  // Parol bilan kirgan, emaili tasdiqlanmagan foydalanuvchi — darhol "Emailni tasdiqlang"
  useEffect(
    () =>
      onPasswordLogin((u) => {
        if (!needsEmailVerify(u)) return;
        promptedOnce();
        promptVerify('login');
      }),
    [promptVerify],
  );

  // Avvaldan kirgan (sessiyasi saqlangan) emaili tasdiqlanmagan foydalanuvchi — sessiyada bir marta shu bosqich
  const { email_enabled: emailOn } = useServerConfig();
  const unverifiedId = auth.ready && auth.user && auth.user.email_verified === false ? auth.user.id : null;
  useEffect(() => {
    if (emailOn && unverifiedId && !promptedOnce()) promptVerify('login');
  }, [emailOn, unverifiedId, promptVerify]);

  // Istalgan so'rov 403 email_unverified qaytarsa (masalan, boshqa qurilmada email o'zgargan) — shu oyna
  const setUser = auth.setUser;
  useEffect(
    () =>
      onEmailUnverified(() => {
        const u = userRef.current;
        if (u && u.email_verified !== false) setUser({ ...u, email_verified: false });
        promptVerify('action');
      }),
    [promptVerify, setUser],
  );

  const refreshAfterChange = useCallback(
    (id) => {
      invalidate('hashars', `hashar:${id}`, 'stats', 'me:', 'user:', 'leaderboard');
      auth.refresh().catch(() => {});
      refreshUnread();
    },
    [auth],
  );

  /** Qo'shilish. Muvaffaqiyatli bo'lsa server javobi ({joined, volunteer_count}). */
  const join = useCallback(
    async (id) => {
      if (!(await requireVerified('join'))) return null;
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
    [requireVerified, toast, refreshAfterChange],
  );

  const leave = useCallback(
    async (id) => {
      if (!(await requireVerified('leave'))) return null;
      setBusyId(id);
      try {
        const r = await api.leave(id);
        haptic('light');
        // APK: shu hashar eslatmalari bekor qilinadi (qolganlari me:joined yangilanganda qayta sinxronlanadi)
        if (IS_NATIVE)
          import('../native/reminders.js')
            .then((m) => m.cancelReminders(id))
            .catch(() => {});
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
    [requireVerified, toast, refreshAfterChange],
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
    () => ({ requireAuth, requireVerified, promptVerify, verifying: !!verifyReason, join, leave, share, busyId, refreshAfterChange }),
    [requireAuth, requireVerified, promptVerify, verifyReason, join, leave, share, busyId, refreshAfterChange],
  );

  return (
    <ActionsContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {authReason && <AuthModal reason={authReason} onClose={() => finishAuth(false)} onSuccess={(u) => finishAuth(true, u)} />}
        {verifyReason && <EmailVerifyScreen reason={verifyReason} onDone={finishVerify} />}
      </Suspense>
    </ActionsContext.Provider>
  );
}

export function useActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions ActionsProvider ichida ishlatilishi kerak');
  return ctx;
}
