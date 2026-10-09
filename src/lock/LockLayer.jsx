// APK qulf qatlami: ilova ustidagi qulf ekrani (PIN + barmoq izi). AppLock.jsx faqat native'da yuklaydi.
// Ilova (children) hech qachon qayta o'rnatilmaydi — qulf ekrani portal orqali ustidan chiziladi,
// #root esa `inert` qilinadi (fokus, bosish va ekran o'quvchidan yashirin).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '../components/ui.jsx';
import { LeafIcon } from '../components/icons.jsx';
import { getToken } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { registerModal } from '../lib/modals.js';
import { haptic } from '../lib/native.js';
import { clearCache } from '../lib/store.js';
import { cx } from '../lib/utils.js';
import { biometricInfo, verifyBiometric } from './biometric.js';
import { FingerprintIcon, LockIcon } from './icons.jsx';
import { appActive, checkPin, clearLock, forgetAndSignOut, loadLock, lockHint, MAX_FAILS, PIN_LENGTH, startLifecycle, unlock, useLock } from './lockStore.js';
import { formatWait, Keypad, PinDots, usePinKeys } from './PinPad.jsx';

const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export default function LockLayer() {
  const { user } = useAuth();
  const s = useLock();
  const hasToken = !!getToken();

  useEffect(() => {
    loadLock();
    startLifecycle();
  }, []);

  // PIN boshqa hisobga tegishli (boshqa foydalanuvchi kirdi) — eski qulf o'chiriladi
  useEffect(() => {
    if (s.loaded && s.enabled && user && s.uid != null && s.uid !== user.id) clearLock();
  }, [s.loaded, s.enabled, s.uid, user]);

  // Sessiya tugadi (chiqish / 401) — qulf ekrani kerak emas
  useEffect(() => {
    if (s.locked && !hasToken) unlock();
  }, [s.locked, hasToken]);

  if (!s.loaded) return hasToken && lockHint() ? <LockCover /> : null;
  if (!(s.enabled && s.locked && hasToken)) return null;
  return createPortal(<LockScreen user={user} />, document.body);
}

/** Preferences o'qilguncha (bir necha ms) — ilova mazmuni ko'rinmasin. */
export function LockCover() {
  return (
    <div className="lk-screen fixed inset-0 z-[9000] grid place-items-center" aria-hidden="true">
      <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
        <LeafIcon className="h-8 w-8" strokeWidth={2.4} />
      </span>
    </div>
  );
}

