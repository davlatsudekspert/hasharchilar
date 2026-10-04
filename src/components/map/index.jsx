// Xarita komponentlari — lazy (MapLibre ~800 KB faqat kerak bo'lganda yuklanadi).
import { lazy, Suspense } from 'react';
import { cx } from '../../lib/utils.js';
import { MapIcon } from '../icons.jsx';

const HasharMapLazy = lazy(() => import('./HasharMap.jsx'));
const MiniMapLazy = lazy(() => import('./MiniMap.jsx'));
const LocationPickerLazy = lazy(() => import('./LocationPicker.jsx'));

function MapFallback({ className }) {
  return (
    <div className={cx('skeleton relative grid place-items-center overflow-hidden', className)} aria-label="Xarita yuklanmoqda" role="status">
      <span className="flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1.5 text-xs font-bold text-ink-3 backdrop-blur">
        <MapIcon className="h-4 w-4" /> Xarita yuklanmoqda…
      </span>
    </div>
  );
}

export function HasharMap(props) {
  return (
    <Suspense fallback={<MapFallback className={cx('h-full w-full', props.className)} />}>
      <HasharMapLazy {...props} />
    </Suspense>
  );
}

export function MiniMap(props) {
  return (
    <Suspense fallback={<MapFallback className={props.className} />}>
      <MiniMapLazy {...props} />
    </Suspense>
  );
}

export function LocationPicker(props) {
  return (
    <Suspense fallback={<MapFallback className="h-[380px] rounded-3xl" />}>
      <LocationPickerLazy {...props} />
    </Suspense>
  );
}
