// Umumiy modal: mobilda pastdan chiquvchi sheet, desktopda markazda.
// Esc / Android "orqaga" / fon bosilsa yopiladi; birinchi maydonga fokus; body scroll bloklanadi.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { registerModal } from '../lib/backButton.js';
import { cx } from '../lib/utils.js';
import { XIcon } from './icons.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, subtitle, onClose, children, footer, size = 'md', bodyClassName, headerExtra }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const downOnBackdrop = useRef(false);

  // Modal stekiga qo'shilish (Esc + orqaga tugmasi + scroll lock)
  useEffect(() => registerModal(() => closeRef.current()), []);

  // Fokus: birinchi input bo'lsa unga, aks holda dialogning o'ziga; yopilganda qaytariladi
  useEffect(() => {
    const prev = document.activeElement;
    const el = dialogRef.current;
    const field = el && el.querySelector('input:not([type=hidden]):not([disabled]), textarea, select');
    const t = setTimeout(() => {
      // Foydalanuvchi allaqachon biror maydonni tanlagan bo'lsa, fokusni tortib olmaymiz
      if (el && el.contains(document.activeElement) && document.activeElement !== el) return;
      (field || el)?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);

  // Tab tugmasi modal ichida aylanadi (focus trap)
  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const nodes = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cx(
          'modal-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:max-h-[88vh] sm:rounded-3xl',
          width,
        )}
      >
        {/* Mobil "tutqich" */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-extrabold leading-tight text-slate-900 sm:text-2xl">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="-mr-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6', !footer && 'safe-bottom', bodyClassName)}>
          {children}
        </div>
        {footer && <div className="safe-bottom border-t border-slate-100 bg-white px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