function LockScreen({ user }) {
  const s = useLock();
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('idle'); // idle | busy | error | success
  const [shakeKey, setShakeKey] = useState(0);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [bio, setBio] = useState(null); // { available, label }
  const [forgot, setForgot] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const busy = useRef(false);
  const lastPrompt = useRef(-1);
  const pinRef = useRef('');
  const putPin = (v) => {
    pinRef.current = v;
    setPin(v);
  };

  const wait = Math.max(0, s.until - now);
  const cooling = wait > 0;
  const bioOn = s.bio && bio && bio.available;

  // #root — inert (fokus/bosish yo'q), "orqaga" tugmasi ilovani yig'adi
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      root.inert = true;
      root.setAttribute('aria-hidden', 'true');
    }
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
    const off = registerModal(() => {
      import('@capacitor/app').then(({ App }) => App.minimizeApp()).catch(() => {});
    });
    return () => {
      off();
      if (root) {
        root.inert = false;
        root.removeAttribute('aria-hidden');
      }
    };
  }, []);

  // Kutish vaqti — har soniya yangilanadi
  useEffect(() => {
    if (!cooling) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooling]);
  useEffect(() => {
    setNow(Date.now());
  }, [s.until]);

  useEffect(() => {
    let alive = true;
    if (s.bio) biometricInfo().then((r) => alive && setBio(r));
    else setBio({ available: false });
    return () => {
      alive = false;
    };
  }, [s.bio]);

  const succeed = useCallback(() => {
    setStatus('success');
    setMsg('');
    haptic('success');
    setLeaving(true);
    setTimeout(() => {
      // Animatsiya paytida ilova fonga o'tgan ("Darhol") — qulf qoladi, qaytganda yana so'raladi
      if (unlock()) return;
      setLeaving(false);
      setStatus('idle');
      putPin('');
    }, reducedMotion() ? 0 : 300);
  }, []);

  const askBio = useCallback(async () => {
    if (busy.current || !appActive()) return;
    busy.current = true;
    const r = await verifyBiometric();
    busy.current = false;
    if (r === 'ok') succeed();
    else if (r === 'lockout') setMsg("Barmoq izi vaqtincha bloklandi — PIN kodni kiriting");
    else if (r === 'fail') setMsg('Barmoq izi tanilmadi — PIN kodni kiriting');
  }, [succeed]);

  // Avtomatik so'rov: qulflanganda va qulf ekraniga fondan qaytganda (epoch o'zgaradi)
  useEffect(() => {
    if (!bioOn || leaving || lastPrompt.current === s.epoch) return undefined;
    const t = setTimeout(() => {
      if (!appActive()) return;
      lastPrompt.current = s.epoch;
      askBio();
    }, 350);
    return () => clearTimeout(t);
  }, [bioOn, s.epoch, leaving, askBio]);

  const submit = useCallback(
    async (value) => {
      busy.current = true;
      setStatus('busy');
      let r;
      try {
        r = await checkPin(value);
      } catch {
        r = { ok: false, left: MAX_FAILS };
      }
      busy.current = false;
      if (r.ok) return succeed();
      setStatus('error');
      setShakeKey((k) => k + 1);
      haptic('error');
      if (r.until) setMsg('');
      else setMsg(r.left <= 2 ? `Noto'g'ri PIN kod. Yana ${r.left} ta urinish qoldi` : "Noto'g'ri PIN kod");
      setTimeout(() => {
        putPin('');
        setStatus('idle');
      }, 520);
    },
    [succeed],
  );

  const onDigit = (d) => {
    const p = pinRef.current;
    if (busy.current || cooling || leaving || status !== 'idle' || p.length >= PIN_LENGTH) return;
    setMsg('');
    const next = p + d;
    putPin(next);
    if (next.length === PIN_LENGTH) {
      busy.current = true;
      setTimeout(() => submit(next), 90);
    }
  };
  const onDelete = () => {
    if (busy.current || status !== 'idle') return;
    putPin(pinRef.current.slice(0, -1));
  };
  usePinKeys(!forgot && !leaving, onDigit, onDelete);

  const doForget = async () => {
    setSigningOut(true);
    await forgetAndSignOut();
    clearCache();
    window.location.hash = '#/kirish';
    window.location.reload();
  };

  const firstName = user && user.name ? String(user.name).trim().split(/\s+/)[0] : '';
  let hint = 'PIN kodni kiriting';
  if (status === 'success') hint = 'Xush kelibsiz!';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ilova qulflangan"
      data-testid="lock-screen"
      className={cx('lk-screen fixed inset-0 z-[9000] flex select-none flex-col overflow-hidden text-ink', leaving && 'lk-leaving')}
    >
      <span className="lk-blob -left-16 top-24 h-56 w-56 bg-brand-400" aria-hidden="true" />
      <span className="lk-blob -right-24 bottom-48 h-56 w-56 bg-brand-500 [animation-delay:-4s]" aria-hidden="true" />

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col items-center px-6 pt-[6vh]">
        {/* Avatar / logo */}
        <div className="lk-rise relative">
          {user ? (
            <Avatar name={user.name} src={user.avatar_url} size="xl" className="ring-4 ring-surface shadow-lift" />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-[26px] bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
              <LeafIcon className="h-10 w-10" strokeWidth={2.4} />
            </span>
          )}
          <span className="lk-badge-pop absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-surface dark:bg-primary dark:text-brand-950">
            <LockIcon className="h-4 w-4" strokeWidth={2.4} />
          </span>
        </div>

        <h1 className="lk-rise-2 mt-5 text-center font-display text-2xl font-extrabold text-ink">{firstName ? `Salom, ${firstName}!` : 'Hasharchilar'}</h1>
        <p className="lk-rise-2 mt-1 text-center text-sm font-medium text-ink-3">{hint}</p>

        <div className="lk-rise-3 mt-8">
          <PinDots count={pin.length} status={status} shakeKey={shakeKey} />
        </div>

        <p
          aria-live="assertive"
          data-testid="lock-message"
          className={cx('mt-4 flex min-h-[40px] items-center text-center text-sm font-semibold', cooling ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}
        >
          {cooling ? `Juda ko'p xato urinish. ${formatWait(wait)} dan so'ng qayta urining` : msg}
        </p>

        <div className="mt-auto w-full pb-4 pt-2">
          <Keypad
            onDigit={onDigit}
            onDelete={onDelete}
            disabled={cooling || leaving}
            canDelete={pin.length > 0 && status === 'idle'}
            extra={
              bioOn ? (
                <button
                  type="button"
                  onClick={() => {
                    haptic('select');
                    askBio();
                  }}
                  aria-label={`${bio.label} bilan ochish`}
                  data-testid="bio-button"
                  className="lk-key lk-bio-ring grid h-[60px] w-[60px] place-items-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-line"
                >
                  <FingerprintIcon className="h-8 w-8" />
                </button>
              ) : null
            }
          />
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setForgot(true)}
              className="rounded-full px-4 py-2 text-sm font-bold text-brand transition hover:bg-brand-soft"
              data-testid="forgot-pin"
            >
              PIN kodni unutdingizmi?
            </button>
          </div>
        </div>
      </div>

      {forgot && (
        <div className="lk-fade absolute inset-0 z-10 flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center" onClick={() => !signingOut && setForgot(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lk-forgot-title"
            className="lk-sheet w-full max-w-md rounded-t-[28px] border border-line bg-surface p-6 pb-[calc(1.5rem+var(--sab,0px))] shadow-2xl sm:rounded-[28px] sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              <LockIcon className="h-6 w-6" />
            </span>
            <h2 id="lk-forgot-title" className="mt-4 text-xl font-extrabold text-ink">
              PIN kodni unutdingizmi?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
              Xavfsizlik uchun hisobingizdan chiqasiz va PIN kod o'chiriladi. Telefon yoki email va parol bilan qayta kiring — keyin yangi PIN
              o'rnatishingiz mumkin.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => setForgot(false)}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-surface-2 font-bold text-ink-2 transition active:scale-[.97] disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={doForget}
                data-testid="forgot-confirm"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-600 font-bold text-white transition active:scale-[.97] disabled:opacity-60"
              >
                {signingOut ? 'Chiqilmoqda…' : 'Chiqish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
