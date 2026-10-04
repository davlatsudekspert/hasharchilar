// Joy tanlash: markazdagi pin + xaritani surish, manzil qidirish (/api/geo/search),
// pin to'xtaganda manzilni aniqlash (/api/geo/reverse), "Mening joyim".
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { createMap, maplibregl, pickPinSvg, styleUrl, TASHKENT, userDotElement } from '../../lib/map.js';
import { GEO_MESSAGES, getCurrentPosition, haptic } from '../../lib/native.js';
import { useTheme } from '../../lib/theme.jsx';
import { cx } from '../../lib/utils.js';
import { LocateIcon, PinIcon, SearchIcon, XIcon } from '../icons.jsx';
import { Spinner } from '../ui.jsx';
import MapAttribution from './MapAttribution.jsx';

export default function LocationPicker({ value, onChange, onReverse, className }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const userMarker = useRef(null);
  const { dark } = useTheme();
  const darkRef = useRef(dark);
  const cb = useRef({ onChange, onReverse });
  cb.current = { onChange, onReverse };
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

  const reverse = (lat, lng) => {
    clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(async () => {
      reverseCtl.current?.abort();
      const ctl = new AbortController();
      reverseCtl.current = ctl;
      setResolving(true);
      try {
        const r = await api.geoReverse(lat, lng, ctl.signal);
        if (!ctl.signal.aborted && r) cb.current.onReverse?.(r);
      } catch {
        /* geo xizmati ishlamasa — manzil qo'lda kiritiladi */
      } finally {
        if (!ctl.signal.aborted) setResolving(false);
      }
    }, 450);
  };

  useEffect(() => {
    const start = value || TASHKENT;
    const map = createMap(boxRef.current, { center: start, zoom: value ? 16 : 12, dark: darkRef.current });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('movestart', () => setMoving(true));
    map.on('moveend', () => {
      setMoving(false);
      const c = map.getCenter();
      const p = { lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) };
      cb.current.onChange?.(p);
      reverse(p.lat, p.lng);
    });
    map.on('click', (e) => map.easeTo({ center: e.lngLat, duration: 400 }));
    map.once('load', () => {
      const c = map.getCenter();
      cb.current.onChange?.({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) });
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      clearTimeout(reverseTimer.current);
      reverseCtl.current?.abort();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || darkRef.current === dark) return;
    darkRef.current = dark;
    mapRef.current.setStyle(styleUrl(dark));
  }, [dark]);

  // Qidiruv (debounce 400ms)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults(null);
      setSearchError('');
      return undefined;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const list = await api.geoSearch(term, ctl.signal);
        setResults(Array.isArray(list) ? list : []);
      } catch (e) {
        if (e.name !== 'AbortError') {
          setResults([]);
          setSearchError(e.status === 404 ? 'Manzil qidiruvi hozircha mavjud emas' : e.message);
        }
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const flyTo = (p, zoom = 16.5) => mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom, duration: 900 });

  const pickResult = (r) => {
    haptic('select');
    setResults(null);
    setQ(r.name || r.display || '');
    flyTo({ lat: Number(r.lat), lng: Number(r.lng) });
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
      flyTo(p, 17);
    } catch (e) {
      setGeoError(GEO_MESSAGES[e.kind] || GEO_MESSAGES.timeout);
    } finally {
      setGeoBusy(false);
    }
  };

  return (
    <div className={cx('space-y-3', className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Manzilni qidiring: ko'cha, mahalla, mo'ljal…"
          aria-label="Manzilni qidirish"
          className="w-full rounded-2xl border border-line bg-surface py-3 pl-12 pr-11 text-base text-ink outline-none placeholder:text-ink-3 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
        />
        {searching ? (
          <Spinner className="absolute right-4 top-1/2 -mt-2 text-emerald-600" />
        ) : (
          q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Qidiruvni tozalash"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )
        )}
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
        {/* Markazdagi pin */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-full">
          <div className={cx('transition-transform duration-200', moving ? '-translate-y-3 scale-105' : '')} dangerouslySetInnerHTML={{ __html: pickPinSvg() }} />
          <span className={cx('mx-auto -mt-1 block h-1.5 w-4 rounded-full bg-black/30 blur-[1px] transition', moving ? 'scale-75 opacity-60' : '')} />
        </div>
        <div className="absolute left-3 top-3 z-[3] max-w-[70%] rounded-xl bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink-2 shadow backdrop-blur">
          {resolving ? 'Manzil aniqlanmoqda…' : 'Xaritani suring — pin markazda'}
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
      {value && (
        <p className="text-xs font-medium text-ink-3 tabular">
          Koordinata: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
