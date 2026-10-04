// MapLibre GL + OpenFreeMap (kalitsiz vektor xarita). Bu modul faqat xarita komponentlari
// orqali dinamik yuklanadi — bosh sahifa bundle'iga kirmaydi.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export { maplibregl };

export const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
export const styleUrl = (dark) => (dark ? STYLE_DARK : STYLE_LIGHT);

export const COLORS = { PENDING: '#f59e0b', COMPLETED: '#059669' };
export const TASHKENT = { lat: 41.3111, lng: 69.2797 };

/** Xarita yaratadi (aylantirish o'chiq — mobil uchun qulay). */
export function createMap(container, { center = TASHKENT, zoom = 11, dark = false, interactive = true } = {}) {
  const map = new maplibregl.Map({
    container,
    style: styleUrl(dark),
    center: [center.lng, center.lat],
    zoom,
    interactive,
    attributionControl: false, // atributsiya o'zimizning doim ko'rinadigan yorlig'imizda (MapAttribution)
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
    fadeDuration: 150,
  });
  // Tarmoq xatolari (oflayn, plitka yuklanmadi) konsolni to'ldirmasin — xarita keyin o'zi qayta urinadi
  map.on('error', (e) => {
    if (import.meta.env.DEV && !/fetch|network|AJAX/i.test(String(e && e.error && e.error.message))) console.warn('map', e.error);
  });
  if (interactive) {
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation?.();
  }
  return map;
}

/** Tomchi shaklidagi pin elementi. */
export function pinElement(kind, { selected = false, label } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `hpin${selected ? ' is-selected' : ''}`;
  if (label) el.setAttribute('aria-label', label);
  const color = COLORS[kind] || COLORS.PENDING;
  const glyph =
    kind === 'COMPLETED'
      ? '<path d="M11 15.5l3.3 3.3L21 12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<circle cx="16" cy="15" r="5.2" fill="#fff"/>';
  el.innerHTML = `<svg width="34" height="43" viewBox="0 0 32 40" aria-hidden="true"><path d="M16 39s13-12.4 13-23A13 13 0 0 0 3 16c0 10.6 13 23 13 23Z" fill="${color}" stroke="#fff" stroke-width="2.5"/>${glyph}</svg>`;
  return el;
}

/** Tanlash pini (yaratish sahifasi, mini xarita). */
export function pickPinSvg(color = '#059669') {
  return `<svg width="44" height="56" viewBox="0 0 32 40" aria-hidden="true"><path d="M16 39s13-12.4 13-23A13 13 0 0 0 3 16c0 10.6 13 23 13 23Z" fill="${color}" stroke="#fff" stroke-width="2.5"/><circle cx="16" cy="15" r="5.2" fill="#fff"/></svg>`;
}

/** Foydalanuvchi joylashuvi nuqtasi. */
export function userDotElement() {
  const el = document.createElement('div');
  el.className = 'user-dot';
  el.setAttribute('aria-label', 'Sizning joylashuvingiz');
  el.innerHTML = '<span class="user-dot__pulse"></span><span class="user-dot__core"></span>';
  return el;
}

/** Hasharlar → GeoJSON. */
export function toGeoJSON(hashars) {
  return {
    type: 'FeatureCollection',
    features: hashars
      .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng))
      .map((h) => ({
        type: 'Feature',
        id: h.id,
        geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
        properties: { id: h.id, status: h.status },
      })),
  };
}

/** Barcha nuqtalarni ko'rsatadigan qilib xaritani joylashtiradi. */
export function fitTo(map, points, { padding = 56, maxZoom = 14, animate = true } = {}) {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return;
  if (pts.length === 1) {
    map.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: Math.min(maxZoom, 14), duration: animate ? 600 : 0 });
    return;
  }
  const b = new maplibregl.LngLatBounds();
  pts.forEach((p) => b.extend([p.lng, p.lat]));
  map.fitBounds(b, { padding, maxZoom, duration: animate ? 700 : 0 });
}
