// Kirish / Ro'yxatdan o'tish oynasi. Muvaffaqiyatdan keyin kutilayotgan amal davom etadi.
import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { cx, normalizePhone } from '../lib/utils.js';
import Modal from './Modal.jsx';
import { btn, inputCls, labelCls, Spinner } from './ui.jsx';

const REASONS = {
  join: "Hasharga qo'shilish uchun tizimga kiring — bu bor-yo'g'i bir daqiqa.",
  create: "Hashar e'lon qilish uchun tizimga kiring.",
  admin: 'Admin panelga kirish uchun administrator hisobi bilan kiring.',
};

export default function AuthModal({ reason, onClose, onSuccess }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);
  const phoneRef = useRef(null);

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
      onSuccess(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // Telefon maydoni: faqat raqamlar va "+" qoldiriladi, +998 prefiksi saqlanadi
  const onPhone = (e) => {
    let v = e.target.value.replace(/[^\d+ ]/g, '');
    if (!v.startsWith('+')) v = `+${v.replace(/\+/g, '')}`;
    setPhone(v.slice(0, 17));
  };

  return (
    <Modal title={mode === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"} onClose={busy ? () => {} : onClose} size="sm">
      {reason && REASONS[reason] && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-emerald-100">
          {REASONS[reason]}
        </p>
      )}

      <div role="tablist" aria-label="Kirish usuli" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
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
              'rounded-lg py-2 text-sm font-bold transition',
              mode === id ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
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
            <input
              id="a-name"
              ref={nameRef}
              className={inputCls}
              autoComplete="name"
              placeholder="Masalan: Aziz Karimov"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="a-phone" className={labelCls}>
            Telefon raqam
          </label>
          <input
            id="a-phone"
            ref={phoneRef}
            className={inputCls}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998 90 123 45 67"
            value={phone}
            onChange={onPhone}
          />
        </div>
        <div>
          <label htmlFor="a-pass" className={labelCls}>
            Parol
          </label>
          <div className="relative">
            <input
              id="a-pass"
              className={cx(inputCls, 'pr-24')}
              type={showPass ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? 'Kamida 6 ta belgi' : 'Parolingiz'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute inset-y-1.5 right-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              aria-label={showPass ? 'Parolni yashirish' : "Parolni ko'rsatish"}
            >
              {showPass ? 'Yashirish' : "Ko'rsatish"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={cx(btn.primary, 'h-12 w-full text-base')}>
          {busy && <Spinner />}
          {mode === 'login' ? 'Kirish' : "Ro'yxatdan o'tish"}
        </button>

        <p className="text-center text-sm text-slate-600">
          {mode === 'login' ? (
            <>
              Hisobingiz yo'qmi?{' '}
              <button type="button" onClick={() => switchMode('register')} className="font-bold text-emerald-700 hover:underline">
                Ro'yxatdan o'ting
              </button>
            </>
          ) : (
            <>
              Hisobingiz bormi?{' '}
              <button type="button" onClick={() => switchMode('login')} className="font-bold text-emerald-700 hover:underline">
                Kirish
              </button>
            </>
          )}
        </p>
      </form>
    </Modal>
  );
}
