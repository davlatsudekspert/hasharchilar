// Hashar kartasi: status, nom, manzil, sana, kerakli narsalar, ko'ngillilar, "Qatnashish".
import { forwardRef } from 'react';
import { mediaUrl } from '../lib/config.js';
import { cx, formatDateTime, formatKm, volunteersLabel } from '../lib/utils.js';
import { CalendarIcon, CheckIcon, LeafIcon, NavigationIcon, PinIcon, UsersIcon } from './icons.jsx';
import { ItemChips, StatusBadge, Spinner } from './ui.jsx';

/** Kichik rasm (oldin/keyin) yoki barg bilan joy egallovchi. */
export function Thumb({ hashar: h, className }) {
  const src = mediaUrl(h.status === 'COMPLETED' ? h.after_url || h.before_url : h.before_url);
  return (
    <div className={cx('relative shrink-0 overflow-hidden rounded-xl bg-emerald-50', className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-emerald-300">
          <LeafIcon className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}

/** Qatnashish tugmasi uchun umumiy holat. */
export function JoinButton({ hashar: h, busy, onJoin, className, size = 'md' }) {
  const pad = size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm';
  if (h.status === 'COMPLETED') {
    return (
      <span className={cx('inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 font-bold text-emerald-800', pad, className)}>
        <CheckIcon className="h-4 w-4" strokeWidth={2.6} /> Yakunlangan
      </span>
    );
  }
  if (h.joined) {
    return (
      <span className={cx('inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 font-bold text-white', pad, className)}>
        <CheckIcon className="h-4 w-4" strokeWidth={2.6} /> Qatnashasiz
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onJoin(h.id);
      }}
      className={cx(
        'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 font-bold text-slate-900 shadow-sm shadow-amber-500/25 transition hover:bg-amber-300 active:scale-[.98] disabled:opacity-60',
        pad,
        className,
      )}
    >
      {busy && <Spinner />} Qatnashish
    </button>
  );
}

const HasharCard = forwardRef(function HasharCard({ hashar: h, selected, distance, busy, onOpen, onJoin, onHover }, ref) {
  return (
    <article
      ref={ref}
      onMouseEnter={onHover ? () => onHover(h.id) : undefined}
      className={cx(
        'group relative rounded-2xl bg-white p-4 shadow-sm ring-1 transition hover:shadow-md',
        selected ? 'ring-2 ring-emerald-500' : 'ring-slate-200/80 hover:ring-slate-300',
      )}
    >
      <div className="flex gap-3.5">
        <Thumb hashar={h} className="h-[84px] w-[84px] sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={h.status} />
            {distance != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">
                <NavigationIcon className="h-3 w-3" /> {formatKm(distance)}
              </span>
            )}
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-[16px] font-bold leading-snug text-slate-900">
            {/* Butun kartani bosiladigan qiluvchi tugma (accessible "stretched link") */}
            <button
              type="button"
              onClick={() => onOpen(h.id)}
              className="text-left outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-emerald-500"
            >
              {h.title}
            </button>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate font-medium">{formatDateTime(h.date_time)}</span>
          </p>
          {h.address && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
              <PinIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{h.address}</span>
            </p>
          )}
        </div>
      </div>

      {h.items?.length > 0 && <ItemChips items={h.items} max={3} className="mt-3" />}

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
          <UsersIcon className="h-4 w-4 text-emerald-600" />
          {volunteersLabel(h.volunteer_count)}
        </span>
        <JoinButton hashar={h} busy={busy} onJoin={onJoin} />
      </div>
    </article>
  );
});

export default HasharCard;
