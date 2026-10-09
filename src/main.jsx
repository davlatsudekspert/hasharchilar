import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { Spinner } from './components/ui.jsx';
import { getToken, setToken } from './lib/api.js';
import AppLock from './lock/AppLock.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { initNative, restoreToken } from './lib/native.js';
import { loadPage } from './lib/pages.js';
import { preloadRouteData } from './lib/queries.js';
import { loadServerConfig } from './lib/serverConfig.js';
import { getRoute, useAdminRoute } from './lib/router.js';
import { ThemeProvider } from './lib/theme.jsx';
import './index.css';

// Admin panel alohida bundle (faqat #admin ochilganda yuklanadi)
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

/** Lazy bundle yuklanmasa (internet yo'q / yangi deploy) — oq ekran o'rniga xabar. */
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error(err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-bold text-ink">Sahifani yuklab bo'lmadi</p>
          <p className="mt-1 text-sm text-ink-3">Internet aloqasini tekshirib, sahifani yangilang.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-2xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Qayta yuklash
          </button>
        </div>
      </div>
    );
  }
}

function Root() {
  const admin = useAdminRoute();
  if (!admin) return <App />;
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-brand-600">
          <Spinner className="h-8 w-8 border-[3px]" />
        </div>
      }
    >
      <AdminApp />
    </Suspense>
  );
}

async function start() {
  initNative();
  // Native: WebView ma'lumotlari tozalangan bo'lsa tokenni Preferences dan tiklaymiz
  await restoreToken(getToken, setToken);
  // Birinchi ekran: sahifa kodi va uning ma'lumoti parallel so'raladi (React ishga tushishini kutmasdan)
  const first = getRoute();
  if (first.name !== 'admin') {
    loadPage(first.name).catch(() => {});
    preloadRouteData(first, { authed: !!getToken() });
  }
  loadServerConfig(); // /api/config (email, e'lon narxi, to'lov usullari) — fonda
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Boundary>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              {/* APK: PIN / barmoq izi qulfi (saytda — o'tkazgich) */}
              <AppLock>
                <Root />
              </AppLock>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </Boundary>
    </React.StrictMode>,
  );
}

start();
