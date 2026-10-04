// Manzil qidirish va koordinata → manzil: Nominatim (OpenStreetMap) proksisi, DB keshi bilan.
// Nominatim qoidalari: ≤ 1 so'rov/soniya, aniq User-Agent — shuning uchun mijozlar to'g'ridan-to'g'ri emas,
// faqat shu yer orqali murojaat qiladi; javoblar geo_cache da 30 kun saqlanadi, IP bo'yicha 30/daqiqa limit.
// Testlar tarmoqqa chiqmaydi: env.GEO_MOCK === '1' bo'lsa deterministik soxta javoblar (fakeUpstream).
import { Hono } from 'hono';
import { limitGeo } from './ratelimit.js';
import { HttpError, ValidationError, charLength, cleanLine } from './validate.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'hasharchilar.uz/1.0 (+https://hasharchilar-api.davlatsudekspert.workers.dev)';
const CACHE_TTL_SEC = 30 * 24 * 3600;
const UPSTREAM_TIMEOUT_MS = 8000;
const RESULTS_MAX = 6;
const UPSTREAM_ERROR = 'Manzil xizmati vaqtincha ishlamayapti';

// ---------- Kiruvchi qiymatlar ----------

/** Qidiruv so'zi: 2..120 belgi. Kesh kaliti uchun kichik harf + bitta bo'shliq. */
export function parseGeoQuery(raw) {
  const q = cleanLine(raw);
  const n = charLength(q);
  if (n < 2 || n > 120) throw new ValidationError("Qidiruv so'zi 2–120 belgidan iborat bo'lsin");
  return q;
}

function parseCoordParam(raw, max, label) {
  const s = String(raw ?? '').trim();
  const n = /^-?\d{1,3}(\.\d+)?$/.test(s) ? Number(s) : NaN;
  if (!(Math.abs(n) <= max)) throw new ValidationError(`${label} noto'g'ri`);
  return n;
}

// ---------- Upstream ----------

class UpstreamError extends Error {}

/** Nominatim'ga so'rov (JSON). Xato/timeout/yaroqsiz javob → UpstreamError. */
async function nominatim(path, params) {
  const url = new URL(path, NOMINATIM);
  for (const [k, v] of Object.entries({ format: 'jsonv2', 'accept-language': 'uz,ru', ...params })) {
    url.searchParams.set(k, String(v));
  }
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    throw new UpstreamError(`fetch: ${err?.message ?? err}`);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new UpstreamError(`status ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new UpstreamError('JSON emas');
  }
}

/**
 * Testlar uchun deterministik "Nominatim": tarmoqqa chiqmaydi.
 * - qidiruvda 'upstream-xato' → xato (502); 'hech-narsa' → []; aks holda 3 ta natija
 * - reverse: lat ≤ -89 → xato (502); lat = 0 va lng = 0 → topilmadi; aks holda Toshkent/Chilonzor
 */
function fakeUpstream(kind, params) {
  if (kind === 'search') {
    const q = params.q;
    if (q.toLowerCase().includes('upstream-xato')) throw new UpstreamError('mock');
    if (q.toLowerCase().includes('hech-narsa')) return [];
    return Array.from({ length: 3 }, (_, i) => ({
      name: `${q} ${i + 1}`,
      display_name: `${q} ${i + 1}, Chilonzor tumani, Toshkent, O'zbekiston`,
      lat: String(41.28 + i / 100),
      lon: String(69.2 + i / 100),
    }));
  }
  const lat = Number(params.lat);
  const lng = Number(params.lon);
  if (lat <= -89) throw new UpstreamError('mock');
  if (lat === 0 && lng === 0) return { error: 'Unable to geocode' };
  return {
    display_name: `Bunyodkor ko'chasi, Chilonzor tumani, Toshkent, O'zbekiston (${params.lat}, ${params.lon})`,
    address: { road: "Bunyodkor ko'chasi", city_district: 'Chilonzor tumani', city: 'Toshkent', country: "O'zbekiston" },
  };
}

const upstream = (env, kind, path, params) =>
  env.GEO_MOCK === '1' ? Promise.resolve().then(() => fakeUpstream(kind, params)) : nominatim(path, params);

// ---------- Javob shakllari ----------

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
};

