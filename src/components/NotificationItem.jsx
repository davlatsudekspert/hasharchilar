// Bildirishnoma qatori (header ochiladigan oynasi va #/bildirishnomalar sahifasi uchun) + kunlar bo'yicha guruhlash.
import { describeNotification, isRead } from '../lib/notifications.js';
import { cx, formatDay, tashkentNow, timeAgo } from '../lib/utils.js';
import { AlertIcon, BellIcon, CheckCircleIcon, CheckIcon, MessageIcon, SparklesIcon, UsersIcon, WalletIcon } from './icons.jsx';
import { Avatar } from './ui.jsx';

const KIND = {
  join: { icon: UsersIcon, cls: 'bg-sky-500' },
  comment: { icon: MessageIcon, cls: 'bg-violet-500' },
  completed: { icon: CheckCircleIcon, cls: 'bg-brand-600' },
  paid: { icon: WalletIcon, cls: 'bg-brand-600' },
  cancelled: { icon: AlertIcon, cls: 'bg-red-500' },
  published: { icon: SparklesIcon, cls: 'bg-amber-500' },
  info: { icon: BellIcon, cls: 'bg-slate-500' },
};

/** UTC "…Z" → Toshkent sanasi "YYYY-MM-DD". */
function tashkentDay(iso) {
  const t = Date.parse(String(iso || '').replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(String(iso || '')) ? '' : 'Z'));
  return Number.isNaN(t) ? '' : new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
}

/** [{label, items}] — Bugun / Kecha / sana. */
export function groupByDay(list) {
  const today = tashkentNow().slice(0, 10);
  const yesterday = tashkentNow(-24 * 60).slice(0, 10);
  const groups = [];
  for (const n of list) {
    const day = tashkentDay(n.created_at);
    const label = day === today ? 'Bugun' : day === yesterday ? 'Kecha' : formatDay(n.created_at) || 'Avvalroq';
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}

export function NotificationItem({ n, onOpen, compact }) {
  const info = describeNotification(n);
  const k = KIND[info.kind] || KIND.info;
  const unread = !isRead(n);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(n, info)}
      className={cx(
        'group relative flex w-full items-start gap-3 rounded-2xl text-left transition hover:bg-surface-2 active:scale-[.99]',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        unread && 'bg-brand-soft/60',
      )}
    >
      <span className="relative shrink-0">
        {n.actor ? (
          <Avatar name={n.actor.name} src={n.actor.avatar_url} size={compact ? 'md' : 'lg'} className={compact ? '' : 'h-12 w-12 text-base'} />
        ) : (
          <span className={cx('grid place-items-center rounded-full text-white', k.cls, compact ? 'h-10 w-10' : 'h-12 w-12')}>
            <k.icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
          </span>
        )}
        {n.actor && (
          <span className={cx('absolute -bottom-1 -right-1 grid place-items-center rounded-full text-white ring-2 ring-surface', compact ? 'h-[18px] w-[18px]' : 'h-5 w-5', k.cls)}>
            <k.icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} strokeWidth={2.8} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[14.5px] leading-snug text-ink', unread ? 'font-semibold' : 'font-medium')}>
          {info.actor && <b className="font-extrabold">{info.actor} </b>}
          {info.text}
        </span>
        {info.sub && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-3 [overflow-wrap:anywhere]">{info.sub}</span>}
        <span className={cx('mt-1 block text-xs font-semibold', unread ? 'text-brand' : 'text-ink-3')}>{timeAgo(n.created_at)}</span>
      </span>
      {unread ? (
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 shadow-[0_0_0_4px] shadow-brand-500/15" aria-label="O'qilmagan" />
      ) : (
        <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-60" aria-hidden="true" />
      )}
    </button>
  );
}
