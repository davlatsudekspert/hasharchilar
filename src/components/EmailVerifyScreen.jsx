// "Emailni tasdiqlang" — to'liq ekranli bosqich (email → 6 xonali kod). Emaili tasdiqlanmagan foydalanuvchi
// kirganda, yozuvchi amalga urinsa yoki server 403 email_unverified qaytarsa ochiladi (src/lib/actions.jsx).
// "Keyinroq" / Android "orqaga" — yopiladi (ko'rish mumkin, yozuvchi amallar yana shu oynani ochadi).
// Pastdagi EmailBanner — ko'rish sahifalarida yopsa bo'ladigan eslatma.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/auth.jsx';
import { registerModal } from '../lib/modals.js';
import { storage } from '../lib/storage.js';
import { cx } from '../lib/utils.js';
import { EmailVerifyFlow } from './EmailOtp.jsx';
import { CheckCircleIcon, MailCheckIcon, MailIcon, XIcon } from './icons.jsx';
import Logo from './Logo.jsx';
import { useToast } from './Toast.jsx';
import { btn } from './ui.jsx';

const REASONS = {
  login: 'Hasharchilar endi email orqali ishlaydi. Hisobingizni himoyalash va hasharlarda qatnashish uchun emailingizni tasdiqlang.',
  join: "Hasharga qo'shilish uchun avval emailingizni tasdiqlang.",
  leave: 'Bu amal uchun avval emailingizni tasdiqlang.',
  create: "Hashar e'lon qilish uchun avval emailingizni tasdiqlang.",
  comment: 'Izoh yozish uchun avval emailingizni tasdiqlang.',
  manage: 'Hasharni boshqarish uchun avval emailingizni tasdiqlang.',
  action: 'Bu amal uchun avval emailingizni tasdiqlang.',
};

const PERKS = ["Hashar e'lon qilish, qo'shilish va izoh yozish", 'Parolni unutsangiz — email orqali tiklash', "Email boshqalarga ko'rinmaydi"];

export default function EmailVerifyScreen({ reason = 'action', onDone }) {
  const { user, setUser, refresh } = useAuth();
  const toast = useToast();
  const titleId = useId();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [closing, setClosing] = useState(false);

  // Android "orqaga" / Esc — "Keyinroq" bilan bir xil; body scroll bloklanadi
  useEffect(() => registerModal(() => doneRef.current(false)), []);

  const verified = (u) => {
    setUser(u);
    refresh().catch(() => {});
    toast('Email tasdiqlandi. Rahmat!');
    setClosing(true);
    doneRef.current(true);
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[3500] overflow-y-auto overscroll-contain bg-bg">
      <div className="safe-top sticky top-0 z-10 border-b border-line/70 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between gap-3 px-4">
          <Logo compact />
          <button type="button" onClick={() => doneRef.current(false)} disabled={closing} className={cx(btn.ghost, 'h-10 px-4 text-sm')}>
            Keyinroq
          </button>
        </div>
      </div>
      <div className="page-enter mx-auto max-w-md px-4 pb-12 pt-5 sm:pt-10">
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-soft sm:p-8">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line">
            <MailCheckIcon className="h-7 w-7" />
          </span>
          <h1 id={titleId} className="mt-4 text-2xl font-extrabold text-ink">
            Emailni tasdiqlang
          </h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-3">{REASONS[reason] || REASONS.action}</p>
          <ul className="mt-4 space-y-2">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm font-semibold text-ink-2">
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-500" /> {p}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <EmailVerifyFlow initialEmail={user?.email || ''} onVerified={verified} />
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-ink-3">
          Hozir emasmi?{' '}
          <button type="button" onClick={() => doneRef.current(false)} className="font-bold text-brand hover:underline">
            Keyinroq tasdiqlayman
          </button>
        </p>
      </div>
    </div>,
    document.body,
  );
}

const BANNER_KEY = 'hashar_email_banner_hidden';

/** Ko'rish sahifalaridagi eslatma: "Emailingizni tasdiqlang" — yopsa bo'ladi (shu sessiya davomida). */
export function EmailBanner({ onVerify }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.sessionStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return storage.get(BANNER_KEY) === '1';
    }
  });
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      window.sessionStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* e'tiborsiz */
    }
  };
  return (
    <div role="region" aria-label="Emailni tasdiqlash eslatmasi" className="border-b border-brand-line bg-brand-soft" data-testid="email-banner">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:px-6">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-brand ring-1 ring-brand-line">
          <MailIcon className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-snug text-ink">
          <b>Emailingizni tasdiqlang</b>
          <span className="text-ink-2 max-sm:hidden"> — hashar e'lon qilish, qo'shilish va izoh yozish uchun kerak.</span>
        </p>
        <button type="button" onClick={onVerify} className={cx(btn.primary, 'h-9 shrink-0 px-3.5 text-sm')}>
          Tasdiqlash
        </button>
        <button
          type="button"
          onClick={hide}
          aria-label="Eslatmani yopish"
          className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-surface hover:text-ink"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
