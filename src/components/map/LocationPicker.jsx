// Joy tanlash: markazdagi pin + xaritani surish, manzil qidirish (/api/geo/search), foydalanuvchi pinni
// surgach manzilni aniqlash (/api/geo/reverse), "Mening joyim".
// Joy faqat foydalanuvchi o'zi tanlaganda (surish/bosish, qidiruv natijasi, "Mening joyim") onChange orqali
// beriladi — boshlang'ich markaz (Toshkent) hech qachon "tanlangan joy" bo'lib qolmaydi.
// Nominatim qoidasi (avtomatik to'ldirish taqiqlangan, ≤1 so'rov/s): qidiruv faqat Enter / "Qidirish" bosilganda,
// reverse — faqat foydalanuvchi pinni surgandan keyin (1 s kutib, ~11 m dan kam siljish qayta so'ralmaydi).
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { createMap, maplibregl, pickPinSvg, setMapStyle, TASHKENT, userDotElement } from '../../lib/map.js';
import { GEO_MESSAGES, getCurrentPosition, haptic } from '../../lib/native.js';
import { useTheme } from '../../lib/theme.jsx';
import { cx } from '../../lib/utils.js';
import { LocateIcon, PinIcon, SearchIcon, XIcon } from '../icons.jsx';
import { Spinner } from '../ui.jsx';
import MapAttribution from './MapAttribution.jsx';

