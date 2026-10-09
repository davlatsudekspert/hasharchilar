// Hashar kartalari: katta (rasmli) va ixcham (gorizontal) ko'rinish, "Qatnashish" tugmasi, eskiz.
import { forwardRef, memo } from 'react';
import { useActions } from '../lib/actions.jsx';
import { mediaUrl } from '../lib/config.js';
import { categoryOf } from '../lib/meta.js';
import { navigate } from '../lib/router.js';
import { useServerConfig } from '../lib/serverConfig.js';
import { countdown, cx, dateBadge, formatDateTime, formatKm, isOverdue, statusOf } from '../lib/utils.js';
import { CATEGORY_ICONS, CheckIcon, ClockIcon, HourglassIcon, MessageIcon, PinIcon, UsersIcon, WalletIcon } from './icons.jsx';
import SaveButton from './SaveButton.jsx';
import { btn, CategoryChip, Progress, Spinner, StatusBadge } from './ui.jsx';

/** Egasining to'lanmagan hashari (ommaga ko'rinmaydi). */
export const isUnpaid = (h) => !!h && h.payment_status === 'unpaid';

/** "To'lov kutilmoqda" belgisi (faqat egasiga ko'rinadi). */
export function UnpaidBadge({ className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-400/15 dark:text-amber-300', className)}>
      <HourglassIcon className="h-3.5 w-3.5" /> To'lov kutilmoqda
    </span>
  );
}

/** Rasm bo'lmasa — kategoriya rangidagi chiroyli fon. */
export function Thumb({ hashar, className, iconClass = 'h-10 w-10', prefer = 'after' }) {
  const url = mediaUrl(prefer === 'after' ? hashar.after_url || hashar.before_url : hashar.before_url || hashar.after_url);
  const c = categoryOf(hashar.category);
  const Icon = CATEGORY_ICONS[c.id];
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={640}
        height={400}
        loading="lazy"
        decoding="async"
        onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
        className={cx('img-fade bg-surface-2 object-cover', className)}
      />
    );
  }
  return (
    <div className={cx('relative grid place-items-center overflow-hidden bg-gradient-to-br text-white', c.tint, className)} aria-hidden="true">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" />
      <div className="absolute -bottom-8 -left-4 h-28 w-28 rounded-full bg-black/10" />
      <Icon className={cx('relative opacity-90', iconClass)} strokeWidth={1.6} />
    </div>
  );
}

