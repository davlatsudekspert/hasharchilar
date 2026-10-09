// 404 sahifa.
import { HomeIcon, MapIcon } from '../components/icons.jsx';
import { btn, Link } from '../components/ui.jsx';
import { cx } from '../lib/utils.js';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <div className="relative">
        <p className="font-display text-[120px] font-extrabold leading-none text-transparent [-webkit-text-stroke:2px_var(--c-line-strong)]">404</p>
        <span className="absolute inset-0 m-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
          <MapIcon className="h-10 w-10" />
        </span>
      </div>
      <h1 className="mt-6 text-3xl font-extrabold text-ink">Bu sahifa topilmadi</h1>
      <p className="mt-2 text-ink-3">Havola eskirgan yoki noto'g'ri yozilgan bo'lishi mumkin. Keling, sizni to'g'ri yo'lga qaytaramiz.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className={cx(btn.primary, 'h-12 px-6')}>
          <HomeIcon className="h-5 w-5" /> Bosh sahifa
        </Link>
        <Link to="/xarita" className={cx(btn.outline, 'h-12 px-6')}>
          <MapIcon className="h-5 w-5" /> Xarita
        </Link>
      </div>
    </div>
  );
}
