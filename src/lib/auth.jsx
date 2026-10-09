// Auth holati (React context): joriy foydalanuvchi, kirish, ro'yxatdan o'tish, chiqish.
// Email bilan ro'yxat / parolni tiklash oqimlari {token, user} olgach `signIn(data)` ni chaqiradi.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, onUnauthorized, setToken } from './api.js';
import { storage, USER_KEY } from './storage.js';
import { clearCache } from './store.js';

const AuthContext = createContext(null);

// Parol bilan kirilganda xabardor qilinadiganlar (masalan, email tasdiqlanmagan bo'lsa "Emailni tasdiqlang" oynasi)
const loginListeners = new Set();
export function onPasswordLogin(fn) {
  loginListeners.add(fn);
  return () => loginListeners.delete(fn);
}

export function AuthProvider({ children }) {
  // Keshdagi foydalanuvchi — internet vaqtincha bo'lmasa ham "kirgan" holat saqlanadi
  const [user, setUser] = useState(() => (getToken() ? storage.getJSON(USER_KEY) : null));
  const [stats, setStats] = useState(null);
  // Token bo'lsa /api/me tugaguncha "tayyor emas"
  const [ready, setReady] = useState(() => !getToken());

  const saveUser = useCallback((u) => {
    setUser(u);
    if (u) storage.setJSON(USER_KEY, u);
    else storage.remove(USER_KEY);
  }, []);

  // Chiqishda foydalanuvchi keshi (sessionStorage dagi to'lov, telefon va h.k.) ham tozalanadi —
  // keyingi hisob yoki mehmon oldingi foydalanuvchi ma'lumotini ko'rmasin
  const signOutLocal = useCallback(() => {
    clearToken();
    saveUser(null);
    setStats(null);
    clearCache();
  }, [saveUser]);

  /** /api/me dan foydalanuvchi va statistikani yangilaydi. */
  const refresh = useCallback(async () => {
    if (!getToken()) {
      saveUser(null);
      setReady(true);
      return null;
    }
    try {
      const data = await api.me();
      saveUser(data.user);
      setStats(data.stats || null);
      return data;
    } catch (err) {
      // 401 — sessiya yo'q; 403 — hisob bloklangan
      if (err.status === 401 || err.status === 403) signOutLocal();
      throw err;
    } finally {
      setReady(true);
    }
  }, [saveUser, signOutLocal]);

  useEffect(() => {
    if (getToken()) refresh().catch(() => {});
    // Istalgan so'rov 401 qaytarsa — mehmon holatiga o'tamiz
    return onUnauthorized(() => {
      saveUser(null);
      setStats(null);
      clearCache();
    });
  }, [refresh, saveUser]);

  const finishAuth = useCallback(
    (data) => {
      // Boshqa hisobga kirildi — oldingi foydalanuvchi keshi qolmasin
      const prev = storage.getJSON(USER_KEY);
      if (prev && data.user && prev.id !== data.user.id) clearCache();
      setToken(data.token);
      saveUser(data.user);
      refresh().catch(() => {});
      return data.user;
    },
    [refresh, saveUser],
  );

  /** `id` — telefon (+998...) yoki email. */
  const login = useCallback(
    async (id, password) => {
      const user = finishAuth(await api.login({ login: id, password }));
      // Obunachilar keyingi tick'da: chaqiruvchi (forma) avval o'z ishini tugatsin
      setTimeout(() => loginListeners.forEach((fn) => fn(user)), 0);
      return user;
    },
    [finishAuth],
  );

  const register = useCallback(
    async (name, phone, password) => finishAuth(await api.register({ name, phone, password })),
    [finishAuth],
  );

  const logout = useCallback(async () => {
    try {
      if (getToken()) await api.logout();
    } catch {
      /* server xatosi bo'lsa ham lokal chiqamiz */
    }
    signOutLocal();
  }, [signOutLocal]);

  const value = useMemo(
    () => ({ user, stats, ready, login, register, signIn: finishAuth, logout, refresh, setUser: saveUser }),
    [user, stats, ready, login, register, finishAuth, logout, refresh, saveUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
