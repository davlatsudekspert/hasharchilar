// Ilova qobig'i: yuqori navigatsiya, sahifalar (hash router), pastki tab bar, oflayn banner.
import { useEffect, useLayoutEffect } from 'react';
import AppBanner, { useAppInfo } from './components/AppBanner.jsx';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import TabBar from './components/TabBar.jsx';
import { ActionsProvider } from './lib/actions.jsx';
import { hideSplash } from './lib/native.js';
import { navWasPop, savedScroll, useRoute } from './lib/router.js';
import { cx } from './lib/utils.js';
import AboutPage from './pages/AboutPage.jsx';
import CreatePage from './pages/CreatePage.jsx';
import HasharPage from './pages/HasharPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import ListPage from './pages/ListPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MapPage from './pages/MapPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import UserPage from './pages/UserPage.jsx';

const PAGES = {
  home: HomePage,
  map: MapPage,
  list: ListPage,
  hashar: HasharPage,
  create: CreatePage,
  results: ResultsPage,
  leaderboard: LeaderboardPage,
  profile: ProfilePage,
  user: UserPage,
  about: AboutPage,
  login: LoginPage,
  notfound: NotFoundPage,
};

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
  notfound: 'Sahifa topilmadi',
};

export default function App() {
  const route = useRoute();
  const appInfo = useAppInfo();
  const Page = PAGES[route.name] || NotFoundPage;

  // Yangi sahifa — tepadan; "orqaga" — avvalgi joyga
  useLayoutEffect(() => {
    if (navWasPop()) {
      const y = savedScroll(route.hash);
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
    return () => clearTimeout(t);
  }, []);

  const isMap = route.name === 'map';
  const isCreate = route.name === 'create';
  const showFooter = !isMap && !isCreate;

  return (
    <ActionsProvider>
      <div className={cx('flex min-h-dvh flex-col', !isCreate && !isMap && 'app-main')}>
        <a href="#main" className="skip-link" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
          Asosiy qismga o'tish
        </a>
        <OfflineBanner />
        <Header />
        {route.name === 'home' && <AppBanner info={appInfo} />}
        <main id="main" tabIndex={-1} key={route.path} className="page-enter flex-1 outline-none">
          <Page route={route} appInfo={appInfo} />
        </main>
        {showFooter && <Footer appInfo={appInfo} className={route.name === 'home' || route.name === 'about' ? '' : 'hidden lg:block'} />}
      </div>
      {!isCreate && <TabBar />}
    </ActionsProvider>
  );
}
