// Hasharlar ro'yxati: qidiruv, filtrlar (holat, kategoriya, sana, masofa), saralash, setka / ro'yxat ko'rinishi.
import { useEffect, useMemo, useState } from 'react';
import HasharCard, { HasharRow } from '../components/HasharCard.jsx';
import {
  CATEGORY_ICONS,
  LayersIcon,
  ListIcon,
  LocateIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
  XIcon,
} from '../components/icons.jsx';
import PullToRefresh from '../components/PullToRefresh.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, CardSkeleton, Chip, EmptyState, ErrorState, inputCls, labelCls, PageHeader, Segmented, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { CATEGORIES } from '../lib/meta.js';
import { GEO_MESSAGES, getCurrentPosition, hideSplash } from '../lib/native.js';
import { navigate } from '../lib/router.js';
import { storage } from '../lib/storage.js';
import { useApi } from '../lib/store.js';
import { cx, distanceKm, matchesQuery, sortHashars, tashkentNow } from '../lib/utils.js';

const SORTS = [
  { value: 'date', label: 'Sana bo\'yicha' },
  { value: 'new', label: 'Eng yangi' },
  { value: 'popular', label: 'Ommabop' },
  { value: 'near', label: 'Eng yaqin' },
];
const RADII = [1, 3, 5, 10, 25];
const VIEW_KEY = 'hashar_list_view';