/** Egasining to'lanmagan hashari: "To'lash" (narx 0 bo'lsa — "E'lon qilish", to'lov sahifasida bepul e'lon qilinadi). */
function PayButton({ hashar: h, className }) {
  const { hashar_fee: fee, loaded } = useServerConfig();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/tolov/${h.id}`);
      }}
      className={className}
    >
      <WalletIcon className="h-4 w-4" /> {loaded && !(fee > 0) ? "E'lon qilish" : "To'lash"}
    </button>
  );
}

/** Qatnashish tugmasi (holatga qarab). */
export function JoinButton({ hashar: h, size = 'md', className, onJoined }) {
  const { join, busyId } = useActions();
  const busy = busyId === h.id;
  const sz = size === 'lg' ? 'h-12 px-5 text-base' : size === 'sm' ? 'h-9 px-3.5 text-sm' : 'h-10 px-4 text-sm';
  const full = h.max_volunteers && h.volunteer_count >= h.max_volunteers;

  if (h.status === 'COMPLETED') {
    return (
      <span className={cx('inline-flex items-center justify-center gap-1.5 rounded-2xl bg-brand-soft font-bold text-brand', sz, className)}>
        <CheckIcon className="h-4 w-4" strokeWidth={3} /> Yakunlangan
      </span>
    );
  }
  if (h.is_owner && isUnpaid(h)) return <PayButton hashar={h} className={cx(btn.cta, sz, className)} />;
  if (h.is_owner) {
    return <span className={cx('inline-flex items-center justify-center rounded-2xl bg-surface-2 font-bold text-ink-2 ring-1 ring-line', sz, className)}>Sizning hasharingiz</span>;
  }
  if (isOverdue(h)) {
    return (
      <span className={cx('inline-flex items-center justify-center gap-1.5 rounded-2xl bg-surface-2 font-bold text-ink-3 ring-1 ring-line', sz, className)}>
        <ClockIcon className="h-4 w-4" /> Bo'lib o'tgan
      </span>
    );
  }
  if (h.joined) {
    return (
      <span className={cx('inline-flex items-center justify-center gap-1.5 rounded-2xl bg-brand-600 font-bold text-white dark:bg-primary dark:text-brand-950', sz, className)}>
        <CheckIcon className="h-4 w-4" strokeWidth={3} /> Qatnashasiz
      </span>
    );
  }
  if (full) {
    return <span className={cx('inline-flex items-center justify-center rounded-2xl bg-surface-2 font-bold text-ink-3 ring-1 ring-line', sz, className)}>Joy qolmadi</span>;
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        const r = await join(h.id);
        if (r) onJoined?.(r);
      }}
      className={cx(btn.cta, sz, className)}
      aria-label={`Qatnashish: ${h.title}`}
    >
      {busy ? <Spinner /> : <UsersIcon className="h-4 w-4" strokeWidth={2.4} />} Qatnashish
    </button>
  );
}

const open = (h) => navigate(`/hashar/${h.id}`);

/** Katta karta (setka uchun). */
const HasharCard = forwardRef(function HasharCard({ hashar: h, distance, selected, className, onHover }, ref) {
  const done = h.status === 'COMPLETED';
  const d = dateBadge(h.date_time);
  const left = !done ? countdown(h.date_time) : null;
  const dist = distance ?? h.distance_km;
  return (
    <article
      ref={ref}
      onMouseEnter={onHover ? () => onHover(h.id) : undefined}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-3xl border bg-surface shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-lift',
        selected ? 'border-brand-500 ring-4 ring-brand-500/15' : 'border-line',
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Thumb hashar={h} className="h-full w-full transition duration-500 group-hover:scale-[1.04]" iconClass="h-14 w-14" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <CategoryChip category={h.category} short className="bg-white/95 text-slate-800 shadow-sm dark:bg-slate-950/80 dark:text-white" />
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {isUnpaid(h) ? (
            <UnpaidBadge className="bg-amber-100/95 shadow-sm dark:bg-slate-950/80" />
          ) : (
            <StatusBadge status={statusOf(h)} className="bg-white/95 shadow-sm dark:bg-slate-950/80" />
          )}
          <SaveButton hashar={h} variant="overlay" />
        </div>
        <div className="absolute bottom-3 left-3 flex items-end gap-2">
          <div className="overflow-hidden rounded-2xl bg-white text-center shadow-lg ring-1 ring-black/5 dark:bg-slate-900">
            <div className="bg-brand-600 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white">{d.month}</div>
            <div className="px-2.5 pb-1 pt-0.5 font-display text-xl font-extrabold leading-none text-slate-900 dark:text-white">{d.day}</div>
          </div>
          {left && (
            <span className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
              <ClockIcon className="h-3.5 w-3.5" /> {left}
            </span>
          )}
        </div>
        {h.joined && !done && !isOverdue(h) && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            <CheckIcon className="h-3 w-3" strokeWidth={3.5} /> Siz qatnashasiz
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[17px] font-extrabold leading-snug text-ink [overflow-wrap:anywhere]">
          <a
            href={`#/hashar/${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              open(h);
            }}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {h.title}
          </a>
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-ink-3">
          <PinIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{h.address || 'Xaritada belgilangan joy'}</span>
          {dist != null && <span className="shrink-0 font-semibold text-sky-700 dark:text-sky-300">· {formatKm(dist)}</span>}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-3">
          <ClockIcon className="h-4 w-4 shrink-0" /> {formatDateTime(h.date_time)}
        </p>

        {h.max_volunteers ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs font-semibold text-ink-3">
              <span>
                {h.volunteer_count}/{h.max_volunteers} ko'ngilli
              </span>
              <span>{Math.max(0, h.max_volunteers - h.volunteer_count)} joy qoldi</span>
            </div>
            <Progress value={h.volunteer_count} max={h.max_volunteers} />
          </div>
        ) : null}

        <div className="relative z-[1] mt-auto flex items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-3 text-sm font-semibold text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4 text-brand" /> {h.volunteer_count || 0}
            </span>
            {h.comment_count > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MessageIcon className="h-4 w-4 text-ink-3" /> {h.comment_count}
              </span>
            )}
          </div>
          <JoinButton hashar={h} size="sm" />
        </div>
      </div>
    </article>
  );
});

// memo: ro'yxat/karusel qayta chizilganda (filtr, keyingi kartalar qo'shilishi) o'zgarmagan kartalar qayta chizilmaydi
export default memo(HasharCard);

