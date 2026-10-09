// Header qo'ng'iroqchasi ostidagi ochiladigan oyna (desktop): oxirgi bildirishnomalar, "hammasini o'qish".
import { useNotificationFeed } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { BellIcon, CheckAllIcon } from './icons.jsx';
import { NotificationItem } from './NotificationItem.jsx';
import { Link } from './ui.jsx';

/** Desktop: oxirgi bildirishnomalar oynasi. */
export default function BellPanel({ onClose }) {
  const feed = useNotificationFeed();
  const items = feed.items.slice(0, 7);
  const unread = feed.items.some((n) => !(n.read || n.read_at));
  const open = (n, info) => {
    if (!(n.read || n.read_at)) feed.markRead([n.id]);
    onClose();
    if (info.link) navigate(info.link);
  };
  return (
    <div
      role="dialog"
      aria-label="Bildirishnomalar"
      className="bell-panel absolute right-0 top-[calc(100%+10px)] z-[1300] w-[400px] overflow-hidden rounded-3xl border border-line bg-surface shadow-lift"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="font-display text-lg font-extrabold text-ink">Bildirishnomalar</p>
        {unread && (
          <button type="button" onClick={() => feed.markRead()} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand transition hover:bg-brand-soft">
            <CheckAllIcon className="h-4 w-4" /> Hammasini o'qish
          </button>
        )}
      </div>
      <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-2">
        {feed.loading ? (
          <div className="space-y-2 p-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <span className="skeleton h-10 w-10 rounded-full" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="skeleton block h-3.5 w-4/5 rounded-full" />
                  <span className="skeleton block h-3 w-1/2 rounded-full" />
                </span>
              </div>
            ))}
          </div>
        ) : feed.unsupported || items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
              <BellIcon className="h-7 w-7" />
            </span>
            <p className="mt-3 font-bold text-ink">Hozircha bildirishnoma yo'q</p>
            <p className="mt-1 text-sm text-ink-3">Kimdir hasharingizga qo'shilsa yoki izoh yozsa — shu yerda ko'rasiz.</p>
          </div>
        ) : (
          <ul className="stagger space-y-0.5">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem n={n} compact onOpen={open} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link
        to="/bildirishnomalar"
        onClick={onClose}
        className="block border-t border-line bg-surface-2/60 px-5 py-3 text-center text-sm font-bold text-brand transition hover:bg-surface-2"
      >
        Barcha bildirishnomalar
      </Link>
    </div>
  );
}
