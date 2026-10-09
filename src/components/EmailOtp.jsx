// Email kodi (OTP) bilan ishlash uchun umumiy bo'laklar:
//   OtpInput        — 6 ta alohida raqam katagi (avtomatik o'tish, butun kodni joylash, raqamli klaviatura)
//   CodeStep        — "Kod yuborildi: email [O'zgartirish]" + kataklar + qayta yuborish (60 s) + xato
//   EmailVerifyFlow — tizimga kirgan foydalanuvchi emailini qo'shish/tasdiqlash (email → kod)
//   PasswordInput   — ko'rsatish/yashirish tugmali parol maydoni
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { haptic } from '../lib/native.js';
import { cx } from '../lib/utils.js';
import { MailIcon, RefreshIcon } from './icons.jsx';
import { btn, inputCls, labelCls, Spinner } from './ui.jsx';

export const OTP_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Mijoz tomonidagi email tekshiruvi (server baribir qayta tekshiradi). Xato matni yoki ''. */
export function emailError(raw) {
  const v = String(raw || '').trim();
  if (!v) return 'Email manzilini kiriting';
  if (v.length > 254 || !EMAIL_RE.test(v)) return "Email manzili noto'g'ri (masalan: ism@gmail.com)";
  return '';
}

/** Maydon ostidagi xato matni. */
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

/** Umumiy (forma darajasidagi) xato bloki. */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
      {children}
    </p>
  );
}

export const invalidCls = 'border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-500/60';

