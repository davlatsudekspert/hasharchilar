// Profil → Sozlamalar → Ko'rinish: rejim (Yorug' / Tungi / Tizim), rang aksenti (rangli doiralar) va mini oldindan ko'rish.
import { haptic } from '../lib/native.js';
import { ACCENTS, useTheme } from '../lib/theme.jsx';
import { cx } from '../lib/utils.js';
import { CheckIcon, HomeIcon, ImageIcon, MapIcon, MonitorIcon, MoonIcon, PlusIcon, SunIcon, UserIcon, UsersIcon } from './icons.jsx';

const OPTIONS = [
  { value: 'light', label: "Yorug'", icon: SunIcon },
  { value: 'dark', label: 'Tungi', icon: MoonIcon },
  { value: 'system', label: 'Tizim', icon: MonitorIcon },
];

export function ThemePicker() {
  const { pref, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Mavzu" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => {
            haptic('select');
            setTheme(o.value);
          }}
          className={cx(
            'flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-bold transition',
            pref === o.value ? 'bg-brand-soft text-brand ring-2 ring-brand-500' : 'bg-surface-2 text-ink-2 ring-1 ring-line hover:text-ink',
          )}
        >
          <o.icon className="h-5 w-5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rang aksenti: rangli doiralar (tanlangani belgi va halqa bilan). */
export function AccentPicker() {
  const { accent, setAccent } = useTheme();
  return (
    <div role="radiogroup" aria-label="Rang aksenti" className="grid grid-cols-4 gap-2">
      {ACCENTS.map((a) => {
        const on = accent === a.id;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-accent-option={a.id}
            onClick={() => {
              haptic('select');
              setAccent(a.id);
            }}
            className={cx('group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 transition', on ? 'bg-surface-2 ring-1 ring-line' : 'hover:bg-surface-2')}
          >
            <span
              className={cx('relative grid h-11 w-11 place-items-center rounded-full text-white shadow-sm transition duration-300 group-active:scale-90', on && 'scale-110')}
              style={{
                background: `linear-gradient(140deg, ${a.c400}, ${a.c600} 70%, ${a.c700})`,
                boxShadow: on ? `0 0 0 3px var(--c-surface), 0 0 0 5px ${a.c500}, 0 8px 18px -6px ${a.c600}` : `0 6px 14px -8px ${a.c600}`,
              }}
            >
              {on && <CheckIcon className="pop h-5 w-5" strokeWidth={3} />}
            </span>
            <span className={cx('text-xs font-bold', on ? 'text-ink' : 'text-ink-3')}>{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Mini oldindan ko'rish: haqiqiy CSS o'zgaruvchilari bilan chiziladi — tanlov darhol aks etadi. */
export function ThemePreview() {
  const { accent } = useTheme();
  const a = ACCENTS.find((x) => x.id === accent) || ACCENTS[0];
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[26px] border border-line bg-bg p-2.5 shadow-soft">
      <div className="flex items-center gap-1.5 rounded-2xl bg-surface px-2.5 py-2 ring-1 ring-line">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-[9px] font-black text-white">h</span>
        <span className="font-display text-[11px] font-extrabold text-brand">hashar<span className="text-amber-500">chilar</span></span>
        <span className="ml-auto h-5 w-5 rounded-full bg-surface-3" />
      </div>
      <div className="mt-2 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        <div className="hero-bg relative h-14">
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[8.5px] font-bold text-slate-800">Tozalash</span>
          <span className="absolute bottom-2 left-2 text-[11px] font-extrabold text-white">Mahalla bog'ini tozalash</span>
        </div>
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-2">
            <UsersIcon className="h-3 w-3 text-brand" /> 12
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-brand-400 to-brand-600" />
          </div>
          <span className="rounded-lg bg-brand-600 px-2 py-1 text-[9.5px] font-bold text-white dark:bg-primary dark:text-brand-950">Qatnashish</span>
        </div>
      </div>
      <div className="relative mt-2 flex h-11 items-center justify-around rounded-2xl bg-surface/90 ring-1 ring-line">
        <span className="grid h-8 w-11 place-items-center rounded-xl text-brand" style={{ background: 'var(--tab-pill)' }}>
          <HomeIcon className="h-4 w-4" />
        </span>
        <MapIcon className="h-4 w-4 text-ink-3" />
        <span className="-mt-5 grid h-9 w-9 place-items-center rounded-[13px] text-white" style={{ background: `linear-gradient(140deg, ${a.c400}, ${a.c600})`, boxShadow: '0 0 0 3px var(--c-bg)' }}>
          <PlusIcon className="h-5 w-5" strokeWidth={2.6} />
        </span>
        <ImageIcon className="h-4 w-4 text-ink-3" />
        <UserIcon className="h-4 w-4 text-ink-3" />
      </div>
    </div>
  );
}
