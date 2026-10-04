// Kirish / Ro'yxatdan o'tish formasi (modal va #/kirish sahifasida bir xil).
import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { haptic } from '../lib/native.js';
import { cx, normalizePhone } from '../lib/utils.js';
import { PhoneIcon, ShieldIcon, UserIcon } from './icons.jsx';
import { btn, inputCls, labelCls, Spinner } from './ui.jsx';

export const AUTH_REASONS = {
  join: "Hasharga qo'shilish uchun tizimga kiring — bu bor-yo'g'i bir daqiqa.",
  create: "Hashar e'lon qilish uchun tizimga kiring.",
  comment: 'Izoh qoldirish uchun tizimga kiring.',
  profile: "Profilingizni ko'rish uchun tizimga kiring.",
  admin: 'Admin panelga kirish uchun administrator hisobi bilan kiring.',
};

export default function AuthForm({ reason, onSuccess, initialMode = 'login', busyChange }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);
  const phoneRef = useRef(null);

  const setBusy = (b) => {
    setBusyState(b);
    busyChange?.(b);
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setTimeout(() => (m === 'register' ? nameRef : phoneRef).current?.focus(), 0);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const p = normalizePhone(phone);
    if (mode === 'register' && name.trim().length < 2) return setError('Ismingizni kiriting (kamida 2 harf)');
    if (!p) return setError("Telefon raqamni to'liq kiriting: +998 XX XXX XX XX");
    if (password.length < 6) return setError("Parol kamida 6 ta belgidan iborat bo'lsin");
    setBusy(true);
    try {
      const user = mode === 'login' ? await login(p, password) : await register(name.trim(), p, password);
      haptic('success');
      setBusy(false);
      onSuccess?.(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const onPhone = (e) => {
    let v = e.target.value.replace(/[^\d+ ]/g, '');
    if (!v.startsWith('+')) v = `+${v.replace(/\+/g, '')}`;
    setPhone(v.slice(0, 17));
  };

  return (
    <div>
      {reason && AUTH_REASONS[reason] && (
        <p className="mb-4 flex gap-2.5 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand ring-1 ring-brand-line">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" /> {AUTH_REASONS[reason]}
        </p>
      )}

      <div role="tablist" aria-label="Kirish usuli" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
        {[
          ['login', 'Kirish'],
          ['register', "Ro'yxatdan o'tish"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => switchMode(id)}
            className={cx(
              'rounded-xl py-2.5 text-sm font-bold transition',
              mode === id ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === 'register' && (
          <div>
            <label htmlFor="a-name" className={labelCls}>
              Ismingiz
            </label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
              <input
                id="a-name"
                ref={nameRef}
                className={cx(inputCls, 'pl-12')}
                autoComplete="name"
                placeholder="Masalan: Aziz Karimov"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="a-phone" className={labelCls}>
            Telefon raqam
          </label>
          <div className="relative">
            <PhoneIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
            <input
              id="a-phone"
              ref={phoneRef}
              className={cx(inputCls, 'pl-12 tabular')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
              value={phone}
              onChange={onPhone}
            />
          </div>
        </div>
        <div>
          <label htmlFor="a-pass" className={labelCls}>
            Parol
          </label>
          <div className="relative">
            <input
              id="a-pass"
              className={cx(inputCls, 'pr-28')}
              type={showPass ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? 'Kamida 6 ta belgi' : 'Parolingiz'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-sm font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
              aria-label={showPass ? 'Parolni yashirish' : "Parolni ko'rsatish"}
            >
              {showPass ? 'Yashirish' : "Ko'rsatish"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={cx(btn.primary, 'h-13 w-full py-3.5 text-base')}>
          {busy && <Spinner />}
          {mode === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}
        </button>

        <p className="text-center text-sm text-ink-3">
          {mode === 'login' ? (
            <>
              Hisobingiz yo'qmi?{' '}
              <button type="button" onClick={() => switchMode('register')} className="font-bold text-brand hover:underline">
                Ro'yxatdan o'ting
              </button>
            </>
          ) : (
            <>
              Hisobingiz bormi?{' '}
              <button type="button" onClick={() => switchMode('login')} className="font-bold text-brand hover:underline">
                Kirish
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