/** Parol maydoni: ko'rsatish / yashirish. */
export function PasswordInput({ id, label, value, onChange, error, autoComplete = 'new-password', placeholder, inputRef }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={show ? 'text' : 'password'}
          className={cx(inputCls, 'pr-28', error && invalidCls)}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-sm font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label={show ? `${label}: yashirish` : `${label}: ko'rsatish`}
          aria-pressed={show}
        >
          {show ? 'Yashirish' : "Ko'rsatish"}
        </button>
      </div>
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

/**
 * 6 ta raqam katagi. `value` — uzluksiz raqamlar satri (0..6 belgi).
 * Raqamlar keydown emas, input hodisasi orqali olinadi (Android klaviaturalari keydown'da 229 beradi);
 * bir nechta raqam kelsa (joylash, klaviatura taklifi, avtomatik to'ldirish) — kataklarga taqsimlanadi.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, autoFocus = true, label = 'Tasdiqlash kodi' }) {
  const refs = useRef([]);
  const baseId = useId();
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || '');
  // Eng so'nggi qiymat: fokus hodisasi qayta render'dan oldin keladi (eski closure qiymati bilan adashmasin)
  const valueRef = useRef(value);
  valueRef.current = value;

  const focusAt = (i) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.select();
    } catch {
      /* e'tiborsiz */
    }
  };

  useEffect(() => {
    if (!autoFocus || disabled) return undefined;
    // Foydalanuvchi allaqachon katakka bosgan / yoza boshlagan bo'lsa fokus tortib olinmaydi (birinchi raqam yo'qolardi)
    const t = setTimeout(() => {
      if (refs.current.includes(document.activeElement)) return;
      focusAt(Math.min(valueRef.current.length, OTP_LENGTH - 1));
    }, 60);
    return () => clearTimeout(t);
    // faqat birinchi ko'rinishda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tashqaridan tozalansa (masalan, noto'g'ri koddan keyin) — birinchi katakka
  const prevLen = useRef(value.length);
  useEffect(() => {
    if (value.length === 0 && prevLen.current > 0 && !disabled) focusAt(0);
    prevLen.current = value.length;
  }, [value, disabled]);

  const emit = (next, focusIdx) => {
    const prev = valueRef.current;
    const clean = next.replace(/\D/g, '').slice(0, OTP_LENGTH);
    valueRef.current = clean;
    onChange(clean);
    if (focusIdx != null) focusAt(focusIdx);
    if (clean.length === OTP_LENGTH && clean !== prev) {
      haptic('light');
      onComplete?.(clean);
    }
  };

  /** Bir nechta raqamni `i` dan boshlab joylaydi (to'liq kod bo'lsa — boshidan). */
  const spread = (i, raw) => {
    const cur = valueRef.current;
    const start = raw.length >= OTP_LENGTH ? 0 : Math.min(i, cur.length);
    const next = (cur.slice(0, start) + raw).slice(0, OTP_LENGTH);
    emit(next, Math.min(next.length, OTP_LENGTH - 1));
  };

  const handleChange = (i, e) => {
    const cur = valueRef.current;
    const old = cur[i] || '';
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      // Katak tozalandi — shu raqam olib tashlanadi
      if (i < cur.length) emit(cur.slice(0, i) + cur.slice(i + 1), i);
      else onChange(cur); // raqam bo'lmagan belgi — e'tiborsiz
      return;
    }
    const replacing = raw.length === 2 && old;
    if (raw.length > 1 && !replacing) return spread(i, raw);
    const d = replacing ? (raw[0] === old ? raw[1] : raw[0]) : raw;
    const pos = Math.min(i, cur.length);
    const next = cur.slice(0, pos) + d + cur.slice(pos + 1);
    emit(next, pos + 1 < OTP_LENGTH ? pos + 1 : pos);
  };

  const handleKeyDown = (i, e) => {
    const cur = valueRef.current;
    if (e.key === 'Backspace' || e.keyCode === 8) {
      if (!cur[i] && i > 0) {
        e.preventDefault();
        const at = Math.min(i, cur.length) - 1;
        emit(cur.slice(0, at) + cur.slice(at + 1), at);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(Math.min(i + 1, cur.length));
    }
  };

  const handlePaste = (i, e) => {
    const raw = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    e.preventDefault();
    if (raw) spread(i, raw);
  };

  return (
    <div role="group" aria-label={label} className="grid grid-cols-6 gap-2 sm:gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          id={`${baseId}-${i}`}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          enterKeyHint={i === OTP_LENGTH - 1 ? 'done' : 'next'}
          maxLength={OTP_LENGTH}
          value={d}
          disabled={disabled}
          aria-label={`${label}: ${i + 1}-raqam`}
          aria-invalid={invalid || undefined}
          data-otp-index={i}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => {
            // Bo'sh kataklarga sakrab bo'lmaydi — birinchi bo'sh katakka
            const len = valueRef.current.length;
            if (i > len) focusAt(len);
            else e.target.select();
          }}
          className={cx(
            'h-14 w-full min-w-0 rounded-2xl border bg-surface p-0 text-center font-display text-2xl font-extrabold text-ink tabular caret-brand-500 outline-none transition sm:h-16 sm:text-[28px]',
            'focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:focus:ring-brand-400/20 disabled:opacity-60',
            invalid ? invalidCls : d ? 'border-brand-300 bg-brand-soft dark:border-brand-400/40' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** "Kodni qayta yuborish" — teskari sanoq bilan. `onResend` yangi oraliqni (soniya) qaytaradi. */
function ResendButton({ seconds, onResend, onError }) {
  const [left, setLeft] = useState(seconds || 0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const click = async () => {
    setBusy(true);
    try {
      setLeft((await onResend()) || 60);
    } catch (err) {
      if (err.retryAfter) setLeft(err.retryAfter);
      onError?.(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy || left > 0}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-brand transition hover:bg-brand-soft disabled:pointer-events-none disabled:text-ink-3"
      aria-live="polite"
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <RefreshIcon className="h-4 w-4" />}
      {left > 0 ? (
        <span>
          Qayta yuborish <span className="tabular">{fmt(left)}</span>
        </span>
      ) : (
        'Kodni qayta yuborish'
      )}
    </button>
  );
}

/**
 * Kod kiritish bosqichi.
 * - onSubmit(code) — xato bo'lsa throw (err.silent — xato matni ko'rsatilmaydi, maydonlar o'zi ko'rsatadi);
 * - onResend() — yangi `resend_in` (soniya);
 * - children — qo'shimcha maydonlar (masalan, yangi parol). Bo'lmasa 6-raqamdan keyin avtomatik yuboriladi.
 */
export function CodeStep({ email, resendIn = 60, onResend, onSubmit, onChangeEmail, submitLabel = 'Tasdiqlash', children, autoSubmit }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const auto = autoSubmit ?? !children;

  const submit = async (value = code) => {
    if (busy) return;
    if (value.length !== OTP_LENGTH) {
      setError('Emailga kelgan 6 xonali kodni kiriting');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(value);
    } catch (err) {
      if (!err.silent) {
        setError(err.message);
        haptic('error');
        if (/^Kod/.test(err.message)) setCode('');
      }
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start gap-3 rounded-2xl bg-brand-soft px-4 py-3 ring-1 ring-brand-line">
        <MailIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-ink-2">6 xonali kodni quyidagi manzilga yubordik:</p>
          <p className="font-bold break-all text-ink" data-testid="otp-email">
            {email}
          </p>
          {onChangeEmail && (
            <button type="button" onClick={onChangeEmail} className="-ml-1 mt-1 rounded-lg px-1 py-0.5 text-sm font-bold text-brand hover:underline">
              O'zgartirish
            </button>
          )}
        </div>
      </div>

      <div>
        <p className={labelCls}>Tasdiqlash kodi</p>
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError('');
          }}
          onComplete={(v) => auto && submit(v)}
          disabled={busy}
          invalid={!!error && /^Kod|6 xonali/.test(error)}
        />
        <div className="mt-1 flex min-h-10 flex-wrap items-center justify-between gap-x-3">
          <p className="text-xs text-ink-3">Xat kelmadimi? «Spam» papkasini ham tekshiring.</p>
          <ResendButton
            seconds={resendIn}
            onResend={async () => {
              setError('');
              setCode('');
              return onResend();
            }}
            onError={(err) => setError(err.message)}
          />
        </div>
      </div>

      {children}

      <FormError>{error}</FormError>

      <button type="submit" disabled={busy} className={cx(btn.primary, 'h-13 w-full py-3.5 text-base')}>
        {busy && <Spinner />}
        {submitLabel}
      </button>
    </form>
  );
}

/**
 * Tizimga kirgan foydalanuvchi uchun: email kiritish → kod → tasdiqlash (POST /api/me/email/*).
 * onVerified(user) — server qaytargan yangilangan foydalanuvchi.
 */
export function EmailVerifyFlow({ initialEmail = '', onVerified, submitLabel = 'Kod yuborish', footer }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(null); // { email, resend_in }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const id = useId();

  const send = async (e) => {
    e?.preventDefault();
    const er = emailError(email);
    setError(er);
    if (er) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api.emailStart(email.trim());
      setSent({ email: r.email, resend_in: r.resend_in });
      setStep('code');
      haptic('light');
    } catch (err) {
      setError(err.message);
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code' && sent) {
    return (
      <CodeStep
        email={sent.email}
        resendIn={sent.resend_in}
        onChangeEmail={() => {
          setStep('email');
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        onResend={async () => (await api.emailStart(sent.email)).resend_in}
        onSubmit={async (code) => {
          const r = await api.emailVerify(code);
          haptic('success');
          onVerified?.(r.user);
        }}
        submitLabel="Emailni tasdiqlash"
      />
    );
  }

  return (
    <form onSubmit={send} noValidate className="space-y-4">
      <div>
        <label htmlFor={`${id}-email`} className={labelCls}>
          Email manzilingiz
        </label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
          <input
            id={`${id}-email`}
            ref={inputRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ism@gmail.com"
            className={cx(inputCls, 'pl-12', error && invalidCls)}
            value={email}
            maxLength={254}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
          />
        </div>
        <FieldError id={`${id}-err`}>{error}</FieldError>
      </div>
      <button type="submit" disabled={busy} className={cx(btn.primary, 'h-12 w-full')}>
        {busy ? <Spinner /> : <MailIcon className="h-5 w-5" />} {submitLabel}
      </button>
      {footer}
    </form>
  );
}
