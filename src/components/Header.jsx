// Yuqori navigatsiya: desktopda to'liq menyu (aktiv bo'lim ostida siljiydigan chiziq), qo'ng'iroqcha + ochiladigan
// bildirishnomalar oynasi; mobil/APK da ixcham panel (pastda tab bar, qo'ng'iroqcha → #/bildirishnomalar).
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { haptic } from '../lib/native.js';
import { refreshUnread, useUnread } from '../lib/notifications.js';
import { navigate, prefetch, useRoute } from '../lib/router.js';
import { cx } from '../lib/utils.js';
import { BellIcon, PlusIcon, UserIcon } from './icons.jsx';
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

const LG = '(min-width: 1024px)';
const isDesktop = () => !!window.matchMedia && window.matchMedia(LG).matches;

// Desktop bildirishnomalar oynasi — birinchi ochilganda yuklanadi
const BellPanel = lazy(() => import('./BellPanel.jsx'));

function Bell() {
  const { count } = useUnread();
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => setOpen(false), [route.path]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const click = () => {
    haptic('select');
    if (!isDesktop()) {
      navigate('/bildirishnomalar');
      return;
    }
    if (!open) refreshUnread();
    setOpen((v) => !v);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={click}
        onPointerEnter={() => {
          prefetch('/bildirishnomalar');
          import('./BellPanel.jsx').catch(() => {});
        }}
        aria-label={count ? `Bildirishnomalar: ${count} ta o'qilmagan` : 'Bildirishnomalar'}
        aria-expanded={isDesktop() ? open : undefined}
        className={cx(
          'relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-ink-2 ring-1 ring-line transition hover:bg-surface-2 hover:text-ink active:scale-95',
          (open || route.name === 'notifications') && 'bg-brand-soft text-brand ring-brand-line',
        )}
      >
        <BellIcon key={count} className={cx('h-5 w-5', count > 0 && 'bell-ring')} />
        {count > 0 && (
          <span className="badge-dot absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10.5px] font-extrabold leading-none text-white ring-2 ring-surface">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <Suspense fallback={null}>
          <BellPanel onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

/** Desktop menyu: aktiv bo'lim ostidagi chiziq bir havoladan boshqasiga silliq siljiydi. */
function DesktopNav({ active }) {
  const navRef = useRef(null);
  const [bar, setBar] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current && navRef.current.querySelector('[aria-current="page"]');
      if (!el) return setBar(null);
      setBar({ left: el.offsetLeft + 12, width: el.offsetWidth - 24 });
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [active]);
  return (
    <nav ref={navRef} aria-label="Asosiy menyu" className="relative ml-6 hidden items-center gap-1 lg:flex">
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
        </Link>
      ))}
      <span
        aria-hidden="true"
        className="nav-underline absolute -bottom-[15px] h-[3px] rounded-full bg-brand-500"
        style={bar ? { transform: `translateX(${bar.left}px)`, width: bar.width, opacity: 1 } : { opacity: 0 }}
      />
    </nav>
  );
}

export default function Header() {
  const { user, ready } = useAuth();
  const route = useRoute();
  const active = route.name === 'hashar' ? 'list' : route.name === 'user' ? 'leaderboard' : route.name;

  return (
    <header className="app-header glass safe-top sticky top-0 z-[1100] border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:h-[72px] lg:px-6">
        <Link to="/" aria-label="hasharchilar.uz — bosh sahifa" className="min-w-0 rounded-2xl">
          <Logo compact />
        </Link>

        <DesktopNav active={active} />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {user && <Bell />}
          <button
            type="button"
            onClick={() => navigate('/yaratish')}
            onPointerEnter={() => prefetch('/yaratish')}
            className={cx(btn.cta, 'h-11 px-4 text-[14.5px] max-lg:hidden')}
          >
            <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
          </button>
          {!ready ? (
            <span className="skeleton h-10 w-10 rounded-full" aria-hidden="true" />
          ) : user ? (
            <Link
              to="/profil"
              aria-label={`Profil: ${user.name}`}
              className={cx(
                'flex items-center gap-2 rounded-full p-0.5 pr-0.5 ring-1 ring-line transition hover:ring-brand-400 lg:pr-3',
                route.name === 'profile' && 'ring-2 ring-brand-500',
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
