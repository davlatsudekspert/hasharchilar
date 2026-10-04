// To'liq ekran xarita: klasterlar, kategoriya filtrlari, "Mening joyim", mobil pastki panel (karusel / ro'yxat),
// desktopda chap ro'yxat paneli.
import { useEffect, useMemo, useRef, useState } from 'react';
import { HasharRow } from '../components/HasharCard.jsx';
import { CATEGORY_ICONS, ChevronDownIcon, ListIcon, LocateIcon, MapIcon, PlusIcon } from '../components/icons.jsx';
import { HasharMap } from '../components/map/index.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, CardSkeleton, Chip, EmptyState, ErrorState, Segmented, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { CATEGORIES } from '../lib/meta.js';
import { GEO_MESSAGES, getCurrentPosition, haptic, hideSplash } from '../lib/native.js';
import { navigate } from '../lib/router.js';
import { useApi } from '../lib/store.js';
import { cx, distanceKm, sortHashars } from '../lib/utils.js';

const MOBILE_PAD = { top: 150, bottom: 290, left: 48, right: 48 };

const STATUS = [
  { value: 'all', label: 'Hammasi' },
  { value: 'PENDING', label: 'Kutilmoqda' },
  { value: 'COMPLETED', label: 'Bajarildi' },
];

export default function MapPage() {
  const toast = useToast();
  const list = useApi('hashars:all', () => api.listHashars().then((l) => sortHashars(Array.isArray(l) ? l : [])));
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [sheet, setSheet] = useState('peek'); // peek | full
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const carouselRef = useRef(null);
  const itemRefs = useRef(new Map()); // ro'yxat (desktop / to'liq panel)
  const carRefs = useRef(new Map()); // mobil karusel

  useEffect(() => {
    if (!list.loading) hideSplash();
  }, [list.loading]);

  const visible = useMemo(() => {
    let l = (list.data || []).filter((h) => (cat === 'all' || (h.category || 'cleaning') === cat) && (status === 'all' || h.status === status));
    if (userPos) l = l.map((h) => ({ ...h, distance: distanceKm(userPos, h) })).sort((a, b) => a.distance - b.distance);
    return l;
  }, [list.data, cat, status, userPos]);

  // Pin tanlansa — karuselda/ro'yxatda shu kartaga suriladi
  useEffect(() => {
    if (selectedId == null) return;
    [itemRefs, carRefs].forEach((r) => {
      const el = r.current.get(selectedId);
      if (el && el.offsetParent !== null) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }, [selectedId]);

  const locate = async () => {
    setGeoBusy(true);
    try {
      const p = await getCurrentPosition();
      haptic('light');
      setUserPos(p);
      toast('Sizga eng yaqin hasharlar birinchi ko\'rsatilmoqda', 'info');
    } catch (e) {
      toast(GEO_MESSAGES[e.kind] || GEO_MESSAGES.timeout, 'error');
    } finally {
      setGeoBusy(false);
    }
  };

  const open = (id) => navigate(`/hashar/${id}`);

  const filters = (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-1 lg:flex-wrap lg:overflow-visible lg:px-0">
      <Chip active={cat === 'all'} onClick={() => setCat('all')} className="shadow-sm">
        Barcha turlar
      </Chip>
      {CATEGORIES.map((c) => (
        <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} icon={CATEGORY_ICONS[c.id]} className="shadow-sm">
          {c.short}
        </Chip>
      ))}
    </div>
  );

  const listBody = list.loading ? (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <CardSkeleton key={i} horizontal />
      ))}
    </div>
  ) : list.error ? (
    <ErrorState message={list.error.message} onRetry={list.reload} compact />
  ) : visible.length === 0 ? (
    <EmptyState
      icon={MapIcon}
      title="Bu filtr bo'yicha hashar yo'q"
      text="Boshqa kategoriyani tanlang yoki yangi hashar e'lon qiling."
      action={
        <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-11 px-5')}>
          <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> E'lon qilish
        </button>
      }
    />
  ) : (
    <ul className="space-y-3">
      {visible.map((h) => (
        <li key={h.id} ref={(el) => (el ? itemRefs.current.set(h.id, el) : itemRefs.current.delete(h.id))} onMouseEnter={() => setSelectedId(h.id)}>
          <HasharRow hashar={h} distance={h.distance} selected={h.id === selectedId} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="map-page relative flex h-[calc(100dvh-64px-var(--sat))] lg:h-[calc(100dvh-72px-var(--sat))]">
      {/* Desktop: chap panel */}
      <aside className="hidden w-[420px] shrink-0 flex-col border-r border-line bg-bg lg:flex">
        <div className="space-y-3 border-b border-line p-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold text-ink">Xarita</h1>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-bold text-ink-2 ring-1 ring-line">{visible.length} ta</span>
          </div>
          <Segmented value={status} onChange={setStatus} options={STATUS} label="Holat" className="w-full" size="sm" />
          {filters}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{listBody}</div>
      </aside>

      {/* Xarita */}
      <div className="relative min-w-0 flex-1">
        <HasharMap
          hashars={visible}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpen={open}
          userPos={userPos}
          attributionClassName="max-lg:bottom-auto max-lg:top-[116px]"
          fitPadding={isMobile ? MOBILE_PAD : 80}
        />

        {/* Mobil: yuqori filtrlar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] space-y-2 pt-3 lg:hidden">
          <div className="pointer-events-auto px-4">
            <Segmented value={status} onChange={setStatus} options={STATUS} label="Holat" size="sm" className="glass shadow-lg" />
          </div>
          <div className="pointer-events-auto">{filters}</div>
        </div>

        {/* Mening joyim */}
        <button
          type="button"
          onClick={locate}
          disabled={geoBusy}
          aria-label="Mening joyim"
          className="absolute right-3 z-[5] inline-flex h-12 items-center gap-2 rounded-2xl bg-surface px-4 text-sm font-bold text-ink shadow-lift ring-1 ring-line transition active:scale-95 max-lg:bottom-[calc(262px+var(--sab))] lg:bottom-8 lg:right-5"
        >
          {geoBusy ? <Spinner className="text-sky-600" /> : <LocateIcon className="h-5 w-5 text-sky-600" />}
          <span className="hidden sm:inline">Mening joyim</span>
        </button>

        {/* Mobil: pastki panel */}
        <div
          className={cx(
            'absolute inset-x-0 z-[6] transition-[height] duration-300 lg:hidden',
            'bottom-[calc(68px+var(--sab))]',
            sheet === 'full' ? 'h-[62%]' : 'h-[178px]',
          )}
        >
          <div className="flex h-full flex-col rounded-t-[28px] border-t border-line bg-surface/95 shadow-[0_-12px_40px_-12px_rgba(0,0,0,.25)] backdrop-blur">
            <button
              type="button"
              onClick={() => setSheet((s) => (s === 'full' ? 'peek' : 'full'))}
              className="flex w-full shrink-0 items-center justify-between px-5 pb-2 pt-3"
              aria-expanded={sheet === 'full'}
            >
              <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <ListIcon className="h-4 w-4 text-brand" />
                {list.loading ? 'Yuklanmoqda…' : `${visible.length} ta hashar`}
              </span>
              <span className="flex items-center gap-1 text-xs font-bold text-brand">
                {sheet === 'full' ? 'Yig\'ish' : "Ro'yxat"}
                <ChevronDownIcon className={cx('h-4 w-4 transition', sheet === 'peek' && 'rotate-180')} />
              </span>
            </button>
            {sheet === 'full' ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{listBody}</div>
            ) : (
              <div ref={carouselRef} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3">
                {list.loading
                  ? [0, 1].map((i) => (
                      <div key={i} className="w-[86%] shrink-0">
                        <CardSkeleton horizontal />
                      </div>
                    ))
                  : visible.length === 0
                    ? (
                      <p className="px-1 py-6 text-sm text-ink-3">Bu filtr bo'yicha hashar topilmadi.</p>
                    )
                    : visible.map((h) => (
                        <div
                          key={h.id}
                          ref={(el) => (el ? carRefs.current.set(h.id, el) : carRefs.current.delete(h.id))}
                          className="w-[86%] max-w-[360px] shrink-0 snap-center"
                          onClick={() => setSelectedId(h.id)}
                        >
                          <HasharRow hashar={h} distance={h.distance} selected={h.id === selectedId} />
                        </div>
                      ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
