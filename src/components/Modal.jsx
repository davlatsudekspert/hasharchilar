// Umumiy modal: mobilda pastdan chiquvchi sheet, desktopda markazda.
// Esc / Android "orqaga" / fon bosilsa yopiladi; birinchi maydonga fokus; body scroll bloklanadi.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { registerModal } from '../lib/modals.js';
import { cx } from '../lib/utils.js';
import { XIcon } from './icons.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, subtitle, onClose, children, footer, size = 'md', bodyClassName, headerExtra, autoFocus = true }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const downOnBackdrop = useRef(false);

  useEffect(() => registerModal(() => closeRef.current()), []);

  useEffect(() => {
    const prev = document.activeElement;
    const el = dialogRef.current;
    const field = autoFocus && el && el.querySelector('input:not([type=hidden]):not([type=file]):not([disabled]), textarea, select');
    const t = setTimeout(() => {
      if (el && el.contains(document.activeElement) && document.activeElement !== el) return;
      (field || el)?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [autoFocus]);

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
      className="modal-backdrop fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/60 backdrop-blur-[3px] sm:items-center sm:p-6"
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
          'modal-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-line bg-surface text-ink shadow-2xl outline-none sm:max-h-[88vh] sm:rounded-[28px]',
          width,
        )}
      >
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-surface-3" />
        </div>
        <div className="flex items-start gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-extrabold leading-tight text-ink sm:text-2xl">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="-mr-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6', !footer && 'safe-bottom', bodyClassName)}>
          {children}
        </div>
        {footer && <div className="safe-bottom border-t border-line bg-surface px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
