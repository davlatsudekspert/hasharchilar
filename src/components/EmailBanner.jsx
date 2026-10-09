// "Emailingizni tasdiqlang" eslatmasi (ko'rish sahifalarida). Alohida modul: ilova qobig'i to'liq email oqimini
// (EmailVerifyScreen + EmailOtp) asosiy bundle'ga tortmasin.
import { useState } from 'react';
import { storage } from '../lib/storage.js';
import { cx } from '../lib/utils.js';
import { MailIcon, XIcon } from './icons.jsx';
import { btn } from './ui.jsx';

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
