// Xatcho'p tugmasi: optimistik saqlash/olib tashlash, bosilganda "sakrash" animatsiyasi.
import { useState } from 'react';
import { useSaveToggle } from '../lib/saves.js';
import { cx } from '../lib/utils.js';
import { BookmarkIcon } from './icons.jsx';

/** variant: 'overlay' (rasm ustida, shisha doira) | 'plain' (karta ichida) | 'button' (matnli). */
export default function SaveButton({ hashar: h, variant = 'plain', className }) {
  const { toggle } = useSaveToggle();
  const [pop, setPop] = useState(0);
  const saved = !!h.saved;
  const label = saved ? 'Saqlanganlardan olish' : 'Saqlab qo\'yish';
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPop((n) => n + 1);
    toggle(h);
  };
  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        className={cx(
          'flex flex-col items-center gap-1.5 rounded-2xl py-3 text-xs font-bold ring-1 transition active:scale-95',
          saved ? 'bg-brand-soft text-brand ring-brand-line' : 'bg-surface-2 text-ink-2 ring-line hover:text-brand',
          className,
        )}
      >
        <BookmarkIcon key={pop} filled={saved} className={cx('h-5 w-5', pop > 0 && 'pop')} />
        {saved ? 'Saqlangan' : 'Saqlash'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      data-testid="save-button"
      className={cx(
        'relative z-[2] grid shrink-0 place-items-center rounded-full transition active:scale-90',
        variant === 'overlay'
          ? cx('h-9 w-9 shadow-sm backdrop-blur', saved ? 'bg-brand-600 text-white' : 'bg-white/95 text-slate-700 hover:text-brand-700 dark:bg-slate-950/75 dark:text-white')
          : cx('h-9 w-9', saved ? 'text-brand' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'),
        className,
      )}
    >
      <BookmarkIcon key={pop} filled={saved} className={cx('h-[18px] w-[18px]', pop > 0 && 'pop')} strokeWidth={2.2} />
    </button>
  );
}