/** Ixcham gorizontal karta (ro'yxatlar, xarita paneli, profil). */
export function HasharRow({ hashar: h, distance, selected, onClick, action = true, className }) {
  const dist = distance ?? h.distance_km;
  return (
    <article
      className={cx(
        'group relative flex gap-3.5 rounded-3xl border bg-surface p-3 shadow-soft transition hover:shadow-lift',
        selected ? 'border-brand-500 ring-4 ring-brand-500/15' : 'border-line',
        className,
      )}
    >
      <Thumb hashar={h} className="h-24 w-24 shrink-0 rounded-2xl" iconClass="h-9 w-9" />
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {isUnpaid(h) ? <UnpaidBadge className="px-2 py-0.5 text-[11px]" /> : <StatusBadge status={statusOf(h)} className="px-2 py-0.5 text-[11px]" />}
            <CategoryChip category={h.category} short className="px-2 py-0.5 text-[11px]" />
          </div>
          <SaveButton hashar={h} className="-mr-1.5 -mt-1.5" />
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[15px] font-extrabold leading-snug text-ink [overflow-wrap:anywhere]">
          <a
            href={`#/hashar/${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              if (onClick) onClick(h);
              else open(h);
            }}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {h.title}
          </a>
        </h3>
        <p className="mt-1 truncate text-xs font-medium text-ink-3">
          {formatDateTime(h.date_time)}
          {dist != null && <span className="text-sky-700 dark:text-sky-300"> · {formatKm(dist)}</span>}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-2">
            <UsersIcon className="h-3.5 w-3.5 text-brand" /> {h.volunteer_count || 0}
            {h.max_volunteers ? `/${h.max_volunteers}` : ''}
          </span>
          {action && (
            <div className="relative z-[1]">
              <JoinButton hashar={h} size="sm" className="h-8 px-3 text-xs" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

const MINI_STATUS = {
  PENDING: { label: 'Kutilmoqda', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  COMPLETED: { label: 'Bajarildi', dot: 'bg-brand-500', text: 'text-brand-700 dark:text-brand-300' },
  PAST: { label: "O'tib ketgan", dot: 'bg-slate-400', text: 'text-ink-3' },
};

/**
 * Xarita panelidagi (mobil karusel) ixcham karta. Balandligi qat'iy (104px): sarlavha bir qator, chiplar yo'q —
 * pastki panelda kesilmaydi va tab bar / markaziy tugma ostida qolmaydi.
 */
export function HasharMini({ hashar: h, distance, selected, className }) {
  const dist = distance ?? h.distance_km;
  const st = MINI_STATUS[statusOf(h)] || MINI_STATUS.PENDING;
  const c = categoryOf(h.category);
  const CatIcon = CATEGORY_ICONS[c.id];
  const hasPhoto = !!(h.after_url || h.before_url);
  return (
    <article
      className={cx(
        'group relative flex h-[104px] gap-3 rounded-3xl border bg-surface p-3 shadow-soft transition',
        selected ? 'border-brand-500 ring-4 ring-brand-500/15' : 'border-line',
        className,
      )}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
        <Thumb hashar={h} className="h-full w-full" iconClass="h-8 w-8" />
        {hasPhoto && (
          <span className="absolute bottom-1 left-1 grid h-6 w-6 place-items-center rounded-lg bg-white/95 text-slate-800 shadow-sm dark:bg-slate-950/80 dark:text-white" title={c.label}>
            <CatIcon className="h-3.5 w-3.5" strokeWidth={2.3} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold leading-4">
          <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', st.dot)} />
          <span className={cx('shrink-0', st.text)}>{st.label}</span>
          <span className="truncate font-semibold text-ink-3">
            · {formatDateTime(h.date_time)}
            {dist != null && <span className="text-sky-700 dark:text-sky-300"> · {formatKm(dist)}</span>}
          </span>
        </p>
        <h3 className="mt-1 truncate text-[15px] font-extrabold leading-5 text-ink">
          <a
            href={`#/hashar/${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              open(h);
            }}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {h.title}
          </a>
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-2">
            <UsersIcon className="h-3.5 w-3.5 text-brand" /> {h.volunteer_count || 0}
            {h.max_volunteers ? `/${h.max_volunteers}` : ''}
          </span>
          <div className="relative z-[1]">
            <JoinButton hashar={h} size="sm" className="h-8 px-3 text-xs" />
          </div>
        </div>
      </div>
    </article>
  );
}
