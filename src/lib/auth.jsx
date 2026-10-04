// Auth holati (React context): joriy foydalanuvchi, kirish, ro'yxatdan o'tish, chiqish.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, onUnauthorized, setToken } from './api.js';
import { storage, USER_KEY } from './storage.js';

const AuthContext = createContext(null);

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

  const signOutLocal = useCallback(() => {
    clearToken();
    saveUser(null);
    setStats(null);
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
    });
  }, [refresh, saveUser]);

  const finishAuth = useCallback(
    (data) => {
      setToken(data.token);
      saveUser(data.user);
      refresh().catch(() => {});
      return data.user;
    },
    [refresh, saveUser],
  );

  const login = useCallback(async (phone, password) => finishAuth(await api.login({ phone, password })), [finishAuth]);

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
    () => ({ user, stats, ready, login, register, logout, refresh }),
    [user, stats, ready, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
