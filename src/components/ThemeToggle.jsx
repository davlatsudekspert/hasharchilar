// Tungi/yorug' rejim tugmasi (header) va uch holatli tanlagich (profil sozlamalari).
import { haptic } from '../lib/native.js';
import { useTheme } from '../lib/theme.jsx';
import { cx } from '../lib/utils.js';
import { MonitorIcon, MoonIcon, SunIcon } from './icons.jsx';

export function ThemeToggle({ className }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={() => {
        haptic('select');
        toggle();
      }}
      aria-label={dark ? "Yorug' rejimga o'tish" : "Tungi rejimga o'tish"}
      title={dark ? "Yorug' rejim" : 'Tungi rejim'}
      className={cx(
        'grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-ink-2 ring-1 ring-line transition hover:bg-surface-2 hover:text-ink active:scale-95',
        className,
      )}
    >
      {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}

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
            pref === o.value ? 'bg-brand-soft text-brand ring-2 ring-emerald-500' : 'bg-surface-2 text-ink-2 ring-1 ring-line hover:text-ink',
          )}
        >
          <o.icon className="h-5 w-5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}
