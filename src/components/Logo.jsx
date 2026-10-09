// Logo: barg belgisi + "hashar" (aksent) "chilar" (amber) ".uz".
import { cx } from '../lib/utils.js';
import { LeafIcon } from './icons.jsx';

export default function Logo({ compact, className, light }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
        <LeafIcon className="h-5 w-5" strokeWidth={2.4} />
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400 dark:border-slate-900" />
      </span>
      <span className={cx('font-display text-[19px] font-extrabold tracking-tight', compact && 'max-[380px]:hidden')}>
        <span className={light ? 'text-white' : 'text-brand-700 dark:text-brand-400'}>hashar</span>
        <span className={light ? 'text-amber-300' : 'text-amber-500 dark:text-amber-400'}>chilar</span>
        <span className={light ? 'text-white/60' : 'text-ink-3'}>.uz</span>
      </span>
    </span>
  );
}