export default function ListPage({ route }) {
  const toast = useToast();
  const list = useApi('hashars:all', () => api.listHashars().then((l) => sortHashars(Array.isArray(l) ? l : [])));
  const [q, setQ] = useState(route.query.q || '');
  const [status, setStatus] = useState(route.query.status || 'PENDING');
  const [cat, setCat] = useState(route.query.cat || 'all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [radius, setRadius] = useState(null);
  const [sort, setSort] = useState('date');
  const [userPos, setUserPos] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState(() => storage.get(VIEW_KEY) || 'grid');

  useEffect(() => {
    if (!list.loading) hideSplash();
  }, [list.loading]);

  const needLocation = async () => {
    if (userPos) return userPos;
    setGeoBusy(true);
    try {
      const p = await getCurrentPosition();
      setUserPos(p);
      return p;
    } catch (e) {
      toast(GEO_MESSAGES[e.kind] || GEO_MESSAGES.timeout, 'error');
      return null;
    } finally {
      setGeoBusy(false);
    }
  };

  const changeSort = async (v) => {
    if (v === 'near' && !(await needLocation())) return;
    setSort(v);
  };
  const changeRadius = async (r) => {
    if (r == null) return setRadius(null);
    if (!(await needLocation())) return;
    setRadius(r);
  };

  const term = q.trim().toLowerCase();
  const visible = useMemo(() => {
    let l = (list.data || []).filter(
      (h) =>
        (status === 'all' || h.status === status) &&
        (cat === 'all' || (h.category || 'cleaning') === cat) &&
        matchesQuery(h, term) &&
        (!from || String(h.date_time).slice(0, 10) >= from) &&
        (!to || String(h.date_time).slice(0, 10) <= to),
    );
    if (userPos) l = l.map((h) => ({ ...h, distance: distanceKm(userPos, h) }));
    if (radius && userPos) l = l.filter((h) => h.distance <= radius);
    const by = {
      date: (a, b) => (a.status !== b.status ? (a.status === 'PENDING' ? -1 : 1) : a.status === 'PENDING' ? String(a.date_time).localeCompare(String(b.date_time)) : String(b.completed_at || b.date_time).localeCompare(String(a.completed_at || a.date_time))),
      new: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id,
      popular: (a, b) => (b.volunteer_count || 0) - (a.volunteer_count || 0),
      near: (a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9),
    }[sort];
    return [...l].sort(by);
  }, [list.data, status, cat, term, from, to, radius, userPos, sort]);

  const counts = useMemo(() => {
    const all = list.data || [];
    return { all: all.length, PENDING: all.filter((h) => h.status === 'PENDING').length, COMPLETED: all.filter((h) => h.status === 'COMPLETED').length };
  }, [list.data]);

  const activeFilters = (cat !== 'all') + !!from + !!to + !!radius;
  const reset = () => {
    setQ('');
    setCat('all');
    setFrom('');
    setTo('');
    setRadius(null);
    setStatus('PENDING');
  };
  const setViewSaved = (v) => {
    setView(v);
    storage.set(VIEW_KEY, v);
  };

  return (
    <PullToRefresh onRefresh={list.reload}>
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <PageHeader
          title="Hasharlar"
          subtitle="Qidiring, saralang va o'zingizga mos hasharni toping"
          icon={LayersIcon}
          action={
            <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-11 px-5 max-sm:hidden')}>
              <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> E'lon qilish
            </button>
          }
        />

        {/* Qidiruv + filtr tugmasi */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nomi, manzil yoki tavsif bo'yicha qidiring…"
              aria-label="Hasharlarni qidirish"
              className={cx(inputCls, 'h-12 pl-12 shadow-soft')}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={cx(btn.outline, 'relative h-12 px-4 shadow-soft', showFilters && 'ring-2 ring-emerald-500')}
          >
            <SlidersIcon className="h-5 w-5" /> <span className="hidden sm:inline">Filtrlar</span>
            {activeFilters > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[11px] font-extrabold text-white">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Holat */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={status}
            onChange={setStatus}
            className="w-full sm:w-auto"
            label="Holat"
            options={[
              { value: 'PENDING', label: 'Kutilmoqda', count: list.data ? counts.PENDING : null },
              { value: 'COMPLETED', label: 'Bajarildi', count: list.data ? counts.COMPLETED : null },
              { value: 'all', label: 'Hammasi', count: list.data ? counts.all : null },
            ]}
          />
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label htmlFor="sort" className="sr-only">
              Saralash
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => changeSort(e.target.value)}
              className="h-10 flex-1 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold text-ink-2 outline-none focus:border-emerald-500 sm:flex-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="hidden rounded-2xl bg-surface-2 p-1 ring-1 ring-line sm:flex" role="group" aria-label="Ko'rinish">
              {[
                ['grid', LayersIcon, 'Setka'],
                ['list', ListIcon, "Ro'yxat"],
              ].map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewSaved(v)}
                  aria-pressed={view === v}
                  aria-label={label}
                  className={cx('grid h-8 w-9 place-items-center rounded-xl transition', view === v ? 'bg-surface text-brand shadow-sm' : 'text-ink-3')}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Kategoriyalar */}
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>
            Barcha kategoriyalar
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} icon={CATEGORY_ICONS[c.id]}>
              {c.label}
            </Chip>
          ))}
        </div>

        {/* Qo'shimcha filtrlar */}
        {showFilters && (
          <div className="fade-up mt-4 grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-soft md:grid-cols-[1fr_1fr_1.6fr_auto] md:items-end">
            <div>
              <label htmlFor="f-from" className={labelCls}>
                Sanadan
              </label>
              <input id="f-from" type="date" value={from} min={status === 'PENDING' ? tashkentNow().slice(0, 10) : undefined} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-to" className={labelCls}>
                Sanagacha
              </label>
              <input id="f-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Masofa (mendan)</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={!radius} onClick={() => changeRadius(null)}>
                  Istalgan
                </Chip>
                {RADII.map((r) => (
                  <Chip key={r} active={radius === r} onClick={() => changeRadius(r)}>
                    {r} km
                  </Chip>
                ))}
                {geoBusy && <Spinner className="ml-1 self-center text-sky-600" />}
              </div>
            </div>
            <button type="button" onClick={reset} className={cx(btn.ghost, 'h-12 px-4')}>
              <XIcon className="h-4 w-4" /> Tozalash
            </button>
          </div>
        )}

        {userPos && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-3">
            <LocateIcon className="h-4 w-4 text-sky-600" /> Masofa joriy joylashuvingizdan hisoblanmoqda
          </p>
        )}

        {/* Natijalar */}
        <div className="mt-5 pb-10">
          {list.loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : visible.length === 0 ? (
            (list.data || []).length === 0 ? (
              <EmptyState
                title="Hozircha hashar yo'q — birinchisini siz e'lon qiling!"
                text="Mahallangizda tozalash yoki daraxt ekish kerakmi? Hashar e'lon qiling, qo'shnilaringiz qo'shiladi."
                action={
                  <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-11 px-5')}>
                    <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={SearchIcon}
                title="Hech narsa topilmadi"
                text={term ? `"${q.trim()}" bo'yicha mos hashar yo'q. Boshqa so'z yoki filtrlarni sinab ko'ring.` : "Tanlangan filtrlar bo'yicha hashar yo'q."}
                action={
                  <button type="button" onClick={reset} className={cx(btn.ghost, 'h-10 px-4 text-sm')}>
                    Filtrlarni tozalash
                  </button>
                }
              />
            )
          ) : (
            <>
              <p className="mb-3 text-sm font-semibold text-ink-3">{visible.length} ta hashar topildi</p>
              {view === 'grid' ? (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((h) => (
                    <li key={h.id}>
                      <HasharCard hashar={h} distance={h.distance} className="h-full" />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {visible.map((h) => (
                    <li key={h.id}>
                      <HasharRow hashar={h} distance={h.distance} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
