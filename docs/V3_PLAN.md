# hasharchilar.uz v3 — reja va API shartnomasi

Maqsad: oddiy bir sahifali ilovadan ko'p sahifali, chiroyli, kuchli platformaga o'tish (sayt + Android APK, bitta React kod).
Barcha mavjud funksiyalar (auth, hashar CRUD, join/leave, complete, before/after, admin panel, APK yuklab olish) saqlanadi.

## 1. Xarita va geo API (kalitsiz, bepul)

| Vazifa | Xizmat | Izoh |
|---|---|---|
| Xarita | **MapLibre GL JS** + **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`, tungi rejim: `.../styles/dark` yoki `positron`) | vektor, kalit yo'q, limit yo'q; Leaflet o'rniga |
| Manzil qidirish (geocoding) | **Nominatim** (OSM) — FAQAT worker proksi orqali: `GET /api/geo/search?q=` | `countrycodes=uz`, `accept-language=uz`, User-Agent `hasharchilar.uz/1.0`; javob DB keshida 30 kun |
| Koordinata → manzil | Nominatim reverse — `GET /api/geo/reverse?lat=&lng=` | keshlanadi (koordinata 4 xonagacha yaxlitlanadi) |
| Yo'l ko'rsatish | Google Maps / Yandex Maps chuqur havolalar | `https://www.google.com/maps/dir/?api=1&destination=lat,lng`, `https://yandex.uz/maps/?rtext=~lat,lng&rtt=auto` |

Nominatim qoidasi: soniyasiga ≤1 so'rov → worker'da kesh + IP bo'yicha rate limit (30/daqiqa) + keshda yo'q so'rovlar uchun umumiy navbat (≥ 1.1 s oraliq, 3 s dan keyin 503); mijozda avtomatik to'ldirish yo'q (qidiruv Enter / "Qidirish" bilan).

## 2. Backend o'zgarishlari (migration 0003 — mavjud ma'lumotli bazada ishlashi SHART, NOT NULL → DEFAULT)

- `hashars.category TEXT NOT NULL DEFAULT 'cleaning' CHECK IN ('cleaning','greening','repair','other')`
- `hashars.max_volunteers INTEGER` (NULL = cheklanmagan)
- `users.bio TEXT NOT NULL DEFAULT ''`, `users.avatar_key TEXT`, `users.district TEXT NOT NULL DEFAULT ''`
- `comments(id PK, hashar_id → hashars ON DELETE CASCADE, user_id → users ON DELETE CASCADE, body TEXT 1..500, created_at)` + index
- `geo_cache(key TEXT PK, value TEXT NOT NULL, created_at INTEGER NOT NULL)`

HasharDTO ga qo'shiladi: `category`, `max_volunteers`, `comment_count`, `creator.avatar_url`.

Yangi/yangilangan endpointlar:

