// "Oldin / Keyin" taqqoslash slayderi.
// Pastda "keyin" rasmi, ustida "oldin" rasmi clip-path bilan qirqiladi.
// Ustidagi shaffof <input type=range> sichqoncha, sensor va klaviaturani (← →) qo'llaydi.
import { useState } from 'react';
import { cx } from '../lib/utils.js';
import { ChevronLeftIcon, ChevronRightIcon } from './icons.jsx';

export default function BeforeAfterSlider({ before, after, alt = '', className }) {
  const [pos, setPos] = useState(50);
  return (
    <div className={cx('ba-slider relative aspect-[16/10] select-none overflow-hidden rounded-2xl bg-slate-200', className)}>
      <img src={after} alt={`${alt} — keyin`} className="absolute inset-0 h-full w-full object-cover" draggable={false} loading="lazy" />
      <img
        src={before}
        alt={`${alt} — oldin`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
        loading="lazy"
      />
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
        Oldin
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
        Keyin
      </span>

      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(0,0,0,.35)]" style={{ left: `${pos}%` }}>
        <div className="ba-handle absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-800 shadow-lg ring-1 ring-slate-200">
          <ChevronLeftIcon className="-mr-1 h-4 w-4" strokeWidth={2.6} />
          <ChevronRightIcon className="-ml-1 h-4 w-4" strokeWidth={2.6} />
        </div>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Oldin va keyin rasmlarini solishtirish"
        aria-valuetext={`Oldin ${pos}%, keyin ${100 - pos}%`}
        className="ba-range absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
