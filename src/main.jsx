import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { Spinner } from './components/ui.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { initNative } from './lib/native.js';
import { useAdminRoute } from './lib/route.js';
import './index.css';

// Admin panel alohida bundle (faqat #admin ochilganda yuklanadi)
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

// Native (Android) sozlamalari: status bar, orqaga tugmasi
initNative();

/** Admin bundle yuklanmasa (internet yo'q / yangi deploy) — oq ekran o'rniga xabar. */
class AdminBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-bold text-slate-900">Admin panelni yuklab bo'lmadi</p>
          <p className="mt-1 text-sm text-slate-600">Internet aloqasini tekshirib, sahifani yangilang.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
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
    <AdminBoundary>
      <Suspense
        fallback={
          <div className="grid min-h-screen place-items-center text-emerald-600">
            <Spinner className="h-8 w-8 border-[3px]" />
          </div>
        }
      >
        <AdminApp />
      </Suspense>
    </AdminBoundary>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
);
