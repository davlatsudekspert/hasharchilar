// Mini xarita: bosilgan joyni tanlaydi (divIcon pin, sudrab ko'chirish mumkin) + "Mening joylashuvim".
import { useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import { addTiles, pinIcon } from '../lib/map.js';
import { TASHKENT, geoErrorKind } from '../lib/utils.js';
import { LocateIcon, PinIcon, PlusIcon } from './icons.jsx';
import { Spinner } from './ui.jsx';

const round6 = (n) => Math.round(n * 1e6) / 1e6;

const GEO_ERRORS = {
  denied: "Joylashuvga ruxsat berilmadi — xaritadan qo'lda belgilang",
  unavailable: "Joylashuv xizmati o'chiq — telefon sozlamalarida GPS ni yoqing yoki xaritadan belgilang",
  timeout: "Joylashuvni aniqlab bo'lmadi — qayta urinib ko'ring yoki xaritadan belgilang",
};

export default function LocationPicker({ value, onChange, center }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const hintId = useId();

  const emit = (latlng) => onChangeRef.current({ lat: round6(latlng.lat), lng: round6(latlng.lng) });

  const place = (latlng) => {
    if (marker.current) {
      marker.current.setLatLng(latlng);
      return;
    }
    marker.current = L.marker(latlng, { icon: pinIcon('PICK', true), draggable: true, keyboard: false }).addTo(map.current);
    marker.current.on('dragend', () => emit(marker.current.getLatLng()));
  };

  useEffect(() => {
    const start = value || center || TASHKENT;
    const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([start.lat, start.lng], value ? 16 : 12);
    m.attributionControl.setPrefix(false);
    addTiles(m);
    map.current = m;
    if (value) place([value.lat, value.lng]);
    m.on('click', (e) => {
      place(e.latlng);
      emit(e.latlng);
    });
    // Modal animatsiyasidan keyin o'lchamni qayta hisoblash
    const t = setTimeout(() => m.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      m.remove();
      marker.current = null;
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Qurilmangiz joylashuvni aniqlay olmaydi');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (!map.current) return;
        const ll = L.latLng(p.coords.latitude, p.coords.longitude);
        place(ll);
        map.current.setView(ll, 16);
        emit(ll);
      },
      (err) => {
        setLocating(false);
        setGeoError(GEO_ERRORS[geoErrorKind(err)]);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  // Klaviatura (yoki geolokatsiyasiz) yo'li: pin xarita markaziga qo'yiladi (strelkalar bilan suriladi)
  const pickCenter = () => {
    if (!map.current) return;
    const ll = map.current.getCenter();
    place(ll);
    emit(ll);
  };

  return (
    <div>
      <div className="group relative">
        <div
          ref={el}
          role="application"
          aria-label="Joyni tanlash xaritasi"
          aria-describedby={hintId}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === el.current) {
              e.preventDefault();
              pickCenter();
            }
          }}
          className="map-root isolate h-60 w-full overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200 sm:h-72"
        />
        <span id={hintId} className="sr-only">
          Strelkalar bilan xaritani suring, Enter — xarita markazini hashar joyi sifatida belgilash
        </span>
        {/* Markaz belgisi — faqat klaviatura fokusida ko'rinadi */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-[450] hidden -translate-x-1/2 -translate-y-1/2 text-slate-800 group-has-[:focus-visible]:block"
        >
          <PlusIcon className="h-7 w-7" strokeWidth={2.5} />
        </span>
        <button
          type="button"
          onClick={pickCenter}
          aria-label="Xarita markazini hashar joyi sifatida belgilash"
          title="Markazni belgilash"
          className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-emerald-50"
        >
          <PinIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Markazni belgilash</span>
        </button>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="absolute bottom-3 left-3 z-[500] inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-emerald-800 shadow-lg ring-1 ring-slate-200 transition hover:bg-emerald-50 disabled:opacity-70"
        >
          {locating ? <Spinner /> : <LocateIcon className="h-4 w-4" />}
          Mening joylashuvim
        </button>
      </div>
      <p className={`mt-2 flex items-center gap-1.5 text-sm ${value ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>
        <PinIcon className="h-4 w-4 shrink-0" />
        {value ? `Joy belgilandi: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Hashar joyini belgilash uchun xaritaga bosing'}
      </p>
      {geoError && <p className="mt-1 text-sm font-medium text-amber-700">{geoError}</p>}
    </div>
  );
}
