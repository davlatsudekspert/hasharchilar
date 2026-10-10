// Sayt pastki qismi (desktop va mobil sahifalar oxirida).
import { cx } from '../lib/utils.js';
import { DownloadIcon, HeartIcon } from './icons.jsx';
import Logo from './Logo.jsx';
import { Link } from './ui.jsx';
import { appDownloadUrl } from './AppBanner.jsx';
import { IS_NATIVE, SITE_URL } from '../lib/config.js';

const COLS = [
  {
    title: 'Platforma',
    links: [
      ['/xarita', 'Xarita'],
      ['/hasharlar', 'Barcha hasharlar'],
      ['/natijalar', 'Oldin / Keyin'],
      ['/reyting', 'Reyting'],
    ],
  },
  {
    title: 'Ishtirok eting',
    links: [
      ['/yaratish', "Hashar e'lon qilish"],
      ['/profil', 'Mening profilim'],
      ['/haqida', 'Qanday ishlaydi?'],
      ['/haqida', "Ko'p so'raladigan savollar"],
    ],
  },
];

export default function Footer({ appInfo, className }) {
  return (
    <footer className={cx('border-t border-line bg-surface', className)}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:px-6">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-3">
            Mahallangizdagi hasharlarni toping, qo'shiling va natijani birga ko'ring. Birgalikda obod qilamiz!
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-3">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([to, label]) => (
                <li key={label}>
                  <Link to={to} className="text-sm font-semibold text-ink-2 transition hover:text-brand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-3">Mobil ilova</p>
          {IS_NATIVE ? (
            <p className="mt-4 text-sm text-ink-3">Siz ilovadan foydalanyapsiz. Rahmat! 💚</p>
          ) : (
            <a
              href={appDownloadUrl(appInfo)}
              download="hasharchilar.apk"
              className="mt-4 inline-flex items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-lift transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <DownloadIcon className="h-6 w-6" />
              <span className="leading-tight">
                <span className="block text-[11px] font-medium opacity-70">Android uchun yuklab oling</span>
                <span className="block text-sm font-extrabold">Hasharchilar APK</span>
              </span>
            </a>
          )}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} hasharchilar.uz · Barcha huquqlar himoyalangan</span>
            {/* Statik sahifalar (SPA emas) — APK'da ham sayt manzili orqali ochiladi */}
            <a href={`${SITE_URL}/privacy.html`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-brand">
              Maxfiylik siyosati
            </a>
            <a href={`${SITE_URL}/delete-account.html`} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-brand">
              Hisobni o'chirish
            </a>
          </p>
          <p className="inline-flex items-center gap-1.5">
            O'zbekistonda <HeartIcon className="h-3.5 w-3.5 fill-red-500 text-red-500" /> bilan yaratilgan
          </p>
        </div>
      </div>
    </footer>
  );
}
