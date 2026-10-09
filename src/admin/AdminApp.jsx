// Admin panel (#admin): sarlavha, kirish tekshiruvi va tablar — Umumiy / Foydalanuvchilar / Hasharlar / To'lovlar / Sozlamalar.
// Alohida bundle (main.jsx da React.lazy) — oddiy foydalanuvchi uni yuklamaydi.
import { useEffect, useRef, useState } from 'react';
import AuthModal from '../components/AuthModal.jsx';
import { Logo } from '../components/Header.jsx';
import { ArrowLeftIcon, LeafIcon, SettingsIcon, ShieldIcon, UsersIcon, WalletIcon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { hideSplash } from '../lib/native.js';
import { closeAdmin } from '../lib/router.js';
import { cx, formatPhone } from '../lib/utils.js';
import HasharsTab from './HasharsTab.jsx';
import OverviewTab from './OverviewTab.jsx';
import PaymentsTab from './PaymentsTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import UsersTab from './UsersTab.jsx';

// short — telefon uchun qisqa yorliq (5 ta tab bir qatorga sig'adi, gorizontal aylantirish shart emas)
const TABS = [
  { id: 'overview', label: 'Umumiy', short: 'Umumiy', icon: ShieldIcon },
  { id: 'users', label: 'Foydalanuvchilar', short: "A'zolar", icon: UsersIcon },
  { id: 'hashars', label: 'Hasharlar', short: 'Hasharlar', icon: LeafIcon },
  { id: 'payments', label: "To'lovlar", short: "To'lovlar", icon: WalletIcon },
  { id: 'settings', label: 'Sozlamalar', short: 'Sozlama', icon: SettingsIcon },
];

/** #admin/users → 'users' (noma'lum bo'lsa 'overview'). */
const tabFromHash = () => {
  const id = window.location.hash.replace(/^#\/?admin\/?/, '');
  return TABS.some((t) => t.id === id) ? id : 'overview';
};

function AdminHeader({ user }) {
  return (
    <header className="app-header safe-top sticky top-0 z-[1100] border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        <a href="./" onClick={(e) => (e.preventDefault(), closeAdmin())} aria-label="hasharchilar.uz — bosh sahifa" className="min-w-0 rounded-xl">
          <Logo compact />
        </a>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white min-[420px]:inline-flex">
          <ShieldIcon className="h-3.5 w-3.5" strokeWidth={2.4} /> Admin
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {user && <span className="hidden max-w-[12rem] truncate text-sm font-semibold text-slate-600 lg:inline">{user.name}</span>}
          <button type="button" onClick={closeAdmin} className={cx(btn.outline, 'h-10 px-3 text-sm sm:px-4')}>
            <ArrowLeftIcon className="h-4 w-4" strokeWidth={2.4} />
            <span className="max-[359px]:sr-only">Saytga qaytish</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** Mehmon yoki admin bo'lmagan foydalanuvchi uchun. */
function Gate({ user, onLogin, onSwitch }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200/70 sm:p-8">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <ShieldIcon className="h-8 w-8" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Admin panel</h1>
      {user ? (
        <>
          <p className="mt-2 text-[15px] text-slate-600">
            Bu bo'lim faqat administratorlar uchun. Siz <b>{user.name}</b> ({formatPhone(user.phone)}) sifatida kirgansiz.
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button type="button" onClick={onSwitch} className={cx(btn.primary, 'h-12')}>
              Boshqa hisob bilan kirish
            </button>
            <button type="button" onClick={closeAdmin} className={cx(btn.ghost, 'h-12')}>
              Saytga qaytish
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[15px] text-slate-600">Davom etish uchun administrator hisobi bilan tizimga kiring.</p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button type="button" onClick={onLogin} className={cx(btn.primary, 'h-12')}>
              Kirish
            </button>
            <button type="button" onClick={closeAdmin} className={cx(btn.ghost, 'h-12')}>
              Saytga qaytish
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminApp() {
  const auth = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState(tabFromHash);
  const [userQuery, setUserQuery] = useState({ q: '', key: 0 }); // Umumiy → Foydalanuvchilar o'tishi
  const [showLogin, setShowLogin] = useState(false);
  const user = auth.user;

  useEffect(() => {
    hideSplash();
    const prev = document.title;
    document.title = 'Admin panel — hasharchilar.uz';
    return () => {
      document.title = prev;
    };
  }, []);

  // Manzil qo'lda o'zgarsa (#admin/settings) — tab ham almashadi
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Aktiv tab har doim ko'rinishda (tab qatori sig'masa — gorizontal suriladi; sahifa vertikal siljimaydi)
  const tabsRef = useRef(null);
  const isAdminUser = !!(user && user.is_admin);
  useEffect(() => {
    const strip = tabsRef.current;
    const el = strip && strip.querySelector(`[data-tab="${tab}"]`);
    if (!el || strip.scrollWidth <= strip.clientWidth) return;
    const r = el.getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    const left = strip.scrollLeft + r.left - box.left - (strip.clientWidth - r.width) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [tab, isAdminUser]);

  // Tab manzilda saqlanadi (#admin/users) — sahifa yangilansa ham o'sha tab ochiladi
  const changeTab = (id) => {
    setTab(id);
    // history.state saqlanadi (router'ning tarix chuqurligi — hIdx)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#admin${id === 'overview' ? '' : `/${id}`}`);
    window.scrollTo(0, 0);
  };

  let content;
  if (!auth.ready) {
    content = (
      <div className="grid place-items-center py-24 text-brand-600">
        <Spinner className="h-8 w-8 border-[3px]" />
      </div>
    );
  } else if (!user || !user.is_admin) {
    content = (
      <Gate
        user={user}
        onLogin={() => setShowLogin(true)}
        onSwitch={async () => {
          await auth.logout();
          setShowLogin(true);
        }}
      />
    );
  } else {
    content = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-2 pt-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Admin panel</h1>
            <p className="mt-0.5 text-sm text-slate-500">Foydalanuvchilar va hasharlarni boshqarish</p>
          </div>
        </div>
        {/* Telefonda (md dan kichik): 5 ustunli panel — ikonka ustida qisqa yorliq, hammasi ko'rinadi;
            kattaroq ekranda — gorizontal "pill"lar (sig'masa aylantiriladi, aktiv tab ko'rinishga suriladi) */}
        <div ref={tabsRef} role="tablist" aria-label="Admin bo'limlari" className="no-scrollbar -mx-4 mt-4 overflow-x-auto px-4">
          <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-200/60 p-1 md:inline-flex md:min-w-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-tab={t.id}
                onClick={() => changeTab(t.id)}
                className={cx(
                  'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold leading-tight transition md:flex-none md:flex-row md:gap-1.5 md:whitespace-nowrap md:px-5 md:py-2.5 md:text-sm',
                  tab === t.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <t.icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
                <span className="max-w-full truncate md:hidden">{t.short}</span>
                <span className="hidden md:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel" className="mt-5">
          {tab === 'overview' && (
            <OverviewTab
              meId={user.id}
              onShowAll={changeTab}
              onShowUser={(u) => {
                setUserQuery((s) => ({ q: u.phone, key: s.key + 1 }));
                changeTab('users');
              }}
            />
          )}
          {tab === 'users' && <UsersTab key={userQuery.key} meId={user.id} initialQuery={userQuery.q} />}
          {tab === 'hashars' && <HasharsTab />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader user={user && user.is_admin ? user : null} />
      <main className="safe-bottom mx-auto w-full max-w-7xl flex-1 px-4 pb-12">{content}</main>
      {showLogin && (
        <AuthModal
          reason="admin"
          onClose={() => setShowLogin(false)}
          onSuccess={(u) => {
            setShowLogin(false);
            toast(u.is_admin ? `Xush kelibsiz, ${u.name}!` : "Bu hisob administrator emas", u.is_admin ? 'success' : 'error');
          }}
        />
      )}
    </div>
  );
}
