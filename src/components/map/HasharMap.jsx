// Asosiy xarita: klasterlar (GeoJSON cluster), HTML pinlar, popup, foydalanuvchi joylashuvi, fitBounds.
// Tungi rejimda OpenFreeMap "dark" uslubi; uslub almashganda qatlamlar qayta qo'shiladi.
// getPadding() — xarita ustidagi panellar (filtrlar, pastki panel) egallagan joy: barcha kamera harakatlari
// nuqtani shu panellar orasidagi ko'rinadigan qismga keltiradi.
import { useEffect, useRef } from 'react';
import { mediaUrl } from '../../lib/config.js';
import { createMap, fitTo, maplibregl, padOffset, pinElement, setMapStyle, toGeoJSON, userDotElement } from '../../lib/map.js';
import { useTheme } from '../../lib/theme.jsx';
import { cx, formatDateTime, statusOf, volunteersLabel } from '../../lib/utils.js';
import MapAttribution from './MapAttribution.jsx';

const SRC = 'hashars';
const CLUSTER_MAX_ZOOM = 14;
const SELECT_ZOOM = CLUSTER_MAX_ZOOM + 1; // tanlangan nuqta klaster ichida qolmasin

function addLayers(map, data) {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: 'geojson', data, cluster: true, clusterRadius: 52, clusterMaxZoom: CLUSTER_MAX_ZOOM });
  map.addLayer({
    id: 'cluster-halo',
    type: 'circle',
    source: SRC,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#10b981',
      'circle-opacity': 0.22,
      'circle-radius': ['step', ['get', 'point_count'], 26, 10, 32, 50, 40],
    },
  });
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: SRC,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#059669', 10, '#047857', 50, '#065f46'],
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 23, 50, 29],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: SRC,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 14,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  });
}

