// PIN kiritish bo'laklari: nuqtalar, raqamli klaviatura va jismoniy klaviatura tinglovchisi.
// Qulf ekrani va Sozlamalardagi PIN o'rnatish oynasi shularni ishlatadi.
import { useEffect, useRef } from 'react';
import { haptic } from '../lib/native.js';
import { cx } from '../lib/utils.js';
import { BackspaceIcon } from './icons.jsx';
import { PIN_LENGTH } from './lockStore.js';
import './lock.css';

/** status: 'idle' | 'error' | 'success' | 'busy'; shakeKey o'zgarsa — silkinadi. */
export function PinDots({ count, status = 'idle', shakeKey = 0, className }) {
  return (
    <div
      key={shakeKey}
      role="img"
      aria-label={`${count} / ${PIN_LENGTH} raqam kiritildi`}
      data-testid="pin-dots"
      data-count={count}
      className={cx('lk-dots flex items-center justify-center gap-5', shakeKey > 0 && status === 'error' && 'lk-shake', `is-${status}`, className)}
    >
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span key={i} className={cx('lk-dot', (i < count || status === 'error' || status === 'success') && 'is-on')} />
      ))}
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * 3x4 raqamli klaviatura. `extra` — chap pastki katak (masalan, barmoq izi tugmasi).
 * `compact` — oyna (sheet) ichida kichikroq tugmalar.
 */
export function Keypad({ onDigit, onDelete, disabled, canDelete = true, extra = null, compact = false }) {
  const size = compact ? 'h-[62px] w-[62px] text-[26px]' : 'h-[74px] w-[74px] text-[30px] max-[360px]:h-16 max-[360px]:w-16';
  const press = (fn) => (e) => {
    e.preventDefault();
    if (disabled) return;
    haptic('select');
    fn();
  };
  return (
    <div className={cx('mx-auto grid w-fit grid-cols-3', compact ? 'gap-x-6 gap-y-3' : 'gap-x-7 gap-y-4 max-[360px]:gap-x-5')} data-testid="keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k}
          disabled={disabled}
          onClick={press(() => onDigit(k))}
          className={cx(
            'lk-key grid place-items-center rounded-full bg-surface font-display font-semibold text-ink shadow-soft ring-1 ring-line disabled:opacity-40',
            size,
          )}
        >
          {k}
        </button>
      ))}
      <div className={cx('grid place-items-center', size)}>{extra}</div>
      <button
        type="button"
        aria-label="0"
        disabled={disabled}
        onClick={press(() => onDigit('0'))}
        className={cx('lk-key grid place-items-center rounded-full bg-surface font-display font-semibold text-ink shadow-soft ring-1 ring-line disabled:opacity-40', size)}
      >
        0
      </button>
      <button
        type="button"
        aria-label="O'chirish"
        disabled={!canDelete}
        onClick={press(onDelete)}
        className={cx('lk-key grid place-items-center rounded-full text-ink-2 transition disabled:opacity-0', size)}
      >
        <BackspaceIcon className={compact ? 'h-6 w-6' : 'h-7 w-7'} />
      </button>
    </div>
  );
}

/** Jismoniy klaviatura (raqamlar, Backspace) — faqat `active` bo'lganda. */
export function usePinKeys(active, onDigit, onDelete) {
  const ref = useRef({ onDigit, onDelete });
  ref.current = { onDigit, onDelete };
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        ref.current.onDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        ref.current.onDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/** "0:28" ko'rinishida qolgan vaqt. */
export function formatWait(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