| Metod | Yo'l | Auth | Javob |
|---|---|---|---|
| GET | `/api/hashars` | ixt. | mavjud + filtrlar: `category`, `from`/`to` (YYYY-MM-DD), `near=lat,lng` + `radius_km` (masofa bo'yicha tartib, DTO da `distance_km`) |
| POST | `/api/hashars` | ✓ | mavjud + `category`, `max_volunteers` maydonlari |
| POST | `/api/hashars/:id/join` | ✓ | to'lgan bo'lsa 409 "Joy qolmadi" |
| GET | `/api/hashars/:id/comments` | ixt. | `[{id, body, created_at, user:{id,name,avatar_url}, is_mine}]` (eski→yangi) |
| POST | `/api/hashars/:id/comments` | ✓ | `{body}` → 201 comment; rate limit 20/soat |
| DELETE | `/api/comments/:id` | ✓ | o'z izohi yoki admin |
| GET | `/api/users/:id` | ixt. | ommaviy profil `{id,name,bio,district,avatar_url,created_at, stats:{created,joined,completed}, hashars:[created, oxirgi 20]}` (telefon YO'Q) |
| PATCH→POST | `/api/me/profile` | ✓ | multipart `name?, bio?, district?, avatar?` (rasm ≤5MB, R2 `avatars/<uuid>.<ext>`) → `{user}` |
| GET | `/api/leaderboard?period=all|month` | – | `[{user:{id,name,avatar_url,district}, joined, completed, created, score}]` top 50; score = completed*10 + joined*3 + created*5 |
| GET | `/api/geo/search?q=` | – | `[{name, display, lat, lng}]` max 6 |
| GET | `/api/geo/reverse?lat=&lng=` | – | `{display, district, city}` |
| GET | `/api/media/avatars/:file` | – | avatar rasm (media allowlist ga `avatars` qo'shiladi) |
| GET | `/api/stats` | – | mavjud + `this_month`, `trees_planted?` YO'Q — faqat `{hashars, completed, volunteers, upcoming, districts}` |

CORS metodlari o'zgarmaydi (GET, POST, DELETE, OPTIONS) — shuning uchun profil yangilash POST.
`/api/me` javobidagi user: `bio, district, avatar_url` ham.
Admin panel: hashars ro'yxatida `category`, izohlarni o'chirish `DELETE /api/admin/comments/:id` (ixtiyoriy).

## 3. Frontend — ko'p sahifali (hash router; APK da ham ishlaydi)

Marshrutlar (`#/...`):
- `#/` **Bosh sahifa** — katta hero (rasm/illyustratsiya, CTA), jonli statistika, "Yaqinlashayotgan hasharlar" karusel, "Qanday ishlaydi" 3 qadam, kategoriyalar, "Oldin/Keyin" vitrina, top ko'ngillilar, APK yuklab olish bloki, footer.
- `#/xarita` — to'liq ekran MapLibre xarita, klaster, kategoriya filtr chiplari, pastki sheet ro'yxat (mobil), "Mening joyim".
- `#/hasharlar` — ro'yxat: qidiruv, filtrlar (holat, kategoriya, sana, masofa), saralash.
- `#/hashar/:id` — to'liq sahifa: rasm/slayder, xarita mini, tafsilotlar, ko'ngillilar avatarlari, progress (max_volunteers), izohlar, ulashish (Web Share / Capacitor Share), yo'l ko'rsatish, kalendarga qo'shish (.ics), egasi uchun yakunlash/o'chirish.
- `#/yaratish` — sahifa (modal emas): qadamlar, xaritada pin + manzil qidirish + reverse geocode avtomatik manzil, kategoriya kartalari, sana/vaqt, max ko'ngillilar, narsalar, rasm (kamera/galereya).
- `#/natijalar` — Oldin/Keyin galereya.
- `#/reyting` — leaderboard (oy / umumiy), podium top-3.
- `#/profil` — o'z profilim: avatar, bio, tuman, statistika, nishonlar (badges: 1-hashar, 5 ta, 10 ta, tashkilotchi…), mening hasharlarim, sozlamalar (tungi rejim, chiqish), admin tugmasi.
- `#/u/:id` — ommaviy profil.
- `#/haqida` — loyiha haqida + FAQ.
- `#/kirish` — kirish/ro'yxat sahifasi (modal ham qoladi).
- `#admin` — mavjud admin panel (`#/admin` ham ishlasin).
- 404 sahifa.

Dizayn: emerald asosiy, amber faqat CTA; tungi rejim (dark mode, tizimga ergashadi + qo'lda); silliq animatsiyalar (sahifa o'tishi, skeletonlar); ikonkalar bir xil; tipografiya — Inter/Manrope (fontsource, offline ishlashi uchun bundle).
Desktop: yuqori navigatsiya. Mobil va APK: **pastki tab bar** (Bosh · Xarita · ＋ · Natijalar · Profil), katta markaziy ＋ tugma.

APK (Capacitor 8) qo'shimcha pluginlar: `@capacitor/haptics`, `@capacitor/share`, `@capacitor/geolocation`, `@capacitor/camera` (ixtiyoriy, fayl input fallback), `@capacitor/network` (oflayn banner), `@capacitor/preferences` (token). Android ruxsatlari mos. Orqaga tugmasi: modal → sahifa tarixi → chiqish. Pull-to-refresh ro'yxatlarda.
