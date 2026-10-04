// Kirish / Ro'yxatdan o'tish / Parolni tiklash formasi (modal va #/kirish sahifasida bir xil).
// Email xizmati yoqilgan bo'lsa (GET /api/config): ro'yxat — email kodi bilan (2 bosqich), kirish — telefon
// yoki email, "Parolni unutdingizmi?" — email kodi + yangi parol. O'chiq bo'lsa — eski telefon+parol oqimi.
import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { haptic } from '../lib/native.js';
import { markEmailEnabled, useServerConfig } from '../lib/serverConfig.js';
import { cx, normalizePhone } from '../lib/utils.js';
import { CodeStep, emailError, FieldError, FormError, invalidCls, PasswordInput } from './EmailOtp.jsx';
import { ArrowLeftIcon, KeyIcon, MailIcon, PhoneIcon, ShieldIcon, UserIcon } from './icons.jsx';
import { btn, inputCls, labelCls, Spinner } from './ui.jsx';

export const AUTH_REASONS = {
  join: "Hasharga qo'shilish uchun tizimga kiring — bu bor-yo'g'i bir daqiqa.",
  create: "Hashar e'lon qilish uchun tizimga kiring.",
  comment: 'Izoh qoldirish uchun tizimga kiring.',
  profile: "Profilingizni ko'rish uchun tizimga kiring.",
  admin: 'Admin panelga kirish uchun administrator hisobi bilan kiring.',
};

/** Server xatosini maydonga bog'laydi (matndagi kalit so'z bo'yicha), topilmasa — umumiy xato. */
function fieldFromServer(err, fields) {
  const m = String(err.message || '');
  for (const [key, re] of fields) if (re.test(m)) return { [key]: m };
  return { form: m };
}

const REGISTER_FIELDS = [
  ['email', /email/i],
  ['phone', /telefon/i],
  ['password', /parol/i],
  ['name', /ism/i],
];

function StepHeader({ title, text, onBack, backLabel }) {
  return (
    <div className="mb-5">
      {onBack && (
        <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-bold text-brand hover:underline">
          <ArrowLeftIcon className="h-4 w-4" /> {backLabel}
        </button>
      )}
      <h3 className={cx('text-lg font-extrabold text-ink', onBack && 'mt-3')}>{title}</h3>
      {text && <p className="mt-1 text-sm text-ink-3">{text}</p>}
    </div>
  );
}

/** Sabab matni — faqat o'z kalitlari (?reason=__proto__ kabi havola Object.prototype'ni chiqarib, ilovani yiqitmasin). */
export function authReasonText(reason) {
  const t = typeof reason === 'string' && Object.prototype.hasOwnProperty.call(AUTH_REASONS, reason) ? AUTH_REASONS[reason] : null;
  return typeof t === 'string' ? t : null;
}

