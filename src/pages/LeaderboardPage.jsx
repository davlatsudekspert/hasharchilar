// Ko'ngillilar reytingi: oy / umumiy, podium (top-3), qolganlar ro'yxati.
import { useState } from 'react';
import { CrownIcon, InfoIcon, TrophyIcon } from '../components/icons.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';
import { Avatar, btn, EmptyState, ErrorState, Link, PageHeader, Segmented } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { navigate } from '../lib/router.js';
import { useApi } from '../lib/store.js';
import { cx } from '../lib/utils.js';

const PODIUM = [
  { place: 2, h: 'h-28 sm:h-32', ring: 'ring-slate-300', badge: 'bg-slate-300 text-slate-900', bar: 'from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700' },
  { place: 1, h: 'h-36 sm:h-44', ring: 'ring-amber-400', badge: 'bg-amber-400 text-slate-950', bar: 'from-amber-200 to-amber-400 dark:from-amber-500/60 dark:to-amber-600/60' },
  { place: 3, h: 'h-20 sm:h-24', ring: 'ring-orange-300', badge: 'bg-orange-300 text-slate-900', bar: 'from-orange-100 to-orange-300 dark:from-orange-500/40 dark:to-orange-600/50' },
];

function Podium({ rows, meId }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {PODIUM.map((p) => {
        const r = rows[p.place - 1];
        if (!r) return <div key={p.place} />;
        return (
          <Link key={p.place} to={`/u/${r.user.id}`} className="group flex flex-col items-center text-center">
            {p.place === 1 && <CrownIcon className="mb-1 h-7 w-7 text-amber-400" strokeWidth={2.2} />}
            <div className="relative">
              <Avatar name={r.user.name} src={r.user.avatar_url} size={p.place === 1 ? 'xl' : 'lg'} className={cx('ring-4 transition group-hover:scale-105', p.ring)} />
              <span className={cx('absolute -bottom-2 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full text-sm font-extrabold ring-2 ring-surface', p.badge)}>{p.place}</span>
            </div>
            <p className={cx('mt-4 w-full truncate px-1 text-sm font-extrabold sm:text-base', r.user.id === meId ? 'text-brand' : 'text-ink')}>{r.user.name}</p>
            <p className="text-xs font-bold text-ink-3 tabular">{r.score} ball</p>
            <div className={cx('mt-3 w-full rounded-t-3xl bg-gradient-to-b', p.bar, p.h)}>
              <p className="pt-3 font-display text-3xl font-extrabold text-ink/40 sm:text-4xl">{p.place}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('month');
  const lb = useApi(`leaderboard:${period}`, () => api.leaderboard(period));
  const rows = Array.isArray(lb.data) ? lb.data : [];
  const myIndex = user ? rows.findIndex((r) => r.user.id === user.id) : -1;

  return (
    <PullToRefresh onRefresh={lb.reload}>
      <div className="mx-auto max-w-4xl px-4 pb-12 lg:px-6">
        <PageHeader title="Reyting" subtitle="Eng faol ko'ngillilar — mahalla qahramonlari" icon={TrophyIcon} />
        <Segmented
          value={period}
          onChange={setPeriod}
          label="Davr"
          className="w-full sm:w-auto"
          options={[
            { value: 'month', label: 'Shu oy' },
            { value: 'all', label: 'Umumiy' },
          ]}
        />

        <div className="mt-6">
          {lb.loading ? (
            <div aria-hidden="true">
              <div className="grid grid-cols-3 items-end gap-3">
                {['h-40', 'h-52', 'h-32'].map((h, i) => (
                  <div key={i} className={cx('skeleton rounded-3xl', h)} />
                ))}
              </div>
              <div className="mt-6 space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : lb.error && lb.error.status !== 404 ? (
            <ErrorState message={lb.error.message} onRetry={lb.reload} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={TrophyIcon}
              title={period === 'month' ? "Bu oy hali hech kim ball to'plamadi" : 'Reyting hali bo\'sh'}
              text="Hasharga qo'shiling yoki o'zingiz e'lon qiling — reytingning birinchi qatoriga siz chiqing!"
              action={
                <button type="button" onClick={() => navigate('/hasharlar')} className={cx(btn.cta, 'h-11 px-5')}>
                  Hasharlarni ko'rish
                </button>
              }
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-[32px] border border-line bg-surface px-3 pt-6 shadow-soft sm:px-8">
                <Podium rows={rows} meId={user?.id} />
              </div>

              {myIndex >= 0 && (
                <p className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand ring-1 ring-brand-line">
                  Siz reytingda <b>{myIndex + 1}-o'rindasiz</b> — {rows[myIndex].score} ball. Davom eting! 💪
                </p>
              )}

              {rows.length > 3 && (
                <ol className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
                  {rows.slice(3).map((r, i) => (
                    <li key={r.user.id} className="border-b border-line last:border-0">
                      <Link
                        to={`/u/${r.user.id}`}
                        className={cx('flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2', r.user.id === user?.id && 'bg-brand-soft')}
                      >
                        <span className="w-7 text-center font-display text-lg font-extrabold text-ink-3 tabular">{i + 4}</span>
                        <Avatar name={r.user.name} src={r.user.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-ink">{r.user.name}</p>
                          <p className="truncate text-xs text-ink-3">
                            {r.user.district ? `${r.user.district} · ` : ''}
                            {r.joined} qatnashgan · {r.created} tashkil · {r.completed} yakunlangan
                          </p>
                        </div>
                        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-extrabold text-ink tabular ring-1 ring-line">{r.score}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex gap-3 rounded-3xl bg-surface-2 p-4 text-sm text-ink-3 ring-1 ring-line">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <p>
            Ball qanday hisoblanadi: <b className="text-ink">yakunlangan hashar — 10</b>, <b className="text-ink">tashkil qilish — 5</b>,{' '}
            <b className="text-ink">qatnashish — 3</b> ball.
          </p>
        </div>
      </div>
    </PullToRefresh>
  );
}
