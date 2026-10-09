// Tungi/yorug' rejim tugmasi (header). Sozlamalardagi tanlagichlar — AppearancePicker.jsx (profil chunk'ida).
import { haptic } from '../lib/native.js';
import { useTheme } from '../lib/theme.jsx';
import { cx } from '../lib/utils.js';
import { MoonIcon, SunIcon } from './icons.jsx';

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