export default function AuthForm({ reason, onSuccess, initialMode = 'login', busyChange }) {
  const { login, register, signIn } = useAuth();
  const reasonText = authReasonText(reason);
  const { email_enabled: emailOn } = useServerConfig();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'forgot'
  const [step, setStep] = useState('form'); // 'form' | 'code'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [sent, setSent] = useState(null); // { email, resend_in }
  const [busy, setBusyState] = useState(false);
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const loginRef = useRef(null);
  const emailRef = useRef(null);
  const newPassRef = useRef(null);

  const setBusy = (b) => {
    setBusyState(b);
    busyChange?.(b);
  };
  const clearErr = (k) => errors[k] && setErrors((e) => ({ ...e, [k]: '', form: '' }));

  const switchMode = (m) => {
    setMode(m);
    setStep('form');
    setErrors({});
    setTimeout(() => {
      const target = m === 'register' ? nameRef : m === 'forgot' ? emailRef : emailOn ? loginRef : phoneRef;
      target.current?.focus();
    }, 0);
  };

  const finish = (user) => {
    haptic('success');
    setBusy(false);
    onSuccess?.(user);
  };

  const fail = (patch) => {
    setErrors(patch);
    haptic('error');
    setBusy(false);
  };

  // ---------- Kirish ----------
  const submitLogin = async () => {
    const er = {};
    let id = null;
    if (emailOn) {
      const v = loginId.trim();
      if (!v) er.login = 'Telefon raqam yoki emailni kiriting';
      else if (v.includes('@')) {
        if (emailError(v)) er.login = "Email manzili noto'g'ri (masalan: ism@gmail.com)";
        else id = v;
      } else {
        id = normalizePhone(v);
        if (!id) er.login = "Telefon raqamni to'liq kiriting: +998 XX XXX XX XX (yoki emailni)";
      }
    } else {
      id = normalizePhone(phone);
      if (!id) er.phone = "Telefon raqamni to'liq kiriting: +998 XX XXX XX XX";
    }
    if (!password) er.password = 'Parolni kiriting';
    if (Object.keys(er).length) return fail(er);
    setBusy(true);
    try {
      finish(await login(id, password));
    } catch (err) {
      fail({ form: err.message });
    }
  };

  // ---------- Ro'yxat ----------
  const validateRegister = () => {
    const er = {};
    if (name.trim().length < 2) er.name = 'Ismingizni kiriting (kamida 2 harf)';
    if (emailOn) {
      const e = emailError(email);
      if (e) er.email = e;
    }
    if (!normalizePhone(phone)) er.phone = "Telefon raqamni to'liq kiriting: +998 XX XXX XX XX";
    if (password.length < 6) er.password = "Parol kamida 6 ta belgidan iborat bo'lsin";
    return er;
  };

  const registerBody = () => ({ name: name.trim(), email: email.trim(), phone: normalizePhone(phone), password });

  const submitRegister = async () => {
    const er = validateRegister();
    if (Object.keys(er).length) {
      fail(er);
      const first = er.name ? nameRef : er.email ? emailRef : er.phone ? phoneRef : null;
      first?.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (emailOn) {
        const r = await api.registerStart(registerBody());
        setSent({ email: r.email, resend_in: r.resend_in });
        setStep('code');
        setErrors({});
        setBusy(false);
        haptic('light');
      } else {
        finish(await register(name.trim(), normalizePhone(phone), password));
      }
    } catch (err) {
      if (err.code === 'email_required') {
        // Server email talab qiladi (config hali kelmagan edi) — email maydoni paydo bo'ladi
        markEmailEnabled();
        fail({ email: 'Email manzilini kiriting', form: err.message });
        setTimeout(() => emailRef.current?.focus(), 30);
        return;
      }
      fail(fieldFromServer(err, REGISTER_FIELDS));
    }
  };

  // ---------- Parolni tiklash ----------
  const submitForgot = async () => {
    const er = emailError(email);
    if (er) {
      fail({ email: er });
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api.forgot(email.trim());
      setSent({ email: r.email, resend_in: r.resend_in });
      setStep('code');
      setErrors({});
      setBusy(false);
      haptic('light');
    } catch (err) {
      fail({ email: err.message });
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setErrors({});
    if (mode === 'login') submitLogin();
    else if (mode === 'register') submitRegister();
    else submitForgot();
  };

  const onPhone = (e) => {
    let v = e.target.value.replace(/[^\d+ ]/g, '');
    if (!v.startsWith('+')) v = `+${v.replace(/\+/g, '')}`;
    setPhone(v.slice(0, 17));
    clearErr('phone');
  };

  const backToForm = () => {
    setStep('form');
    setErrors({});
    setTimeout(() => emailRef.current?.focus(), 30);
  };

  // ---------- Kod bosqichi (ro'yxat / parolni tiklash) ----------
  if (step === 'code' && sent) {
    if (mode === 'register') {
      return (
        <div>
          <StepHeader title="Emailingizni tasdiqlang" text="Ro'yxatdan o'tishni yakunlash uchun emailga kelgan kodni kiriting." />
          <CodeStep
            email={sent.email}
            resendIn={sent.resend_in}
            onChangeEmail={backToForm}
            onResend={async () => (await api.registerStart(registerBody())).resend_in}
            onSubmit={async (code) => finish(signIn(await api.registerVerify(sent.email, code)))}
            submitLabel="Tasdiqlash va kirish"
          />
        </div>
      );
    }
    return (
      <div>
        <StepHeader title="Yangi parol" text="Emailga kelgan kodni va yangi parolni kiriting." onBack={backToForm} backLabel="Emailni o'zgartirish" />
        <CodeStep
          email={sent.email}
          resendIn={sent.resend_in}
          onResend={async () => (await api.forgot(sent.email)).resend_in}
          onSubmit={async (code) => {
            const er = {};
            if (newPass.length < 6) er.newPass = "Parol kamida 6 ta belgidan iborat bo'lsin";
            else if (newPass2 !== newPass) er.newPass2 = 'Parollar mos kelmadi';
            setErrors(er);
            if (Object.keys(er).length) {
              newPassRef.current?.focus();
              throw Object.assign(new Error(''), { silent: true });
            }
            finish(signIn(await api.reset(sent.email, code, newPass)));
          }}
          submitLabel="Parolni yangilash va kirish"
        >
          <PasswordInput
            id="a-newpass"
            label="Yangi parol"
            value={newPass}
            inputRef={newPassRef}
            onChange={(v) => {
              setNewPass(v);
              clearErr('newPass');
            }}
            placeholder="Kamida 6 ta belgi"
            error={errors.newPass}
          />
          <PasswordInput
            id="a-newpass2"
            label="Yangi parolni takrorlang"
            value={newPass2}
            onChange={(v) => {
              setNewPass2(v);
              clearErr('newPass2');
            }}
            error={errors.newPass2}
          />
        </CodeStep>
      </div>
    );
  }

  const emailField = (
    <div>
      <label htmlFor="a-email" className={labelCls}>
        Email {mode === 'register' && <span className="font-normal text-ink-3">(majburiy)</span>}
      </label>
      <div className="relative">
        <MailIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        <input
          id="a-email"
          ref={emailRef}
          className={cx(inputCls, 'pl-12', errors.email && invalidCls)}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          placeholder="ism@gmail.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearErr('email');
          }}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'a-email-err' : mode === 'register' ? 'a-email-hint' : undefined}
        />
      </div>
      {errors.email ? (
        <FieldError id="a-email-err">{errors.email}</FieldError>
      ) : (
        mode === 'register' && (
          <p id="a-email-hint" className="mt-1.5 text-xs text-ink-3">
            Unga 6 xonali tasdiqlash kodi yuboramiz.
          </p>
        )
      )}
    </div>
  );

  return (
    <div>
      {reasonText && mode !== 'forgot' && (
        <p className="mb-4 flex gap-2.5 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand ring-1 ring-brand-line">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" /> {reasonText}
        </p>
      )}

      {mode === 'forgot' ? (
        <StepHeader
          title="Parolni tiklash"
          text="Hisobingizga bog'langan emailni kiriting — unga 6 xonali kod yuboramiz."
          onBack={() => switchMode('login')}
          backLabel="Kirishga qaytish"
        />
      ) : (
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
      )}

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
                className={cx(inputCls, 'pl-12', errors.name && invalidCls)}
                autoComplete="name"
                placeholder="Masalan: Aziz Karimov"
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  clearErr('name');
                }}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'a-name-err' : undefined}
              />
            </div>
            <FieldError id="a-name-err">{errors.name}</FieldError>
          </div>
        )}

        {((mode === 'register' && emailOn) || mode === 'forgot') && emailField}

        {mode === 'login' && emailOn ? (
          <div>
            <label htmlFor="a-login" className={labelCls}>
              Telefon yoki email
            </label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
              <input
                id="a-login"
                ref={loginRef}
                className={cx(inputCls, 'pl-12', errors.login && invalidCls)}
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="+998 90 123 45 67"
                value={loginId}
                maxLength={254}
                onChange={(e) => {
                  setLoginId(e.target.value);
                  clearErr('login');
                }}
                aria-invalid={!!errors.login}
                aria-describedby={errors.login ? 'a-login-err' : undefined}
              />
            </div>
            <FieldError id="a-login-err">{errors.login}</FieldError>
          </div>
        ) : (
          mode !== 'forgot' && (
            <div>
              <label htmlFor="a-phone" className={labelCls}>
                Telefon raqam
              </label>
              <div className="relative">
                <PhoneIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
                <input
                  id="a-phone"
                  ref={phoneRef}
                  className={cx(inputCls, 'pl-12 tabular', errors.phone && invalidCls)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={onPhone}
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'a-phone-err' : undefined}
                />
              </div>
              <FieldError id="a-phone-err">{errors.phone}</FieldError>
            </div>
          )
        )}

        {mode !== 'forgot' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="a-pass" className="block text-sm font-semibold text-ink-2">
                Parol
              </label>
              {mode === 'login' && emailOn && (
                <button type="button" onClick={() => switchMode('forgot')} className="text-sm font-bold text-brand hover:underline">
                  Parolni unutdingizmi?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="a-pass"
                className={cx(inputCls, 'pr-28', errors.password && invalidCls)}
                type={showPass ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'Kamida 6 ta belgi' : 'Parolingiz'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearErr('password');
                }}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'a-pass-err' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-sm font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
                aria-label={showPass ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                aria-pressed={showPass}
              >
                {showPass ? 'Yashirish' : "Ko'rsatish"}
              </button>
            </div>
            <FieldError id="a-pass-err">{errors.password}</FieldError>
          </div>
        )}

        <FormError>{errors.form}</FormError>

        <button type="submit" disabled={busy} className={cx(btn.primary, 'h-13 w-full py-3.5 text-base')}>
          {busy ? <Spinner /> : mode === 'forgot' ? <KeyIcon className="h-5 w-5" /> : mode === 'register' && emailOn ? <MailIcon className="h-5 w-5" /> : null}
          {mode === 'login' ? 'Kirish' : mode === 'forgot' ? 'Kod yuborish' : emailOn ? 'Kod yuborish' : "Ro'yxatdan o'tish"}
        </button>

        {mode !== 'forgot' && (
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
        )}
      </form>
    </div>
  );
}
