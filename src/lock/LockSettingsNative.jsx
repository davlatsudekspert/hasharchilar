// APK: "Ilova qulfi" sozlamalari — PIN o'rnatish/o'zgartirish/o'chirish, barmoq izi, avtomatik qulflash vaqti.
import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { KeyIcon } from '../components/icons.jsx';
import { Segmented } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { haptic, onAppResume } from '../lib/native.js';
import { cx } from '../lib/utils.js';
import { biometricInfo, verifyBiometric } from './biometric.js';
import { FingerprintIcon, LockIcon, ShieldCheckIcon, TimerIcon } from './icons.jsx';
import { checkPin, clearLock, loadLock, lockNow, PIN_LENGTH, setBiometric, setLockTimeout, setPin, useLock, weakPin } from './lockStore.js';
import { formatWait, Keypad, PinDots, usePinKeys } from './PinPad.jsx';

const TIMEOUT_OPTIONS = [
  { value: 0, label: 'Darhol' },
  { value: 30, label: '30 s' },
  { value: 60, label: '1 daq' },
  { value: 300, label: '5 daq' },
];

function Switch({ on, onClick, label, disabled, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        haptic('select');
        onClick();
      }}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40', on ? 'bg-brand-600 dark:bg-primary' : 'bg-surface-3 ring-1 ring-line')}
    >
      <span
        className={cx(
          'absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 [transition-timing-function:var(--ease-spring)]',
          on ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export default function LockSettingsNative() {
  const { user } = useAuth();
  const toast = useToast();
  const s = useLock();
  const [bio, setBio] = useState(null);
  const [flow, setFlow] = useState(null); // 'setup' | 'change' | 'disable'

  useEffect(() => {
    loadLock();
    let alive = true;
    const check = () => biometricInfo().then((r) => alive && setBio(r));
    check();
    // Telefon sozlamalarida barmoq izi qo'shib qaytsa — qayta tekshiramiz
    const off = onAppResume(check);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const toggleBio = async () => {
    if (s.bio) {
      await setBiometric(false);
      toast(`${bio ? bio.label : 'Barmoq izi'} bilan ochish o'chirildi`, 'info');
      return;
    }
    const r = await verifyBiometric({ subtitle: 'Barmoq izi bilan ochishni yoqish', description: "Tasdiqlash uchun barmoq izingizni qo'ying" });
    if (r === 'ok') {
      await setBiometric(true);
      haptic('success');
      toast(`${bio.label} bilan ochish yoqildi`);
    } else if (r === 'lockout') toast("Barmoq izi vaqtincha bloklangan. Keyinroq urinib ko'ring", 'error');
    else if (r === 'fail') toast("Barmoq izini tasdiqlab bo'lmadi", 'error');
  };

  if (!s.loaded) return <div className="skeleton h-[104px] rounded-3xl" aria-hidden="true" />;

  const bioText = !bio
    ? 'Tekshirilmoqda…'
    : bio.available
      ? "Qulf ekranida avtomatik so'raladi"
      : bio.reason === 'not_enrolled'
        ? "Avval telefon sozlamalarida barmoq izini qo'shing"
        : "Qurilmada barmoq izi skaneri yo'q";

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft" data-testid="lock-settings">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 transition',
            s.enabled ? 'bg-brand-600 text-white ring-brand-600 dark:bg-primary dark:text-brand-950' : 'bg-surface-2 text-brand ring-line',
          )}
        >
          <ShieldCheckIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-ink">Ilova qulfi</h3>
          <p className="text-sm text-ink-3">
            {s.enabled ? 'Ilova PIN kod bilan himoyalangan.' : "Ilovani ochishda 4 xonali PIN kod so'raladi — telefon boshqa qo'lga tushsa ham hisobingiz xavfsiz."}
          </p>
        </div>
        <Switch on={s.enabled} label="PIN kod bilan qulflash" testId="lock-switch" onClick={() => setFlow(s.enabled ? 'disable' : 'setup')} />
      </div>

      {s.enabled && (
        <div className="fade-up mt-4 space-y-4 border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand ring-1 ring-line">
              <FingerprintIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">{bio && bio.available ? `${bio.label} bilan ochish` : 'Barmoq izi bilan ochish'}</p>
              <p className="text-sm text-ink-3">{bioText}</p>
            </div>
            <Switch on={!!(s.bio && bio && bio.available)} disabled={!bio || !bio.available} label="Barmoq izi bilan ochish" testId="bio-switch" onClick={toggleBio} />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand ring-1 ring-line">
                <TimerIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">Avtomatik qulflash</p>
                <p className="text-sm text-ink-3">Ilova fonda shuncha turgach, qaytishda PIN so'raladi</p>
              </div>
            </div>
            <Segmented
              label="Avtomatik qulflash vaqti"
              value={s.timeout}
              onChange={(v) => {
                haptic('select');
                setLockTimeout(v);
              }}
              options={TIMEOUT_OPTIONS}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFlow('change')}
              data-testid="pin-change"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm font-bold text-ink-2 ring-1 ring-line transition hover:bg-surface-3 active:scale-[.97]"
            >
              <KeyIcon className="h-4 w-4" /> PIN ni o'zgartirish
            </button>
            <button
              type="button"
              onClick={() => {
                haptic('medium');
                lockNow();
              }}
              data-testid="lock-now"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-sm font-bold text-brand ring-1 ring-brand-line transition hover:bg-brand-100 active:scale-[.97] dark:hover:bg-brand-400/20"
            >
              <LockIcon className="h-4 w-4" /> Hozir qulflash
            </button>
          </div>
        </div>
      )}

      {flow && (
        <PinFlow
          mode={flow}
          uid={user ? user.id : null}
          bio={bio}
          onClose={() => setFlow(null)}
          onDone={(text) => {
            setFlow(null);
            if (text) toast(text);
          }}
        />
      )}
    </section>
  );
}