const REVERSE_DELAY = 1000;
const MIN_QUERY = 3;
const round6 = (x) => Number(x.toFixed(6));
const coordKey = (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; // server keshi bilan bir xil (~11 m)

export default function LocationPicker({ value, onChange, onReverse, wantAddress, className }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const userMarker = useRef(null);
  const { dark } = useTheme();
  const darkRef = useRef(dark);
  const cb = useRef({ onChange, onReverse, wantAddress });
  cb.current = { onChange, onReverse, wantAddress };
  const [moving, setMoving] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null | [] | [...]
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [resolving, setResolving] = useState(false);
  const reverseCtl = useRef(null);
  const reverseTimer = useRef(null);
  const lastReverse = useRef(''); // oxirgi so'ralgan koordinata kaliti
  const searchCtl = useRef(null);
  const searchCache = useRef(new Map()); // so'z → natijalar (bir sahifada qayta so'ralmaydi)
  const confirmed = !!value;

  const reverse = (p) => {
    clearTimeout(reverseTimer.current);
    if (cb.current.wantAddress?.() === false) return; // manzil qo'lda yozilgan — so'rash shart emas
    reverseTimer.current = setTimeout(async () => {
      const key = coordKey(p);
      if (key === lastReverse.current) return;
      lastReverse.current = key;
      reverseCtl.current?.abort();
      const ctl = new AbortController();
      reverseCtl.current = ctl;
      setResolving(true);
      try {
        const r = await api.geoReverse(p.lat, p.lng, ctl.signal);
        if (!ctl.signal.aborted && r) cb.current.onReverse?.(r);
      } catch {
        if (!ctl.signal.aborted) lastReverse.current = ''; // xato — keyingi surishda qayta urinsin; manzil qo'lda kiritiladi
      } finally {
        if (!ctl.signal.aborted) setResolving(false);
      }
    }, REVERSE_DELAY);
  };

  /** Foydalanuvchi tanlagan joyni yozadi (va kerak bo'lsa manzilini aniqlaydi). */
  const commit = (lat, lng, { withReverse = true } = {}) => {
    const p = { lat: round6(lat), lng: round6(lng) };
    cb.current.onChange?.(p);
    if (withReverse) reverse(p);
    else {
      clearTimeout(reverseTimer.current);
      lastReverse.current = coordKey(p);
    }
  };

  useEffect(() => {
    const start = value || TASHKENT;
    const map = createMap(boxRef.current, { center: start, zoom: value ? 16 : 12, dark: darkRef.current });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('movestart', (e) => {
      setMoving(true);
      if (e.originalEvent) setResults(null);
    });
    map.on('moveend', (e) => {
      setMoving(false);
      // Faqat foydalanuvchi harakati (surish, g'ildirak, +/- tugmalar — originalEvent bor). Dasturiy harakatlar
      // (boshlang'ich resize, qidiruv/joylashuvga uchish) joyni o'zi commit qiladi.
      if (!e.originalEvent) return;
      const c = map.getCenter();
      commit(c.lat, c.lng);
    });
    map.on('click', (e) => {
      commit(e.lngLat.lat, e.lngLat.lng);
      map.easeTo({ center: e.lngLat, duration: 400 });
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      clearTimeout(reverseTimer.current);
      reverseCtl.current?.abort();
      searchCtl.current?.abort();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || darkRef.current === dark) return;
    darkRef.current = dark;
    setMapStyle(mapRef.current, dark);
  }, [dark]);

  const search = async () => {
    const term = q.trim();
    if (term.length < MIN_QUERY || searching) return;
    const key = term.toLowerCase().replace(/\s+/g, ' ');
    setSearchError('');
    if (searchCache.current.has(key)) {
      setResults(searchCache.current.get(key));
      return;
    }
    searchCtl.current?.abort();
    const ctl = new AbortController();
    searchCtl.current = ctl;
    setSearching(true);
    try {
      const list = await api.geoSearch(term, ctl.signal);
      const arr = Array.isArray(list) ? list : [];
      searchCache.current.set(key, arr);
      if (!ctl.signal.aborted) setResults(arr);
    } catch (e) {
      if (e.name !== 'AbortError' && !ctl.signal.aborted) {
        setResults([]);
        setSearchError(e.status === 404 ? 'Manzil qidiruvi hozircha mavjud emas' : e.message);
      }
    } finally {
      if (!ctl.signal.aborted) setSearching(false);
    }
  };

  const flyTo = (p, zoom = 16.5) => mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom, duration: 900 });

  const pickResult = (r) => {
    haptic('select');
    setResults(null);
    setQ(r.name || r.display || '');
    const p = { lat: Number(r.lat), lng: Number(r.lng) };
    // Manzil — natijaning o'zidan (reverse so'rovi shart emas)
    commit(p.lat, p.lng, { withReverse: false });
    if (r.display) cb.current.onReverse?.({ display: String(r.display), district: '', city: '' });
    flyTo(p);
  };

  const locate = async () => {
    setGeoBusy(true);
    setGeoError('');
    try {
      const p = await getCurrentPosition();
      haptic('light');
      const map = mapRef.current;
      if (map) {
        if (!userMarker.current) userMarker.current = new maplibregl.Marker({ element: userDotElement() }).setLngLat([p.lng, p.lat]).addTo(map);
        else userMarker.current.setLngLat([p.lng, p.lat]);
      }
      commit(p.lat, p.lng);
      flyTo(p, 17);
    } catch (e) {
      setGeoError(GEO_MESSAGES[e.kind] || GEO_MESSAGES.timeout);
    } finally {
      setGeoBusy(false);
    }
  };

  const canSearch = q.trim().length >= MIN_QUERY;

  return (
    <div className={cx('space-y-3', className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        {/* type="text" + inputMode="search": brauzerning o'z × tugmasi chiqmaydi (o'zimizniki bor) */}
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setResults(null);
            setSearchError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            } else if (e.key === 'Escape') setResults(null);
          }}
          placeholder="Ko'cha, mahalla yoki mo'ljal"
          aria-label="Manzilni qidirish"
          className={cx(
            'w-full rounded-2xl border border-line bg-surface py-3 pl-12 text-base text-ink outline-none placeholder:text-ink-3 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15',
            canSearch ? 'pr-[148px]' : q ? 'pr-12' : 'pr-4',
          )}
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
          {q && !searching && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setResults(null);
                setSearchError('');
              }}
              aria-label="Qidiruvni tozalash"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
          {canSearch && (
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:opacity-80 dark:bg-emerald-500 dark:text-emerald-950"
            >
              {searching ? <Spinner className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" strokeWidth={2.4} />} Qidirish
            </button>
          )}
        </div>
        {results && (
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-3">{searchError || 'Hech narsa topilmadi. Xaritada qo\'lda belgilang.'}</p>
            ) : (
              <ul role="listbox" aria-label="Qidiruv natijalari">
                {results.map((r, i) => (
                  <li key={`${r.lat},${r.lng},${i}`}>
                    <button
                      type="button"
                      onClick={() => pickResult(r)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
                    >
                      <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{r.name || r.display}</span>
                        {r.display && r.display !== r.name && <span className="block truncate text-xs text-ink-3">{r.display}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="map-shell relative h-[320px] overflow-hidden rounded-3xl border border-line sm:h-[380px]">
        <div ref={boxRef} className="h-full w-full" role="application" aria-label="Joyni tanlash uchun xarita: surib, pinni kerakli joyga keltiring" />
        {/* Markazdagi pin: joy tanlanmaguncha kulrang */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-full">
          <div
            className={cx('transition duration-200', moving && '-translate-y-3 scale-105')}
            dangerouslySetInnerHTML={{ __html: pickPinSvg(confirmed || moving ? '#059669' : '#94a3b8') }}
          />
          <span className={cx('mx-auto -mt-1 block h-1.5 w-4 rounded-full bg-black/30 blur-[1px] transition', moving ? 'scale-75 opacity-60' : '')} />
        </div>
        <div
          className={cx(
            'absolute left-3 top-3 z-[3] max-w-[70%] rounded-xl px-3 py-1.5 text-xs font-semibold shadow backdrop-blur',
            confirmed ? 'bg-surface/90 text-ink-2' : 'bg-amber-50/95 text-amber-900 ring-1 ring-amber-200 dark:bg-slate-900/90 dark:text-amber-200 dark:ring-amber-400/30',
          )}
        >
          {resolving ? 'Manzil aniqlanmoqda…' : confirmed ? 'Xaritani suring — pin markazda' : 'Xaritani surib joyni tanlang'}
        </div>
        <button
          type="button"
          onClick={locate}
          disabled={geoBusy}
          className="absolute bottom-8 left-3 z-[3] inline-flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5 text-sm font-bold text-ink shadow-lift ring-1 ring-line transition active:scale-95 disabled:opacity-70"
        >
          {geoBusy ? <Spinner className="text-sky-600" /> : <LocateIcon className="h-4 w-4 text-sky-600" />} Mening joyim
        </button>
        <MapAttribution />
      </div>
      {geoError && (
        <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          {geoError}
        </p>
      )}
      <p className="text-xs font-medium text-ink-3 tabular">
        {value ? `Koordinata: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Joy hali tanlanmagan'}
      </p>
    </div>
  );
}
