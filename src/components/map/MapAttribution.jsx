// Xarita atributsiyasi — doim ko'rinadi (OpenFreeMap / OpenMapTiles / OpenStreetMap talabi). Ranglar mavzu
// o'zgaruvchilaridan (surface / ink-2): har bir aksent va tungi rejimga mos.
import { cx } from '../../lib/utils.js';

export default function MapAttribution({ className }) {
  const a = 'hover:underline';
  return (
    <div
      className={cx(
        'pointer-events-auto absolute bottom-1 right-1 z-[2] max-w-[calc(100%-8px)] truncate rounded-md bg-surface/85 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-ink-2 backdrop-blur',
        className,
      )}
    >
      <a className={a} href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">
        © OpenFreeMap
      </a>{' '}
      <a className={a} href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">
        © OpenMapTiles
      </a>{' '}
      <a className={a} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
        © OpenStreetMap
      </a>
    </div>
  );
}
