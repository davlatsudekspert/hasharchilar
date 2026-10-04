// Tablar: xarita / yaqindagilar / bajarilganlar.
import { MapIcon, NavigationIcon, SparklesIcon } from './icons.jsx';

export const TABS = [
  { id: 'map', label: "Xaritada ko'rish", short: 'Xarita', icon: MapIcon },
  { id: 'nearby', label: 'Yaqindagi hasharlar', short: 'Yaqindagi', icon: NavigationIcon },
  { id: 'done', label: 'Bajarilganlar (Oldin/Keyin)', short: 'Bajarilgan', icon: SparklesIcon },
];

export default function Tabs({ active, onChange, counts = {} }) {
  // WAI-ARIA tabs: qadam fokusdagi tabdan hisoblanadi, fokus yangi tabga ko'chadi
  const onKey = (e) => {
    const focused = TABS.findIndex((t) => `tab-${t.id}` === e.target.id);
    const i = focused >= 0 ? focused : TABS.findIndex((t) => t.id === active);
    const n = TABS.length;
    const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <div
        role="tablist"
        aria-label="Ko'rinish"
        onKeyDown={onKey}
        className="inline-flex min-w-full gap-1 rounded-2xl bg-slate-200/60 p-1 sm:min-w-0"
      >
        {TABS.map((t) => {
          const on = active === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls="tab-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-bold transition sm:flex-none sm:gap-2 sm:px-4 ${
                on ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-emerald-600' : ''}`} />
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              {counts[t.id] != null && (
                <span
                  className={`hidden rounded-full px-1.5 py-0.5 text-[11px] leading-none sm:inline ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-white/70 text-slate-600'}`}
                >
                  {counts[t.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
