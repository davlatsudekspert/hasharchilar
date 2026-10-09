// Bildirishnomalar sahifasi (#/bildirishnomalar): kunlar bo'yicha guruhlangan, "hammasini o'qish", chuqur havolalar,
// ko'rinib turganda 60 s da yangilanadi, "Yana yuklash".
import { useEffect } from 'react';
import AuthForm from '../components/AuthForm.jsx';
import { BellIcon, BellOffIcon, CheckAllIcon } from '../components/icons.jsx';
import { groupByDay, NotificationItem } from '../components/NotificationItem.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';
import { btn, EmptyState, ErrorState, Link, PageHeader, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { haptic, hideSplash } from '../lib/native.js';
import { isRead, useNotificationFeed } from '../lib/notifications.js';
import { navigate } from '../lib/router.js';
import { cx } from '../lib/utils.js';

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 rounded-2xl p-3">
          <span className="skeleton h-12 w-12 shrink-0 rounded-full" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="skeleton block h-4 w-4/5 rounded-full" />
            <span className="skeleton block h-3 w-3/5 rounded-full" />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  const { user, ready } = useAuth();
  const feed = useNotificationFeed({ enabled: !!user, poll: true });
  const unread = feed.items.filter((n) => !isRead(n)).length;

  useEffect(() => {
    if (!feed.loading) hideSplash();
  }, [feed.loading]);

  if (ready && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-soft sm:p-8">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line">
            <BellIcon className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">Bildirishnomalar</h1>
          <p className="mb-5 mt-1 text-sm text-ink-3">Kiring — hasharlaringizdagi yangiliklar shu yerda ko'rinadi.</p>
          <AuthForm />
        </div>
      </div>
    );
  }

  const open = (n, info) => {
    haptic('select');
    if (!isRead(n)) feed.markRead([n.id]);
    if (info.link) navigate(info.link);
  };

  let body;
  if (feed.loading) body = <Skeleton />;
  else if (feed.unsupported) {
    body = <EmptyState icon={BellOffIcon} title="Bildirishnomalar hali ishga tushmagan" text="Server yangilangach bu yerda hasharlaringizdagi yangiliklar ko'rinadi." />;
  } else if (feed.error && !feed.items.length) body = <ErrorState message={feed.error.message} onRetry={feed.reload} />;
  else if (!feed.items.length) {
    body = (
      <EmptyState
        icon={BellIcon}
        title="Hozircha bildirishnoma yo'q"
        text="Kimdir hasharingizga qo'shilsa, izoh yozsa yoki qatnashgan hasharingiz yakunlansa — shu yerda ko'rasiz."
        action={
          <Link to="/xarita" className={cx(btn.primary, 'h-11 px-5')}>
            Hasharlarni ko'rish
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="space-y-6">
        {groupByDay(feed.items).map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="sticky top-[calc(64px+var(--sat))] z-[1] -mx-1 mb-1.5 bg-bg/90 px-1 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3 backdrop-blur lg:top-[72px]">
              {g.label}
            </h2>
            <ul className="stagger space-y-1 rounded-3xl border border-line bg-surface p-1.5 shadow-soft">
              {g.items.map((n) => (
                <li key={n.id} data-testid="notification">
                  <NotificationItem n={n} onOpen={open} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {feed.hasMore && (
          <div className="flex justify-center">
            <button type="button" onClick={feed.loadMore} disabled={feed.loadingMore} className={cx(btn.outline, 'h-11 px-6 text-sm')}>
              {feed.loadingMore && <Spinner />} Yana yuklash
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={feed.reload}>
      <div className="mx-auto max-w-2xl px-4 pb-12 lg:px-6">
        <PageHeader
          title="Bildirishnomalar"
          subtitle={unread ? `${unread} ta o'qilmagan` : 'Hammasi o\'qilgan'}
          back
          icon={BellIcon}
          action={
            unread > 0 ? (
              <button
                type="button"
                onClick={() => (haptic('light'), feed.markRead())}
                aria-label="Hammasini o'qilgan deb belgilash"
                title="Hammasini o'qilgan deb belgilash"
                className={cx(btn.soft, 'h-11 w-11 shrink-0 p-0 text-sm sm:w-auto sm:px-3.5')}
                data-testid="mark-all-read"
              >
                <CheckAllIcon className="h-5 w-5 sm:h-4 sm:w-4" /> <span className="max-sm:hidden">Hammasini o'qish</span>
              </button>
            ) : null
          }
        />
        {body}
      </div>
    </PullToRefresh>
  );
}