/** Nominatim search natijalari → [{name, display, lat, lng}] (≤ 6). */
function shapeSearch(data) {
  if (!Array.isArray(data)) throw new UpstreamError('massiv emas');
  const out = [];
  for (const r of data) {
    const lat = num(r?.lat);
    const lng = num(r?.lon);
    const display = String(r?.display_name ?? '');
    if (lat == null || lng == null || !display) continue;
    out.push({ name: String(r.name || display.split(',')[0]).trim(), display, lat, lng });
    if (out.length >= RESULTS_MAX) break;
  }
  return out;
}

/** Nominatim reverse → {display, district, city} (topilmasa — bo'sh satrlar). */
function shapeReverse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new UpstreamError('obyekt emas');
  const a = data.address && typeof data.address === 'object' ? data.address : {};
  const pick = (...keys) => String(keys.map((k) => a[k]).find((v) => typeof v === 'string' && v) ?? '');
  return {
    display: String(data.display_name ?? ''),
    district: pick('city_district', 'district', 'county', 'suburb', 'borough'),
    city: pick('city', 'town', 'village', 'municipality', 'state'),
  };
}

// ---------- Kesh ----------

async function cacheGet(db, key) {
  const row = await db
    .prepare('SELECT value FROM geo_cache WHERE key = ?1 AND created_at > ?2')
    .bind(key, Math.floor(Date.now() / 1000) - CACHE_TTL_SEC)
    .first();
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

async function cachePut(db, key, value) {
  const now = Math.floor(Date.now() / 1000);
  const stmts = [
    db
      .prepare(
        `INSERT INTO geo_cache (key, value, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`,
      )
      .bind(key, JSON.stringify(value), now),
  ];
  // Vaqti-vaqti bilan eskirgan yozuvlarni tozalash (~2%)
  if (Math.random() < 0.02) stmts.push(db.prepare('DELETE FROM geo_cache WHERE created_at <= ?1').bind(now - CACHE_TTL_SEC));
  await db.batch(stmts);
}

/** Kesh → bo'lmasa upstream (+ keshga yozish). `x-geo-cache: hit|miss` header'i qo'yiladi. */
async function cached(c, key, load) {
  const db = c.env.DB;
  const hit = await cacheGet(db, key);
  if (hit !== undefined) {
    c.header('x-geo-cache', 'hit');
    return hit;
  }
  let value;
  try {
    value = await load();
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error('Nominatim:', err.message);
      throw new HttpError(502, UPSTREAM_ERROR);
    }
    throw err;
  }
  await cachePut(db, key, value);
  c.header('x-geo-cache', 'miss');
  return value;
}

// ---------- Marshrutlar ----------

export const geoRoutes = new Hono();

// Test rejimi javobda ko'rinadi (testlar mock bo'lmagan serverda tarmoqqa chiqadigan testlarni o'tkazib yuboradi)
geoRoutes.use('*', async (c, next) => {
  await next();
  if (c.env.GEO_MOCK === '1') c.res.headers.set('x-geo-source', 'mock');
});

// GET /api/geo/search?q= → [{name, display, lat, lng}] (≤ 6, faqat O'zbekiston)
geoRoutes.get('/search', async (c) => {
  const q = parseGeoQuery(c.req.query('q'));
  await limitGeo(c);
  const key = `s:${q.toLowerCase()}`;
  const value = await cached(c, key, async () =>
    shapeSearch(await upstream(c.env, 'search', '/search', { q, countrycodes: 'uz', limit: RESULTS_MAX })),
  );
  return c.json(value);
});

// GET /api/geo/reverse?lat=&lng= → {display, district, city}; koordinata 4 xonagacha yaxlitlanadi (~11 m)
geoRoutes.get('/reverse', async (c) => {
  const lat = parseCoordParam(c.req.query('lat'), 90, 'Kenglik (lat)');
  const lng = parseCoordParam(c.req.query('lng'), 180, 'Uzunlik (lng)');
  await limitGeo(c);
  const round4 = (x) => (Math.round(x * 1e4) / 1e4 + 0).toFixed(4); // + 0: -0 → 0
  const rlat = round4(lat);
  const rlng = round4(lng);
  const value = await cached(c, `r:${rlat},${rlng}`, async () =>
    shapeReverse(await upstream(c.env, 'reverse', '/reverse', { lat: rlat, lon: rlng, zoom: 18, addressdetails: 1 })),
  );
  return c.json(value);
});
