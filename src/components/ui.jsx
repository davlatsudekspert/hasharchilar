// Umumiy UI bo'laklari: tugma/input klasslari, badge, avatar, holat bloklari, segment, progress.
import { useState } from 'react';
import { mediaUrl } from '../lib/config.js';
import { categoryOf } from '../lib/meta.js';
import { navigate } from '../lib/router.js';
import { cx, hashIndex, initials } from '../lib/utils.js';
import { AlertIcon, ArrowLeftIcon, CATEGORY_ICONS, CheckIcon, LeafIcon, RefreshIcon } from './icons.jsx';

export const inputCls =
  'w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-3 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:focus:ring-emerald-400/20';

export const labelCls = 'mb-1.5 block text-sm font-semibold text-ink-2';

const btnBase =
  'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-bold transition duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50';

export const btn = {
  // Asosiy CTA (amber) — faqat eng muhim harakatlar uchun
  cta: `${btnBase} bg-gradient-to-b from-amber-300 to-amber-400 text-slate-950 shadow-cta hover:from-amber-200 hover:to-amber-300`,
  primary: `${btnBase} bg-emerald-600 text-white shadow-sm shadow-emerald-900/10 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400`,
  soft: `${btnBase} bg-brand-soft text-brand hover:bg-emerald-100 dark:hover:bg-emerald-400/20`,
  ghost: `${btnBase} bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink`,
  outline: `${btnBase} border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink`,
  white: `${btnBase} bg-white text-emerald-900 shadow-sm hover:bg-emerald-50`,
  glass: `${btnBase} bg-white/10 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20`,
  danger: `${btnBase} bg-red-600 text-white hover:bg-red-700`,
  dangerSoft: `${btnBase} bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20`,
};

export const card = 'rounded-3xl border border-line bg-surface shadow-soft';

/** Status badge: "Kutilmoqda" (amber) / "Bajarildi" (emerald). */
export function StatusBadge({ status, className }) {
  const done = status === 'COMPLETED';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
        done
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300',
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', done ? 'bg-emerald-500' : 'bg-amber-500')} />
      {done ? 'Bajarildi' : 'Kutilmoqda'}
    </span>
  );
}

/** Kategoriya chipi. */
export function CategoryChip({ category, className, short }) {
  const c = categoryOf(category);
  const Icon = CATEGORY_ICONS[c.id];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', c.chip, className)}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.3} />
      {short ? c.short : c.label}
    </span>
  );
}

const AVATAR_BG = [
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-indigo-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-violet-400 to-purple-600',
  'from-lime-400 to-green-600',
  'from-cyan-400 to-blue-600',
];

/** Avatar: rasm bo'lsa rasm, aks holda ism bosh harflari rangli fonda. */
export function Avatar({ name, src, size = 'md', className, ring }) {
  const [broken, setBroken] = useState(false);
  const s = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-20 w-20 text-2xl',
    '2xl': 'h-28 w-28 text-4xl',
  }[size];
  const url = src && !broken ? mediaUrl(src) : null;
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br font-bold text-white',
        AVATAR_BG[hashIndex(name, AVATAR_BG.length)],
        ring && 'ring-2 ring-surface',
        s,
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Bir-birining ustiga chiqqan avatarlar. */
export function AvatarStack({ people = [], max = 5, total, size = 'sm' }) {
  const shown = people.slice(0, max);
  const rest = (total ?? people.length) - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <Avatar key={p.id} name={p.name} src={p.avatar_url} size={size} ring />
        ))}
      </div>
      {rest > 0 && (
        <span className="-ml-2 grid h-8 min-w-8 place-items-center rounded-full bg-surface-3 px-1.5 text-[11px] font-bold text-ink-2 ring-2 ring-surface">
          +{rest}
        </span>
      )}
    </div>
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
        <li key={`${it}-${i}`} className="rounded-xl bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 ring-1 ring-line">
          {it}
        </li>
      ))}
      {rest > 0 && <li className="rounded-xl bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-3">+{rest}</li>}
    </ul>
  );
}

