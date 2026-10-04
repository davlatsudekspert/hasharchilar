// Kichik xarita: bitta pin (hashar sahifasi). Statik (interaktiv emas) — sahifa aylantirishga xalaqit bermaydi.
import { useEffect, useRef } from 'react';
import { COLORS, createMap, maplibregl, pinElement, setMapStyle } from '../../lib/map.js';
import { useTheme } from '../../lib/theme.jsx';
import { cx } from '../../lib/utils.js';
import MapAttribution from './MapAttribution.jsx';

export default function MiniMap({ lat, lng, status = 'PENDING', className, zoom = 14.5 }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const { dark } = useTheme();
  const darkRef = useRef(dark);

  useEffect(() => {
    const map = createMap(boxRef.current, { center: { lat, lng }, zoom, dark: darkRef.current, interactive: false });
    mapRef.current = map;
    const el = pinElement(status in COLORS ? status : 'PENDING');
    el.tabIndex = -1;
    new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [lat, lng, status, zoom]);

  useEffect(() => {
    if (!mapRef.current || darkRef.current === dark) return;
    darkRef.current = dark;
    setMapStyle(mapRef.current, dark);
  }, [dark]);

  return (
    <div className={cx('map-shell relative overflow-hidden', className)}>
      <div ref={boxRef} className="h-full w-full" aria-hidden="true" />
      <MapAttribution />
    </div>
  );
}
