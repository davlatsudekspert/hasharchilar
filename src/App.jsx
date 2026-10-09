// Ilova qobig'i: yuqori navigatsiya, sahifalar (hash router, lazy chunk'lar), pastki tab bar, oflayn banner,
// onboarding (APK birinchi ochilganda), bildirishnomalar soni va eslatmalarni sinxronlash.
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import AppBanner, { useAppInfo } from './components/AppBanner.jsx';
import { EmailBanner } from './components/EmailBanner.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { PageFallback } from './components/PageFallback.jsx';
import TabBar from './components/TabBar.jsx';
import { ActionsProvider, useActions } from './lib/actions.jsx';
import { useAuth } from './lib/auth.jsx';
import { hideSplash } from './lib/native.js';
import { useNotificationsPolling } from './lib/notifications.js';
import { shouldShowOnboarding } from './lib/onboarding.js';
import { idlePrefetch, pageFor } from './lib/pages.js';
import { useReminderSync } from './lib/reminders.js';
import { navWasPop, savedScroll, useRoute } from './lib/router.js';
import { useServerConfig } from './lib/serverConfig.js';
import { cx } from './lib/utils.js';

const Onboarding = lazy(() => import('./components/Onboarding.jsx'));

const TITLES = {
  home: 'Birgalikda obod qilamiz',
  map: 'Xarita',
  list: 'Hasharlar',
  create: "Hashar e'lon qilish",
  results: 'Oldin / Keyin natijalar',
  leaderboard: "Ko'ngillilar reytingi",
  profile: 'Profilim',
  about: 'Loyiha haqida',
  login: 'Kirish',
  notifications: 'Bildirishnomalar',
  payment: "To'lov",
  notfound: 'Sahifa topilmadi',
};

// "Emailingizni tasdiqlang" eslatmasi faqat ko'rish sahifalarida (xarita — to'liq ekran, yaratish/kirish — o'z oqimi)
const NO_EMAIL_BANNER = new Set(['map', 'create', 'login', 'payment']);
// Pastki tab bar ko'rinmaydigan sahifalar (o'z pastki tugmalari bor)
const NO_TABBAR = new Set(['create', 'payment']);

function EmailBannerSlot({ route }) {
  const { user } = useAuth();
  const { email_enabled: emailOn } = useServerConfig();
  const { promptVerify, verifying } = useActions();
  if (!emailOn || !user || user.email_verified !== false || verifying || NO_EMAIL_BANNER.has(route.name)) return null;
  return <EmailBanner onVerify={() => promptVerify('login')} />;
}

/** Fon jarayonlari: bildirishnomalar soni (ko'rinib turganda 60 s da) va APK eslatmalari. */
function Background() {
  useNotificationsPolling();
  useReminderSync();
  return null;
}

export default function App() {
  const route = useRoute();
  const appInfo = useAppInfo();
  const Page = pageFor(route.name);
  const [onboarding, setOnboarding] = useState(() => shouldShowOnboarding(route));

  // Yangi sahifa — tepadan; "orqaga" — avvalgi joyga
  useLayoutEffect(() => {
    if (navWasPop()) {
      const y = savedScroll(route.hash);
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else {
      window.scrollTo(0, 0);
    }
  }, [route.hash]);

  useEffect(() => {
    if (TITLES[route.name]) document.title = `${TITLES[route.name]} — hasharchilar.uz`;
  }, [route.name]);

  useEffect(() => {
    const t = setTimeout(hideSplash, 500);
    idlePrefetch();
    return () => clearTimeout(t);
  }, []);

  const isMap = route.name === 'map';
  const showFooter = !isMap && route.name !== 'create' && route.name !== 'payment';
  const showTabBar = !NO_TABBAR.has(route.name);

  return (
    <ActionsProvider>
      <div className={cx('flex min-h-dvh flex-col', showTabBar && !isMap && 'app-main')}>
        <a href="#main" className="skip-link" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
          Asosiy qismga o'tish
        </a>
        <div className="nav-progress" aria-hidden="true" />
        <OfflineBanner />
        <Header />
        <EmailBannerSlot route={route} />
        {route.name === 'home' && <AppBanner info={appInfo} />}
        <main id="main" tabIndex={-1} key={route.path} className="page-enter flex-1 outline-none">
          <Suspense fallback={<PageFallback />}>
            <Page route={route} appInfo={appInfo} />
          </Suspense>
        </main>
        {showFooter && <Footer appInfo={appInfo} className={route.name === 'home' || route.name === 'about' ? '' : 'hidden lg:block'} />}
      </div>
      {showTabBar && <TabBar />}
      <Background />
      {onboarding && (
        <Suspense fallback={null}>
          <Onboarding onDone={() => setOnboarding(false)} />
        </Suspense>
      )}
    </ActionsProvider>
  );
}