/** Popup tarkibi (foydalanuvchi matni faqat textContent orqali). */
function popupContent(h, onOpen) {
  const root = document.createElement('div');
  root.className = 'mpop';
  const img = mediaUrl(h.after_url || h.before_url);
  if (img) {
    const im = document.createElement('img');
    im.className = 'mpop__img';
    im.src = img;
    im.alt = '';
    root.appendChild(im);
  }
  const body = document.createElement('div');
  body.className = 'mpop__body';
  const chip = document.createElement('span');
  const st = statusOf(h);
  chip.className = `mpop__chip ${st === 'COMPLETED' ? 'is-done' : st === 'PAST' ? 'is-past' : 'is-pending'}`;
  chip.textContent = st === 'COMPLETED' ? '✓ Bajarildi' : st === 'PAST' ? "● O'tib ketgan" : '● Kutilmoqda';
  const title = document.createElement('div');
  title.className = 'mpop__title';
  title.textContent = h.title;
  const meta = document.createElement('div');
  meta.className = 'mpop__meta';
  meta.textContent = `${formatDateTime(h.date_time)} · ${volunteersLabel(h.volunteer_count)}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mpop__btn';
  btn.textContent = 'Batafsil ko\'rish →';
  btn.addEventListener('click', () => onOpen?.(h.id));
  body.append(chip, title, meta, btn);
  root.appendChild(body);
  return root;
}

export default function HasharMap({
  hashars = [],
  selectedId,
  highlightId = null,
  onSelect,
  onOpen,
  userPos,
  className,
  attributionClassName,
  getPadding,
  fitPadding = 64,
  popups = true,
  initialFit = true,
  controls = true,
}) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> { marker, el }
  const popupRef = useRef(null);
  const userMarkerRef = useRef(null);
  const dataRef = useRef(hashars);
  const cbRef = useRef({ onSelect, onOpen, getPadding, popups });
  cbRef.current = { onSelect, onOpen, getPadding, popups };
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const highlightRef = useRef(highlightId);
  highlightRef.current = highlightId;
  const pad = () => (cbRef.current.getPadding ? cbRef.current.getPadding() : fitPadding);
  dataRef.current = hashars;
  const byId = useRef(new Map());
  byId.current = new Map(hashars.map((h) => [h.id, h]));
  const { dark } = useTheme();
  const darkRef = useRef(dark);
  const fittedKey = useRef('');

  const showPopup = (h) => {
    const map = mapRef.current;
    if (!map || !h) return;
    popupRef.current?.remove();
    popupRef.current = null;
    if (!cbRef.current.popups) return; // mobil: popup o'rniga pastki karuseldagi karta
    popupRef.current = new maplibregl.Popup({ offset: [0, -40], maxWidth: '270px', closeButton: true, focusAfterOpen: false })
      .setLngLat([h.lng, h.lat])
      .setDOMContent(popupContent(h, (id) => cbRef.current.onOpen?.(id)))
      .addTo(map);
  };

  // ---- Yaratish (bir marta) ----
  useEffect(() => {
    const map = createMap(boxRef.current, { dark: darkRef.current, zoom: 10.5 });
    mapRef.current = map;
    if (controls) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const syncMarkers = () => {
      if (!map.getSource(SRC) || !map.isSourceLoaded(SRC)) return;
      const seen = new Set();
      for (const f of map.querySourceFeatures(SRC)) {
        if (f.properties.cluster) continue;
        const id = Number(f.properties.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const h = byId.current.get(id);
        if (!h) continue;
        const kind = statusOf(h);
        let entry = markersRef.current.get(id);
        if (!entry || entry.status !== kind) {
          entry?.marker.remove();
          // Klasterdan endi chiqqan pin ham tanlangan/belgilangan holatini olsin
          const el = pinElement(kind, { label: h.title, selected: id === selectedRef.current });
          if (id === highlightRef.current) el.classList.add('is-hover');
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            cbRef.current.onSelect?.(id);
            showPopup(byId.current.get(id));
          });
          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([h.lng, h.lat]).addTo(map);
          entry = { marker, el, status: kind };
          markersRef.current.set(id, entry);
        }
      }
      for (const [id, entry] of markersRef.current) {
        if (!seen.has(id)) {
          entry.marker.remove();
          markersRef.current.delete(id);
        }
      }
    };

    map.on('style.load', () => addLayers(map, toGeoJSON(dataRef.current)));
    map.on('render', syncMarkers);
    map.on('click', 'clusters', async (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      if (!f) return;
      try {
        const zoom = await map.getSource(SRC).getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.3, offset: padOffset(pad()) });
      } catch {
        /* e'tiborsiz */
      }
    });
    map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Tungi/yorug' uslub ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || darkRef.current === dark) return;
    darkRef.current = dark;
    setMapStyle(map, dark);
  }, [dark]);

  // ---- Ma'lumot o'zgarganda ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(SRC);
      if (src) src.setData(toGeoJSON(hashars));
      const key = hashars.map((h) => h.id).join(',');
      if (initialFit && key !== fittedKey.current && hashars.length) {
        const first = fittedKey.current === '';
        fittedKey.current = key;
        fitTo(map, hashars, { padding: pad(), animate: !first });
      }
    };
    if (map.isStyleLoaded() && map.getSource(SRC)) apply();
    else map.once('idle', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hashars, initialFit]);

  // ---- Tanlangan pin ----
  useEffect(() => {
    markersRef.current.forEach((entry, id) => entry.el.classList.toggle('is-selected', id === selectedId));
    const map = mapRef.current;
    const h = selectedId != null ? byId.current.get(selectedId) : null;
    if (!map || !h) {
      if (selectedId == null) popupRef.current?.remove();
      return;
    }
    map.easeTo({ center: [h.lng, h.lat], zoom: Math.max(map.getZoom(), SELECT_ZOOM), offset: padOffset(pad()), duration: 600 });
    showPopup(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ---- Ro'yxatda kursor ostidagi hashar: faqat pin belgilanadi (kamera qimirlamaydi, popup ochilmaydi) ----
  useEffect(() => {
    markersRef.current.forEach((entry, id) => entry.el.classList.toggle('is-hover', id === highlightId));
  }, [highlightId]);

  // ---- Popup o'chirilsa (mobil o'lcham) — ochiq popup yopiladi ----
  useEffect(() => {
    if (!popups) {
      popupRef.current?.remove();
      popupRef.current = null;
    }
  }, [popups]);

  // ---- Foydalanuvchi joylashuvi ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userPos) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (!userMarkerRef.current) userMarkerRef.current = new maplibregl.Marker({ element: userDotElement() }).setLngLat([userPos.lng, userPos.lat]).addTo(map);
    else userMarkerRef.current.setLngLat([userPos.lng, userPos.lat]);
    map.easeTo({ center: [userPos.lng, userPos.lat], zoom: Math.max(map.getZoom(), 13), offset: padOffset(pad()), duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  return (
    <div className={cx('map-shell relative h-full w-full overflow-hidden', className)}>
      <div ref={boxRef} className="h-full w-full" role="region" aria-label="Hasharlar xaritasi" />
      <MapAttribution className={attributionClassName} />
    </div>
  );
}
