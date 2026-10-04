// Asosiy xarita: pinlar (PENDING amber / COMPLETED emerald), popup, tanlangan pin, foydalanuvchi joyi.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { addTiles, pinIcon, userDotIcon } from '../lib/map.js';
import { TASHKENT, distanceKm, formatDateTime, volunteersLabel } from '../lib/utils.js';

/** Popup DOM elementi — faqat textContent (XSS dan xavfsiz, innerHTML yo'q). */
function buildPopup(h, { onJoin, onOpen }) {
  const el = document.createElement('div');
  el.className = 'map-popup';

  const title = document.createElement('div');
  title.className = 'map-popup__title';
  title.textContent = h.title;

  const meta = document.createElement('div');
  meta.className = 'map-popup__meta';
  const date = document.createElement('span');
  date.textContent = formatDateTime(h.date_time);
  const vols = document.createElement('span');
  vols.textContent = volunteersLabel(h.volunteer_count);
  meta.append(date, vols);

  const actions = document.createElement('div');
  actions.className = 'map-popup__actions';

  const join = document.createElement('button');
  join.type = 'button';
  if (h.status === 'COMPLETED') {
    join.textContent = 'Yakunlangan';
    join.disabled = true;
    join.className = 'map-popup__btn is-muted';
  } else if (h.joined) {
    join.textContent = '✓ Qatnashasiz';
    join.disabled = true;
    join.className = 'map-popup__btn is-joined';
  } else {
    join.textContent = 'Qatnashish';
    join.className = 'map-popup__btn';
    join.addEventListener('click', () => onJoin(h.id));
  }

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'map-popup__link';
  more.textContent = 'Batafsil';
  more.addEventListener('click', () => onOpen(h.id));

  actions.append(join, more);
  el.append(title, meta, actions);
  return el;
}

export default function MapView({ hashars, selectedId, userPos, onSelect, onJoin, onOpen, className = '' }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const markers = useRef(new Map()); // id → L.Marker
  const data = useRef(new Map()); // id → HasharDTO (popup uchun eng so'nggi ma'lumot)
  const fittedKey = useRef('');
  const cb = useRef({});
  cb.current = { onSelect, onJoin, onOpen };

  // Xaritani bir marta yaratamiz
  useEffect(() => {
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView(
      [TASHKENT.lat, TASHKENT.lng],
      11,
    );
    m.attributionControl.setPrefix(false);
    addTiles(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;

    // Konteyner o'lchami o'zgarsa (tab, ekran burilishi) — qayta hisoblash
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize()) : null;
    ro?.observe(el.current);
    const markersMap = markers.current;
    return () => {
      ro?.disconnect();
      m.remove();
      markersMap.clear();
      map.current = null;
    };
  }, []);

  // Pinlarni farq bo'yicha yangilash (popup ochiq bo'lsa ham yopilmaydi)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ids = new Set(hashars.map((h) => h.id));
    data.current = new Map(hashars.map((h) => [h.id, h]));

    markers.current.forEach((mk, id) => {
      if (!ids.has(id)) {
        layer.current.removeLayer(mk);
        markers.current.delete(id);
      }
    });

    hashars.forEach((h) => {
      let mk = markers.current.get(h.id);
      const selected = h.id === selectedId;
      if (!mk) {
        mk = L.marker([h.lat, h.lng], {
          icon: pinIcon(h.status, selected),
          keyboard: true,
          title: h.title,
          alt: h.title,
          riseOnHover: true,
        });
        mk.bindPopup(
          () =>
            buildPopup(data.current.get(h.id) || h, {
              onJoin: (id) => cb.current.onJoin(id),
              onOpen: (id) => {
                m.closePopup();
                cb.current.onOpen(id);
              },
            }),
          { closeButton: true, autoPanPadding: [24, 24], minWidth: 220, maxWidth: 280 },
        );
        mk.on('click', () => cb.current.onSelect(h.id));
        mk.addTo(layer.current);
        mk._hs = { status: h.status, selected };
        markers.current.set(h.id, mk);
      } else {
        mk.setLatLng([h.lat, h.lng]);
        if (mk._hs.status !== h.status || mk._hs.selected !== selected) {
          mk.setIcon(pinIcon(h.status, selected));
          mk._hs = { status: h.status, selected };
        }
        if (mk.isPopupOpen()) mk.getPopup().update();
      }
      mk.setZIndexOffset(selected ? 1000 : h.status === 'PENDING' ? 100 : 0);
    });

    // Ko'rinadigan hasharlar to'plami o'zgarsa — hammasini sig'diramiz.
    // Joylashuv keyinroq kelsa ham bir marta qayta sig'diriladi (foydalanuvchi nuqtasi ko'rinsin).
    const key = [...ids].sort().join(',') + (userPos ? '|u' : '');
    if (ids.size && key !== fittedKey.current) {
      fittedKey.current = key;
      const bounds = L.latLngBounds(hashars.map((h) => [h.lat, h.lng]));
      // Foydalanuvchi yaqin bo'lsa (≤ 30 km) — u ham ko'rinsin
      if (userPos && distanceKm(userPos, bounds.getCenter()) <= 30) bounds.extend([userPos.lat, userPos.lng]);
      m.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: false });
    }
  }, [hashars, selectedId, userPos]);

  // Tanlangan hasharga uchish va popupni ochish
  useEffect(() => {
    const m = map.current;
    const mk = markers.current.get(selectedId);
    if (!m || !mk) return;
    const ll = mk.getLatLng();
    if (!m.getBounds().pad(-0.15).contains(ll)) m.panTo(ll, { animate: true });
    mk.openPopup();
  }, [selectedId]);

  // Foydalanuvchi joylashuvi
  useEffect(() => {
    const m = map.current;
    if (!m || !userPos) return;
    const dot = L.marker([userPos.lat, userPos.lng], {
      icon: userDotIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 2000,
    }).addTo(m);
    return () => dot.remove();
  }, [userPos]);

  return (
    <div
      ref={el}
      role="region"
      aria-label="Hasharlar xaritasi"
      className={`map-root isolate h-[340px] w-full overflow-hidden rounded-2xl bg-slate-200 shadow-sm ring-1 ring-slate-200 lg:h-[600px] ${className}`}
    />
  );
}
