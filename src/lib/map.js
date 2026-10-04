// Leaflet umumiy sozlamalari: plitkalar va FAQAT L.divIcon pinlar
// (standart marker PNG'lari bundle qilingan build'da buziladi).
import L from 'leaflet';

// OpenStreetMap standart plitkalari — kalit talab qilmaydi (CARTO endi API kalit so'raydi).
// OSM qoidasi: atributsiya ko'rinib tursin va so'rovda Referer bo'lsin (APK'da User-Agent'ga
// ilova nomi qo'shiladi — capacitor.config.json → android.appendUserAgent).
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> hissadorlari';

export const COLORS = { PENDING: '#f59e0b', COMPLETED: '#059669', PICK: '#059669' };

/** Plitka qatlamini xaritaga qo'shadi. */
export function addTiles(map) {
  return L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    // Brauzer standarti allaqachon origin'ni yuboradi; aniq yozib qo'yamiz (OSM Referer talab qiladi)
    referrerPolicy: 'strict-origin-when-cross-origin',
  }).addTo(map);
}

// Pin ichidagi belgi: kutilayotgan — nuqta, bajarilgan — ✓
const GLYPH = {
  dot: '<circle cx="16" cy="15" r="5" fill="#fff"/>',
  check: '<path d="M11 15.5l3.3 3.3L21 12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
};

/**
 * Tomchi shaklidagi pin (SVG divIcon).
 * @param {'PENDING'|'COMPLETED'|'PICK'} kind
 * @param {boolean} selected — tanlangan pin kattaroq
 */
export function pinIcon(kind, selected = false) {
  const size = selected ? 46 : 34;
  const h = Math.round(size * 1.25);
  const color = COLORS[kind] || COLORS.PENDING;
  const glyph = kind === 'COMPLETED' ? GLYPH.check : GLYPH.dot;
  return L.divIcon({
    className: `hashar-pin${selected ? ' is-selected' : ''}`,
    iconSize: [size, h],
    iconAnchor: [size / 2, h - 1],
    popupAnchor: [0, -h + 6],
    html: `<svg width="${size}" height="${h}" viewBox="0 0 32 40" aria-hidden="true">
      <path d="M16 39s13-12.4 13-23A13 13 0 0 0 3 16c0 10.6 13 23 13 23Z" fill="${color}" stroke="#fff" stroke-width="2.5"/>
      ${glyph}
    </svg>`,
  });
}

/** Foydalanuvchi joylashuvi nuqtasi (pulsatsiyali). */
export const userDotIcon = () =>
  L.divIcon({
    className: 'user-dot',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: '<span class="user-dot__pulse"></span><span class="user-dot__core"></span>',
  });
