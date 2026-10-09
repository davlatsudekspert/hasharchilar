// Mobil / APK pastki tab bar: Bosh · Xarita · ＋ · Natijalar · Profil.
// Suzuvchi shisha panel (blur; qo'llanmasa — to'liq fon), aktiv tab ostida bahor (spring) bilan siljiydigan "pill", aktiv ikonka to'ldiriladi, bosilganda
// "sakraydi"; markaziy ＋ — aksent gradient (bosilganda buriladi, vaqti-vaqti bilan puls); scroll pastga — bar
// yashirinadi, tepaga — chiqadi; haptika; o'qilmagan bildirishnomalar — Profil ustida qizil belgi.
import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/native.js';
import { useUnread } from '../lib/notifications.js';
import { navigate, prefetch, useRoute } from '../lib/router.js';
import { cx } from '../lib/utils.js';
import { PlusIcon } from './icons.jsx';

// Ikonkalar: bitta shakl ham kontur (passiv), ham to'ldirilgan (aktiv) bo'ladi; .cut — to'ldirilganda "kesik" chiziqlar
const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const HomeGlyph = () => (
  <svg {...svg} className="tab-ico h-[23px] w-[23px]">
    <path className="fillable" d="M3.5 10.2 12 3.4l8.5 6.8V19a1.6 1.6 0 0 1-1.6 1.6H15v-5.4a1.2 1.2 0 0 0-1.2-1.2h-3.6A1.2 1.2 0 0 0 9 15.2v5.4H5.1A1.6 1.6 0 0 1 3.5 19Z" />
  </svg>
);
const MapGlyph = () => (
  <svg {...svg} className="tab-ico h-[23px] w-[23px]">
    <path className="fillable" d="M9 3.6 3.9 5.7a.9.9 0 0 0-.6.8v13.2a.6.6 0 0 0 .8.6L9 18.4l6 2 5.1-2.1a.9.9 0 0 0 .6-.8V4.3a.6.6 0 0 0-.8-.6L15 5.6Z" />
    <path className="cut" d="M9 3.8v14.4M15 5.8v14.4" />
  </svg>
);
const ImageGlyph = () => (
  <svg {...svg} className="tab-ico h-[23px] w-[23px]">
    <rect className="fillable" x="3" y="3.5" width="18" height="17" rx="3.2" />
    <circle className="cut" cx="9" cy="9.3" r="1.8" />
    <path className="cut" d="m20.6 15.4-4.1-4.1a1.4 1.4 0 0 0-2 0L5.4 20.4" />
  </svg>
);
const UserGlyph = () => (
  <svg {...svg} className="tab-ico h-[23px] w-[23px]">
    <circle className="fillable" cx="12" cy="8" r="4.2" />
    <path className="fillable" d="M4.2 20.4a7.8 7.8 0 0 1 15.6 0Z" />
  </svg>
);

const TABS = [
  { to: '/', name: ['home'], label: 'Bosh', Icon: HomeGlyph },
  { to: '/xarita', name: ['map', 'list', 'hashar'], label: 'Xarita', Icon: MapGlyph },
  null,
  { to: '/natijalar', name: ['results'], label: 'Natijalar', Icon: ImageGlyph },
  { to: '/profil', name: ['profile', 'login', 'leaderboard', 'user', 'about', 'notifications'], label: 'Profil', Icon: UserGlyph, badge: true },
];

/** Scroll pastga — yashirish, tepaga — ko'rsatish (sahifa tepasida doim ko'rinadi). */
function useHideOnScroll(routeKey) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    setHidden(false);
    last.current = window.scrollY;
  }, [routeKey]);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const dy = y - last.current;
        const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
        if (y < 80 || dy < -8 || atBottom) setHidden(false);
        else if (dy > 8) setHidden(true);
        if (Math.abs(dy) > 8 || y < 80) last.current = y;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('tabbar-hidden', hidden);
    return () => document.documentElement.classList.remove('tabbar-hidden');
  }, [hidden]);
  return hidden;
}

export default function TabBar() {
  const route = useRoute();
  const { count } = useUnread();
  const [bump, setBump] = useState(null); // bosilgan tab — ikonka "sakrashi"
  const [spin, setSpin] = useState(false);
  useHideOnScroll(route.path);
  const activeIndex = TABS.findIndex((t) => t && t.name.includes(route.name));

  const go = (t, i) => {
    haptic('select');
    setBump(`${i}-${Date.now()}`);
    if (t.name.includes(route.name) && route.path === t.to) window.scrollTo({ top: 0, behavior: 'smooth' });
    else navigate(t.to);
  };

  return (
    <nav aria-label="Pastki menyu" className="tabbar fixed inset-x-0 bottom-0 z-[1200] lg:hidden">
      <div className="tabbar__bar relative mx-auto h-[66px] max-w-md rounded-[26px] border border-line/70">
        <span
          aria-hidden="true"
          className="tabbar__pill"
          style={{ '--i': activeIndex < 0 ? 0 : activeIndex, opacity: activeIndex < 0 ? 0 : 1 }}
        >
          <span />
        </span>
        <ul className="relative grid h-full grid-cols-5 items-center">
          {TABS.map((t, i) =>
            t ? (
              <li key={t.to} className="flex h-full justify-center">
                <a
                  href={`#${t.to}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(t, i);
                  }}
                  onTouchStart={() => prefetch(t.to)}
                  aria-current={i === activeIndex ? 'page' : undefined}
                  className={cx(
                    'tabbar__item flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold',
                    i === activeIndex ? 'is-active text-brand' : 'text-ink-3',
                    bump && bump.startsWith(`${i}-`) && 'is-bump',
                  )}
                >
                  <span key={bump && bump.startsWith(`${i}-`) ? bump : 'i'} className="tabbar__icon relative grid h-7 w-7 place-items-center">
                    <t.Icon />
                    {t.badge && count > 0 && (
                      <span className="badge-dot absolute -right-1.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-surface">
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </span>
                  <span className="tabbar__label">{t.label}</span>
                </a>
              </li>
            ) : (
              <li key="fab" className="flex justify-center">
                <a
                  href="#/yaratish"
                  onClick={(e) => {
                    e.preventDefault();
                    haptic('medium');
                    setSpin(true);
                    setTimeout(() => setSpin(false), 450);
                    navigate('/yaratish');
                  }}
                  onTouchStart={() => prefetch('/yaratish')}
                  aria-label="Hashar e'lon qilish"
                  className={cx('tabbar-fab relative -mt-8 grid h-[60px] w-[60px] place-items-center rounded-[22px] text-white', spin && 'is-spin')}
                >
                  <PlusIcon className="relative h-8 w-8" strokeWidth={2.6} />
                </a>
              </li>
            ),
          )}
        </ul>
      </div>
    </nav>
  );
}
