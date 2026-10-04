// Oddiy hash marshrutlash: `#admin` — admin panel (sayt va Capacitor ilovada bir xil ishlaydi).
import { useEffect, useState } from 'react';

/** Joriy manzil admin panelmi (#admin yoki #/admin). */
export const isAdminRoute = () => typeof window !== 'undefined' && /^#\/?admin(\/|$)/.test(window.location.hash);

/** Admin panelni ochadi. */
export function openAdmin() {
  window.location.hash = 'admin';
}

/** Saytga qaytadi: manzildagi "#admin" olib tashlanadi ("#" qoldirmasdan). */
export function closeAdmin() {
  if (!isAdminRoute()) return;
  window.history.pushState(null, '', window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo(0, 0);
}

/** hashchange'ga obuna: admin panel ochiqmi. */
export function useAdminRoute() {
  const [admin, setAdmin] = useState(isAdminRoute);
  useEffect(() => {
    const on = () => setAdmin(isAdminRoute());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return admin;
}