/** Progress chizig'i. */
export function Progress({ value, max, className, tone = 'emerald' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cx('h-2 overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className={cx(
          'h-full rounded-full bg-gradient-to-r transition-[width] duration-700',
          tone === 'amber' ? 'from-amber-300 to-amber-500' : 'from-emerald-400 to-emerald-600',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Segment tanlagich (tablar). */
export function Segmented({ value, onChange, options, className, label, size = 'md' }) {
  return (
    <div role="tablist" aria-label={label} className={cx('inline-flex gap-1 rounded-2xl bg-surface-2 p-1 ring-1 ring-line', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-bold transition',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-2 text-[13px] sm:px-4 sm:text-sm',
              active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.icon && <o.icon className="h-4 w-4 max-sm:hidden" />}
            {o.label}
            {o.count != null && (
              <span className={cx('rounded-full px-1.5 text-[11px] tabular', active ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-ink-3')}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Filtr chipi. */
export function Chip({ active, onClick, children, icon: Icon, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition active:scale-[.97]',
        active
          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/20 dark:bg-emerald-500 dark:text-emerald-950'
          : 'bg-surface text-ink-2 ring-1 ring-line hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** Bo'sh holat. */
export function EmptyState({ title, text, action, icon: Icon = LeafIcon, className }) {
  return (
    <div className={cx('relative overflow-hidden rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center', className)}>
      <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl" />
      <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 ring-1 ring-emerald-200 dark:from-emerald-400/10 dark:to-emerald-400/5 dark:text-emerald-300 dark:ring-emerald-400/20">
        <Icon className="h-8 w-8" />
      </span>
      <h3 className="relative mt-4 text-lg font-extrabold text-ink">{title}</h3>
      {text && <p className="relative mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">{text}</p>}
      {action && <div className="relative mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Xato holati + "Qayta urinish". */
export function ErrorState({ message, onRetry, compact, title = "Ma'lumotlarni yuklab bo'lmadi" }) {
  return (
    <div role="alert" className={cx('rounded-3xl border border-red-200 bg-surface text-center dark:border-red-500/20', compact ? 'p-5' : 'px-6 py-10')}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
        <AlertIcon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-bold text-ink">{title}</p>
      {message && <p className="mt-1 text-sm text-ink-3">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={cx(btn.primary, 'mt-4 px-5 py-2.5 text-sm')}>
          <RefreshIcon className="h-4 w-4" /> Qayta urinish
        </button>
      )}
    </div>
  );
}

/** Kartalar skeleti. */
export function CardSkeleton({ horizontal }) {
  if (horizontal) {
    return (
      <div className="flex gap-4 rounded-3xl border border-line bg-surface p-3" aria-hidden="true">
        <div className="skeleton h-24 w-24 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2.5 py-1">
          <div className="skeleton h-3 w-20 rounded-full" />
          <div className="skeleton h-4 w-4/5 rounded-full" />
          <div className="skeleton h-3 w-3/5 rounded-full" />
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface" aria-hidden="true">
      <div className="skeleton aspect-[16/10]" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-5 w-4/5 rounded-full" />
        <div className="skeleton h-3 w-3/5 rounded-full" />
        <div className="flex items-center justify-between pt-2">
          <div className="skeleton h-8 w-24 rounded-full" />
          <div className="skeleton h-10 w-28 rounded-2xl" />
        </div>
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

/** Bo'lim sarlavhasi. */
export function SectionHeader({ eyebrow, title, text, action, className, center }) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-4', center && 'flex-col items-center text-center', className)}>
      <div className={cx('max-w-2xl', center && 'mx-auto')}>
        {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>}
        <h2 className="mt-1.5 text-2xl font-extrabold text-ink sm:text-3xl">{title}</h2>
        {text && <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{text}</p>}
      </div>
      {action}
    </div>
  );
}

/** Ichki sahifa sarlavhasi (orqaga tugmasi bilan). */
export function PageHeader({ title, subtitle, back, action, icon: Icon }) {
  return (
    <div className="flex items-start gap-3 pb-5 pt-5 sm:pt-8">
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === 'function' ? back() : window.history.length > 1 ? window.history.back() : navigate('/'))}
          aria-label="Orqaga"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-ink-2 shadow-sm transition hover:text-ink active:scale-95 lg:hidden"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      )}
      {Icon && !back && (
        <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line sm:grid">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Ichki havola (hash router). */
export function Link({ to, children, className, onClick, ...rest }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Kichik tasdiq belgisi. */
export const Tick = () => (
  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
    <CheckIcon className="h-3 w-3" strokeWidth={3.5} />
  </span>
);
