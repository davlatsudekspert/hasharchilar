// Admin panel (#admin): sarlavha, kirish tekshiruvi va tablar — Umumiy / Foydalanuvchilar / Hasharlar.
// Alohida bundle (main.jsx da React.lazy) — oddiy foydalanuvchi uni yuklamaydi.
import { useEffect, useState } from 'react';
import AuthModal from '../components/AuthModal.jsx';
import { Logo } from '../components/Header.jsx';
import { ArrowLeftIcon, LeafIcon, ShieldIcon, UsersIcon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { hideSplash } from '../lib/native.js';
import { closeAdmin } from '../lib/route.js';
import { cx, formatPhone } from '../lib/utils.js';
import HasharsTab from './HasharsTab.jsx';
import OverviewTab from './OverviewTab.jsx';
import UsersTab from './UsersTab.jsx';

const TABS = [
  { id: 'overview', label: 'Umumiy', icon: ShieldIcon },
  { id: 'users', label: 'Foydalanuvchilar', icon: UsersIcon },
  { id: 'hashars', label: 'Hasharlar', icon: LeafIcon },
];

/** #admin/users → 'users' (noma'lum bo'lsa 'overview'). */
const tabFromHash = () => {
  const id = window.location.hash.replace(/^#\/?admin\/?/, '');
  return TABS.some((t) => t.id === id) ? id : 'overview';
};

function AdminHeader({ user }) {
  return (
    <header className="app-header sticky top-0 z-[1100] border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
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
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
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

  // Tab manzilda saqlanadi (#admin/users) — sahifa yangilansa ham o'sha tab ochiladi
  const changeTab = (id) => {
    setTab(id);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin${id === 'overview' ? '' : `/${id}`}`);
    window.scrollTo(0, 0);
  };

  let content;
  if (!auth.ready) {
    content = (
      <div className="grid place-items-center py-24 text-emerald-600">
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
        <div role="tablist" aria-label="Admin bo'limlari" className="-mx-4 mt-4 overflow-x-auto px-4">
          <div className="inline-flex min-w-full gap-1 rounded-2xl bg-slate-200/60 p-1 sm:min-w-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => changeTab(t.id)}
                className={cx(
                  'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-bold transition sm:flex-none sm:px-5',
                  tab === t.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                <t.icon className="h-4 w-4 max-[400px]:hidden" /> {t.label}
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