const STEP_TEXT = {
  old: ['Joriy PIN kod', 'Davom etish uchun joriy PIN kodni kiriting'],
  new: ['Yangi PIN kod', "4 xonali PIN kod o'ylab toping"],
  confirm: ['PIN kodni takrorlang', 'Xatolik bo\'lmasligi uchun yana bir marta kiriting'],
  bio: ['Barmoq izi', 'Ilovani tezroq ochish uchun'],
};

/** PIN o'rnatish (yangi → takror → barmoq izi taklifi), o'zgartirish (joriy → yangi → takror), o'chirish (joriy). */
function PinFlow({ mode, uid, bio, onClose, onDone }) {
  const s = useLock();
  const [step, setStep] = useState(mode === 'setup' ? 'new' : 'old');
  const [pin, setPinState] = useState('');
  const [status, setStatus] = useState('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const pinRef = useRef('');
  const first = useRef('');
  const busy = useRef(false);

  const wait = step === 'old' ? Math.max(0, s.until - now) : 0;
  const cooling = wait > 0;
  useEffect(() => {
    if (!cooling) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooling]);
  useEffect(() => setNow(Date.now()), [s.until]);

  const put = (v) => {
    pinRef.current = v;
    setPinState(v);
  };
  const fail = useCallback((text, { reset } = {}) => {
    setStatus('error');
    setShakeKey((k) => k + 1);
    setMsg(text);
    haptic('error');
    setTimeout(() => {
      put('');
      setStatus('idle');
      if (reset) setStep(reset);
      busy.current = false;
    }, 520);
  }, []);
  const next = (st) => {
    put('');
    setMsg('');
    setStatus('idle');
    setStep(st);
    busy.current = false;
  };

  const complete = async (value) => {
    if (step === 'old') {
      setStatus('busy');
      const r = await checkPin(value).catch(() => ({ ok: false, left: 0 }));
      if (!r.ok) return fail(r.until ? '' : r.left <= 2 ? `Noto'g'ri PIN kod. Yana ${r.left} ta urinish qoldi` : "Noto'g'ri PIN kod");
      haptic('success');
      if (mode === 'disable') {
        await clearLock();
        return onDone("Ilova qulfi o'chirildi");
      }
      return next('new');
    }
    if (step === 'new') {
      if (weakPin(value)) return fail("Bu PIN juda oson taxmin qilinadi. Boshqasini tanlang");
      first.current = value;
      return next('confirm');
    }
    if (step === 'confirm') {
      if (value !== first.current) {
        first.current = '';
        return fail('PIN kodlar mos kelmadi. Qaytadan kiriting', { reset: 'new' });
      }
      setStatus('busy');
      try {
        await setPin(value, uid);
      } catch {
        return fail("PIN kodni saqlab bo'lmadi. Qayta urinib ko'ring", { reset: 'new' });
      }
      setStatus('success');
      haptic('success');
      if (mode === 'setup' && bio && bio.available && !s.bio) return setTimeout(() => next('bio'), 420);
      return setTimeout(() => onDone(mode === 'setup' ? "PIN kod o'rnatildi. Ilova endi qulflanadi" : "PIN kod o'zgartirildi"), 380);
    }
    return undefined;
  };

  const onDigit = (d) => {
    const p = pinRef.current;
    if (busy.current || cooling || status !== 'idle' || step === 'bio' || p.length >= PIN_LENGTH) return;
    setMsg('');
    const v = p + d;
    put(v);
    if (v.length === PIN_LENGTH) {
      busy.current = true;
      setTimeout(() => complete(v), 110);
    }
  };
  const onDelete = () => {
    if (busy.current || status !== 'idle') return;
    put(pinRef.current.slice(0, -1));
  };
  usePinKeys(step !== 'bio', onDigit, onDelete);

  const enableBio = async () => {
    const r = await verifyBiometric({ subtitle: 'Barmoq izi bilan ochishni yoqish', description: "Tasdiqlash uchun barmoq izingizni qo'ying" });
    if (r === 'ok') {
      await setBiometric(true);
      haptic('success');
      onDone(`PIN kod va ${bio.label.toLowerCase()} yoqildi`);
    } else if (r !== 'cancel') setMsg("Barmoq izini tasdiqlab bo'lmadi");
  };

  const [title, subtitle] = STEP_TEXT[step];
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} size="sm" autoFocus={false}>
      {step === 'bio' ? (
        <div key="bio" className="lk-rise flex flex-col items-center pb-2 pt-2 text-center">
          <span className="lk-bio-ring grid h-24 w-24 place-items-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-line">
            <FingerprintIcon className="h-12 w-12" />
          </span>
          <p className="mt-5 text-lg font-extrabold text-ink">{bio.label} bilan ochasizmi?</p>
          <p className="mt-1 max-w-xs text-sm text-ink-3">Har safar PIN kiritish shart emas — qulf ekranida barmoq izingiz avtomatik so'raladi. PIN zaxira bo'lib qoladi.</p>
          {msg && <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{msg}</p>}
          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onDone("PIN kod o'rnatildi. Ilova endi qulflanadi")}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-surface-2 font-bold text-ink-2 transition active:scale-[.97]"
            >
              Keyinroq
            </button>
            <button
              type="button"
              onClick={enableBio}
              data-testid="bio-enable"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-600 font-bold text-white transition active:scale-[.97] dark:bg-primary dark:text-brand-950"
            >
              <FingerprintIcon className="h-5 w-5" /> Yoqish
            </button>
          </div>
        </div>
      ) : (
        <div key={step} className="lk-rise flex flex-col items-center pb-2" data-testid={`pin-step-${step}`}>
          <PinDots count={pin.length} status={status} shakeKey={shakeKey} className="mt-2" />
          <p aria-live="assertive" className={cx('mt-3 flex min-h-[40px] items-center text-center text-sm font-semibold', cooling ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
            {cooling ? `Juda ko'p xato urinish. ${formatWait(wait)} dan so'ng qayta urining` : msg}
          </p>
          <div className="mt-1">
            <Keypad compact onDigit={onDigit} onDelete={onDelete} disabled={cooling || status === 'success'} canDelete={pin.length > 0 && status === 'idle'} />
          </div>
        </div>
      )}
    </Modal>
  );
}
