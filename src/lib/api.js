// Backend (Hono Worker) bilan aloqa. Barcha so'rovlar API_BASE + /api/... ga ketadi.
// Token `localStorage['hashar_token']` da, har so'rovda `Authorization: Bearer` sarlavhasi.
import { API_BASE } from './config.js';
import { mirrorToken } from './native.js';
import { storage, TOKEN_KEY } from './storage.js';

/**
 * Mijoz versiyasi (worker/auth.js clientVersion) — eski APK'ni ajratish uchun.
 * Sarlavha emas, `?client=3` query: CORS preflight ro'yxatini o'zgartirmaydi, shuning uchun
 * yangi APK eski (yoki orqaga qaytarilgan) worker bilan ham ishlaydi.
 */
const CLIENT_VERSION = 3;

/**
 * HTTP status bilan xato (UI faqat `message` ni ko'rsatadi).
 * `code` — serverning mashina o'qiydigan belgisi ('email_unverified', 'email_required'),
 * `retryAfter` — 429 da necha soniyadan keyin qayta urinish mumkin.
 */
export class ApiError extends Error {
  constructor(message, status = 0, { code = null, retryAfter = 0 } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// ---------- Token ----------
export const getToken = () => storage.get(TOKEN_KEY);
export const setToken = (token) => {
  storage.set(TOKEN_KEY, token);
  mirrorToken(token);
};
export const clearToken = () => {
  storage.remove(TOKEN_KEY);
  mirrorToken(null);
};

// 401 bo'lganda auth holatini xabardor qilish uchun obunachilar
const unauthorizedListeners = new Set();
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

// 403 {code: 'email_unverified'} bo'lganda "Emailni tasdiqlang" oynasini ochish uchun obunachilar
const unverifiedListeners = new Set();
export function onEmailUnverified(fn) {
  unverifiedListeners.add(fn);
  return () => unverifiedListeners.delete(fn);
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
 * @param {{method?: string, json?: any, form?: FormData, signal?: AbortSignal, keepSession?: boolean}} opts
 *   keepSession — 401 sessiyani tugatmaydi (masalan, parol o'zgartirishda joriy parol noto'g'ri)
 */
export async function request(path, { method = 'GET', json, form, signal, keepSession = false } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  let url = `${API_BASE}/api${path}`;
  // Kirgan so'rovlarda mijoz versiyasi (server eski v2 mijozni ajratadi)
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    url += `${path.includes('?') ? '&' : '?'}client=${CLIENT_VERSION}`;
  }

  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // multipart: Content-Type ni brauzer o'zi qo'yadi (boundary bilan)
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body, signal });
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
  if (res.status === 401 && token && !keepSession) {
    clearToken();
    unauthorizedListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* e'tiborsiz */
      }
    });
  }

  if (!res.ok) {
    const code = (data && data.code) || null;
    if (res.status === 403 && code === 'email_unverified') {
      unverifiedListeners.forEach((fn) => {
        try {
          fn();
        } catch {
          /* e'tiborsiz */
        }
      });
    }
    throw new ApiError((data && data.error) || fallbackMessage(res.status), res.status, {
      code,
      retryAfter: Number(res.headers.get('retry-after')) || 0,
    });
  }
  // Lokal dev / testlar (server EMAIL_MOCK=1): emailga ketmagan kod konsolda ko'rinadi
  if (data && data.dev_code) console.info(`[EMAIL_MOCK] ${data.email || ''} kodi: ${data.dev_code}`);
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
  config: () => request('/config'),
  register: (body) => request('/auth/register', { method: 'POST', json: body }), // eski (email o'chiq bo'lsa)
  registerStart: (body) => request('/auth/register/start', { method: 'POST', json: body }),
  registerVerify: (email, code) => request('/auth/register/verify', { method: 'POST', json: { email, code } }),
  login: (body) => request('/auth/login', { method: 'POST', json: body }),
  forgot: (email) => request('/auth/forgot', { method: 'POST', json: { email } }),
  reset: (email, code, new_password) => request('/auth/reset', { method: 'POST', json: { email, code, new_password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/me'),
  emailStart: (email) => request('/me/email/start', { method: 'POST', json: { email } }),
  emailVerify: (code) => request('/me/email/verify', { method: 'POST', json: { code } }),

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

  // Izohlar
  comments: (id) => request(`/hashars/${id}/comments`),
  addComment: (id, body) => request(`/hashars/${id}/comments`, { method: 'POST', json: { body } }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),

  // Profil, reyting
  user: (id) => request(`/users/${id}`),
  updateProfile: (form) => request('/me/profile', { method: 'POST', form }),
  changePassword: (current_password, new_password) =>
    request('/me/password', { method: 'POST', json: { current_password, new_password }, keepSession: true }),
  leaderboard: (period = 'all') => request(`/leaderboard${qs({ period })}`),

  // Geo (worker proksi orqali Nominatim)
  geoSearch: (q, signal) => request(`/geo/search${qs({ q })}`, { signal }),
  geoReverse: (lat, lng, signal) => request(`/geo/reverse${qs({ lat: lat.toFixed(5), lng: lng.toFixed(5) })}`, { signal }),

  // Admin panel (/api/admin/*)
  admin: {
    overview: () => request('/admin/overview'),
    users: (params) => request(`/admin/users${qs(params)}`),
    block: (id) => request(`/admin/users/${id}/block`, { method: 'POST' }),
    unblock: (id) => request(`/admin/users/${id}/unblock`, { method: 'POST' }),
    setRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'POST', json: { role } }),
    deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    hashars: (params) => request(`/admin/hashars${qs(params)}`),
    deleteHashar: (id) => request(`/admin/hashars/${id}`, { method: 'DELETE' }),
    deleteComment: (id) => request(`/admin/comments/${id}`, { method: 'DELETE' }),
  },
};
