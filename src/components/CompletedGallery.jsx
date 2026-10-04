// Bajarilgan hasharlar galereyasi — har birida Oldin/Keyin slayderi.
import { mediaUrl } from '../lib/config.js';
import { formatDay, volunteersLabel } from '../lib/utils.js';
import BeforeAfterSlider from './BeforeAfterSlider.jsx';
import { CheckIcon, ImageIcon, PinIcon, SparklesIcon, UsersIcon } from './icons.jsx';
import { EmptyState } from './ui.jsx';

function GalleryCard({ hashar: h, onOpen }) {
  const before = mediaUrl(h.before_url);
  const after = mediaUrl(h.after_url);
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="p-2.5 pb-0">
        {before && after ? (
          <BeforeAfterSlider before={before} after={after} alt={h.title} className="rounded-xl" />
        ) : before || after ? (
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-100">
            <img src={after || before} alt={h.title} loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute left-3 top-3 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold uppercase text-white">
              {after ? 'Keyin' : 'Oldin'}
            </span>
          </div>
        ) : (
          <div className="grid aspect-[16/10] place-items-center rounded-xl bg-slate-100 text-slate-400">
            <span className="flex flex-col items-center gap-1 text-sm font-medium">
              <ImageIcon className="h-7 w-7" /> Rasm yo'q
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
          <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
          Bajarildi · {formatDay(h.completed_at || h.date_time)}
        </div>
        <h3 className="mt-1 text-[17px] font-bold leading-snug text-slate-900">
          <button type="button" onClick={() => onOpen(h.id)} className="text-left hover:text-emerald-700 hover:underline">
            {h.title}
          </button>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          {h.address && (
            <span className="flex min-w-0 items-center gap-1.5">
              <PinIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{h.address}</span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 shrink-0 text-slate-400" />
            {volunteersLabel(h.volunteer_count)}
          </span>
        </div>
      </div>
    </article>
  );
}

export default function CompletedGallery({ hashars, onOpen, query }) {
  if (hashars.length === 0) {
    return (
      <EmptyState
        icon={SparklesIcon}
        title={query ? 'Hech narsa topilmadi' : "Hali bajarilgan hasharlar yo'q"}
        text={
          query
            ? `"${query}" bo'yicha bajarilgan hashar topilmadi.`
            : "Hashar yakunlangach, tashkilotchi \"Keyin\" rasmini yuklaydi — natijalar shu yerda ko'rinadi."
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
      {hashars.map((h) => (
        <GalleryCard key={h.id} hashar={h} onOpen={onOpen} />
      ))}
    </div>
  );
}
