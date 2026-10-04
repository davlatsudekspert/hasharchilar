// Yuqori navigatsiya: desktopda to'liq menyu, mobil/APK da ixcham panel (pastda tab bar).
import { useAuth } from '../lib/auth.jsx';
import { navigate, useRoute } from '../lib/router.js';
import { cx } from '../lib/utils.js';
import { PlusIcon, UserIcon } from './icons.jsx';
import Logo from './Logo.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { Avatar, btn, Link } from './ui.jsx';

export { default as Logo } from './Logo.jsx';

export const NAV = [
  { to: '/', name: 'home', label: 'Bosh sahifa' },
  { to: '/xarita', name: 'map', label: 'Xarita' },
  { to: '/hasharlar', name: 'list', label: 'Hasharlar' },
  { to: '/natijalar', name: 'results', label: 'Natijalar' },
  { to: '/reyting', name: 'leaderboard', label: 'Reyting' },
  { to: '/haqida', name: 'about', label: 'Loyiha haqida' },
];

export default function Header() {
  const { user, ready } = useAuth();
  const route = useRoute();
  const active = route.name === 'hashar' ? 'list' : route.name === 'user' ? 'leaderboard' : route.name;

  return (
    <header className="glass safe-top sticky top-0 z-[1100] border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:h-[72px] lg:px-6">
        <Link to="/" aria-label="hasharchilar.uz — bosh sahifa" className="min-w-0 rounded-2xl">
          <Logo compact />
        </Link>

        <nav aria-label="Asosiy menyu" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active === n.name ? 'page' : undefined}
              className={cx(
                'relative rounded-xl px-3 py-2 text-[14.5px] font-semibold transition',
                active === n.name ? 'text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {n.label}
              {active === n.name && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full bg-emerald-500" />}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-11 px-4 text-[14.5px] max-lg:hidden')}>
            <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
          </button>
          {!ready ? (
            <span className="skeleton h-10 w-10 rounded-full" aria-hidden="true" />
          ) : user ? (
            <Link
              to="/profil"
              aria-label={`Profil: ${user.name}`}
              className={cx(
                'flex items-center gap-2 rounded-full p-0.5 pr-0.5 ring-1 ring-line transition hover:ring-emerald-400 lg:pr-3',
                route.name === 'profile' && 'ring-2 ring-emerald-500',
              )}
            >
              <Avatar name={user.name} src={user.avatar_url} size="md" className="h-9 w-9" />
              <span className="hidden max-w-[9rem] truncate text-sm font-bold text-ink lg:inline">{user.name.split(' ')[0]}</span>
            </Link>
          ) : (
            <Link to="/kirish" className={cx(btn.outline, 'h-10 px-3.5 text-sm')}>
              <UserIcon className="h-4 w-4" /> Kirish
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
