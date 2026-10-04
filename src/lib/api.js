// Backend (Hono Worker) bilan aloqa. Barcha so'rovlar API_BASE + /api/... ga ketadi.
// Token `localStorage['hashar_token']` da, har so'rovda `Authorization: Bearer` sarlavhasi.
import { API_BASE } from './config.js';
import { storage, TOKEN_KEY } from './storage.js';

/** HTTP status bilan xato (UI faqat `message` ni ko'rsatadi). */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ---------- Token ----------
export const getToken = () => storage.get(TOKEN_KEY);
export const setToken = (token) => storage.set(TOKEN_KEY, token);
export const clearToken = () => storage.remove(TOKEN_KEY);

// 401 bo'lganda auth holatini xabardor qilish uchun obunachilar
const unauthorizedListeners = new Set();
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

/** Server xato matn qaytarmasa — status bo'yicha o'zbekcha xabar. */
function fallbackMessage(status) {
  if (status === 401) return 'Iltimos, tizimga qayta kiring';
  if (status === 403) return "Bu amalga ruxsat yo'q";
  if (status === 404) return 'Topilmadi';
  if (status === 413) return 'Rasm juda katta (5 MB gacha)';
  if (status === 429) return "Juda ko'p urinish. Birozdan so'ng qayta urining";
  if (status >= 500) return "Server xatosi. Keyinroq urinib ko'ring";
  return "So'rov bajarilmadi";
}

/**
 * Umumiy so'rov funksiyasi.
 * @param {string} path  "/hashars" kabi (oldiga /api qo'shiladi)
 * @param {{method?: string, json?: any, form?: FormData, signal?: AbortSignal}} opts
 */
export async function request(path, { method = 'GET', json, form, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // multipart: Content-Type ni brauzer o'zi qo'yadi (boundary bilan)
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body, signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('Internet aloqasini tekshiring', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* JSON bo'lmagan javob */
  }

  // Sessiya eskirgan — tokenni tozalab, auth holatini xabardor qilamiz
  if (res.status === 401 && token) {
    clearToken();
    unauthorizedListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* e'tiborsiz */
      }
    });
  }

  if (!res.ok) throw new ApiError((data && data.error) || fallbackMessage(res.status), res.status);
  return data;
}

/** Ro'yxat so'rovi uchun query satri. */
const qs = (params) => {
  const s = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => v != null && v !== '' && s.set(k, v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

// ---------- API metodlari (SPEC 5-bo'lim) ----------
export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', json: body }),
  login: (body) => request('/auth/login', { method: 'POST', json: body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/me'),

  // Umumiy
  stats: () => request('/stats'),
  appInfo: () => request('/app'),

  // Hasharlar
  listHashars: (params) => request(`/hashars${qs(params)}`),
  getHashar: (id) => request(`/hashars/${id}`),
  createHashar: (form) => request('/hashars', { method: 'POST', form }),
  join: (id) => request(`/hashars/${id}/join`, { method: 'POST' }),
  leave: (id) => request(`/hashars/${id}/join`, { method: 'DELETE' }),
  complete: (id, form) => request(`/hashars/${id}/complete`, { method: 'POST', form }),
  remove: (id) => request(`/hashars/${id}`, { method: 'DELETE' }),
};
