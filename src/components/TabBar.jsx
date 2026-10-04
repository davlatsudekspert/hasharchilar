// Mobil / APK pastki tab bar: Bosh · Xarita · ＋ · Natijalar · Profil (markazda katta ＋).
import { haptic } from '../lib/native.js';
import { navigate, useRoute } from '../lib/router.js';
import { cx } from '../lib/utils.js';
import { HomeIcon, ImageIcon, MapIcon, PlusIcon, UserIcon } from './icons.jsx';

const TABS = [
  { to: '/', name: ['home'], label: 'Bosh', icon: HomeIcon },
  { to: '/xarita', name: ['map', 'list', 'hashar'], label: 'Xarita', icon: MapIcon },
  null,
  { to: '/natijalar', name: ['results'], label: 'Natijalar', icon: ImageIcon },
  { to: '/profil', name: ['profile', 'login', 'leaderboard', 'user', 'about'], label: 'Profil', icon: UserIcon },
];

export default function TabBar() {
  const route = useRoute();
  const go = (to) => {
    haptic('select');
    navigate(to);
  };
  return (
    <nav aria-label="Pastki menyu" className="tabbar glass fixed inset-x-0 bottom-0 z-[1200] border-t border-line/80 lg:hidden">
      <ul className="mx-auto grid h-[68px] max-w-md grid-cols-5 items-center px-2">
        {TABS.map((t) =>
          t ? (
            <li key={t.to} className="flex justify-center">
              <a
                href={`#${t.to}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(t.to);
                }}
                aria-current={t.name.includes(route.name) ? 'page' : undefined}
                className={cx(
                  'flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-bold transition active:scale-95',
                  t.name.includes(route.name) ? 'text-brand' : 'text-ink-3',
                )}
              >
                <span className={cx('grid h-8 w-12 place-items-center rounded-full transition', t.name.includes(route.name) && 'bg-brand-soft')}>
                  <t.icon className="h-[22px] w-[22px]" strokeWidth={t.name.includes(route.name) ? 2.4 : 2} />
                </span>
                {t.label}
              </a>
            </li>
          ) : (
            <li key="fab" className="flex justify-center">
              <a
                href="#/yaratish"
                onClick={(e) => {
                  e.preventDefault();
                  haptic('medium');
                  navigate('/yaratish');
                }}
                aria-label="Hashar e'lon qilish"
                className="tabbar-fab -mt-7 grid h-[62px] w-[62px] place-items-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 transition active:scale-90"
              >
                <PlusIcon className="h-8 w-8" strokeWidth={2.6} />
              </a>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
