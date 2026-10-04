// Oldin / Keyin galereyasi: yakunlangan hasharlar slayderlari, kategoriya filtri.
import { useEffect, useMemo, useState } from 'react';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';
import { Thumb } from '../components/HasharCard.jsx';
import { ArrowRightIcon, CalendarIcon, CameraIcon, CATEGORY_ICONS, ImageIcon, PinIcon, UsersIcon } from '../components/icons.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';
import { btn, CategoryChip, Chip, EmptyState, ErrorState, Link, PageHeader } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { mediaUrl } from '../lib/config.js';
import { CATEGORIES } from '../lib/meta.js';
import { hideSplash } from '../lib/native.js';
import { navigate } from '../lib/router.js';
import { useApi } from '../lib/store.js';
import { cx, formatDay, sortHashars } from '../lib/utils.js';

function ResultCard({ h, big }) {
  const before = mediaUrl(h.before_url);
  const after = mediaUrl(h.after_url);
  return (
    <article className={cx('overflow-hidden rounded-3xl border border-line bg-surface shadow-soft', big && 'lg:grid lg:grid-cols-[1.5fr_1fr]')}>
      <div className="p-2">
        {before && after ? (
          <BeforeAfterSlider before={before} after={after} alt={h.title} aspect={big ? 'aspect-[16/10]' : 'aspect-[4/3]'} className="rounded-[20px]" />
        ) : (
          <div className="relative overflow-hidden rounded-[20px]">
            <Thumb hashar={h} className={cx('w-full', big ? 'aspect-[16/10]' : 'aspect-[4/3]')} />
            <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Keyin</span>
          </div>
        )}
      </div>
      <div className={cx('px-5 pb-5 pt-2', big && 'lg:flex lg:flex-col lg:justify-center lg:p-8')}>
        {big && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand">Eng so'nggi natija</p>}
        <CategoryChip category={h.category} short />
        <h3 className={cx('mt-2 font-extrabold leading-snug text-ink', big ? 'text-2xl sm:text-3xl' : 'text-[17px]')}>
          <Link to={`/hashar/${h.id}`} className="hover:text-brand">
            {h.title}
          </Link>
        </h3>
        <div className="mt-2 space-y-1 text-sm text-ink-3">
          <p className="flex items-center gap-1.5 truncate">
            <PinIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{h.address || 'Xaritada belgilangan joy'}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-4 w-4" /> {formatDay(h.completed_at || h.date_time)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4" /> {h.volunteer_count} ko'ngilli
            </span>
          </p>
        </div>
        {big && h.description && <p className="mt-4 line-clamp-3 text-[15px] leading-relaxed text-ink-2">{h.description}</p>}
        {big && (
          <Link to={`/hashar/${h.id}`} className={cx(btn.primary, 'mt-6 h-12 w-fit px-6')}>
            Batafsil <ArrowRightIcon className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

export default function ResultsPage() {
  const list = useApi('hashars:all', () => api.listHashars().then((l) => sortHashars(Array.isArray(l) ? l : [])));
  const [cat, setCat] = useState('all');

  useEffect(() => {
    if (!list.loading) hideSplash();
  }, [list.loading]);

  const done = useMemo(
    () => (list.data || []).filter((h) => h.status === 'COMPLETED' && (h.after_url || h.before_url) && (cat === 'all' || (h.category || 'cleaning') === cat)),
    [list.data, cat],
  );
  const volunteers = done.reduce((s, h) => s + (h.volunteer_count || 0), 0);
  const [first, ...rest] = done;

  return (
    <PullToRefresh onRefresh={list.reload}>
      <div className="mx-auto max-w-7xl px-4 pb-12 lg:px-6">
        <PageHeader title="Oldin / Keyin" subtitle="Birgalikda erishilgan natijalar — slayderni suring" icon={ImageIcon} />

        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-3xl border border-line bg-surface p-4 shadow-soft">
            <p className="font-display text-3xl font-extrabold text-ink tabular">{list.data ? done.length : '—'}</p>
            <p className="text-sm font-medium text-ink-3">yakunlangan hashar</p>
          </div>
          <div className="rounded-3xl border border-line bg-surface p-4 shadow-soft">
            <p className="font-display text-3xl font-extrabold text-ink tabular">{list.data ? volunteers : '—'}</p>
            <p className="text-sm font-medium text-ink-3">ishtirok etgan ko'ngilli</p>
          </div>
        </div>

        <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>
            Hammasi
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} icon={CATEGORY_ICONS[c.id]}>
              {c.label}
            </Chip>
          ))}
        </div>

        <div className="mt-6">
          {list.loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton aspect-[4/3] rounded-3xl" />
              ))}
            </div>
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : done.length === 0 ? (
            <EmptyState
              icon={CameraIcon}
              title="Hali natijalar yo'q"
              text="Hashar yakunlangach tashkilotchi 'Keyin' rasmini yuklaydi va natija shu yerda paydo bo'ladi. Birinchi natija sizdan bo'lsin!"
              action={
                <button type="button" onClick={() => navigate('/hasharlar')} className={cx(btn.primary, 'h-11 px-5')}>
                  Hasharga qo'shilish
                </button>
              }
            />
          ) : (
            <div className="space-y-5">
              <ResultCard h={first} big />
              {rest.length > 0 && (
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((h) => (
                    <li key={h.id}>
                      <ResultCard h={h} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
