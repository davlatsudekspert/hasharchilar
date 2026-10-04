// Umumiy UI bo'laklari: tugma/input klasslari, badge, avatar, holat bloklari.
import { cx, initials } from '../lib/utils.js';
import { AlertIcon, LeafIcon, RefreshIcon } from './icons.jsx';

export const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15';

export const labelCls = 'mb-1.5 block text-sm font-semibold text-slate-700';

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';

export const btn = {
  // Asosiy CTA (amber)
  cta: `${btnBase} bg-amber-400 text-slate-900 shadow-sm shadow-amber-500/20 hover:bg-amber-300`,
  primary: `${btnBase} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700`,
  soft: `${btnBase} bg-emerald-50 text-emerald-800 hover:bg-emerald-100`,
  ghost: `${btnBase} bg-slate-100 text-slate-700 hover:bg-slate-200`,
  outline: `${btnBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`,
  danger: `${btnBase} bg-red-600 text-white hover:bg-red-700`,
  dangerSoft: `${btnBase} bg-red-50 text-red-700 hover:bg-red-100`,
};

/** Status badge: "Kutilmoqda" (amber) / "Bajarildi" (emerald). */
export function StatusBadge({ status, className }) {
  const done = status === 'COMPLETED';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
        done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', done ? 'bg-emerald-600' : 'bg-amber-500')} />
      {done ? 'Bajarildi' : 'Kutilmoqda'}
    </span>
  );
}

/** Ism bosh harfli dumaloq avatar. */
export function Avatar({ name, size = 'md', className }) {
  const s = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-sm', lg: 'h-14 w-14 text-xl' }[size];
  return (
    <span
      aria-hidden="true"
      className={cx('grid shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-emerald-800', s, className)}
    >
      {initials(name)}
    </span>
  );
}

/** Kerakli narsalar chiplari. */
export function ItemChips({ items = [], max, className }) {
  if (!items.length) return null;
  const shown = max ? items.slice(0, max) : items;
  const rest = items.length - shown.length;
  return (
    <ul className={cx('flex flex-wrap gap-1.5', className)}>
      {shown.map((it, i) => (
        <li key={`${it}-${i}`} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          {it}
        </li>
      ))}
      {rest > 0 && <li className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">+{rest}</li>}
    </ul>
  );
}

/** Bo'sh holat. */
export function EmptyState({ title, text, action, icon: Icon = LeafIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Xato holati + "Qayta urinish". */
export function ErrorState({ message, onRetry, compact }) {
  return (
    <div role="alert" className={cx('rounded-2xl bg-white text-center ring-1 ring-red-100', compact ? 'p-5' : 'px-6 py-10')}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
        <AlertIcon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-bold text-slate-900">Ma'lumotlarni yuklab bo'lmadi</p>
      {message && <p className="mt-1 text-sm text-slate-600">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={cx(btn.primary, 'mt-4 px-5 py-2.5 text-sm')}>
          <RefreshIcon className="h-4 w-4" /> Qayta urinish
        </button>
      )}
    </div>
  );
}

/** Yuklanish skeleti (kartalar uchun). */
export function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70" aria-hidden="true">
      <div className="flex gap-4">
        <div className="skeleton h-20 w-20 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2.5 py-1">
          <div className="skeleton h-3 w-20 rounded-full" />
          <div className="skeleton h-4 w-4/5 rounded-full" />
          <div className="skeleton h-3 w-3/5 rounded-full" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}

/** Aylanuvchi indikator. */
export function Spinner({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}
