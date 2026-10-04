# hasharchilar.uz — Texnik spetsifikatsiya (v2, to'liq qayta qurish)

Bu hujjat — barcha qismlar (backend, web, Android APK, CI) uchun YAGONA shartnoma.
Har bir qism shu yerdagi API va nomlarga aynan rioya qiladi.

## 0. Maqsad

Ultra-oddiy platforma: mahalladagi hasharlarni (tozalash/ko'kalamzorlashtirish) xaritada ko'rish,
bir bosishda qo'shilish, yangi hashar e'lon qilish, "Oldin/Keyin" natijalarni ko'rish.
Bitta React kod bazasi → (1) sayt (Cloudflare Worker + Static Assets), (2) Android APK (Capacitor).

## 1. Stek va papkalar (`hasharchilar/` ichida)

```
hasharchilar/
├── package.json            # bitta package: web + worker + capacitor
├── wrangler.jsonc          # Worker "hasharchilar-api", D1 binding DB YOKI Durable Object HASHAR_DB (HasharDB),
│                           #   R2 binding PHOTOS, assets ./dist (binding ASSETS)
├── capacitor.config.json   # appId uz.hasharchilar.app, appName "Hasharchilar", webDir dist
├── migrations/0001_init.sql# baza sxemasi (D1: wrangler d1 migrations apply; DO: o'zi qo'llaydi)
├── schema.sql              # = migrations birlashtirilgani (lokal qulaylik uchun)
├── seed.sql                # FAQAT lokal dev namuna ma'lumot
├── worker/                 # Hono backend
│   ├── index.js            #   app, CORS, marshrutlar ulanishi, onError; env.DB yo'q bo'lsa DO adapteri
│   ├── do-db.js, d1-adapter.js #   SQLite Durable Object HasharDB va uning D1 bilan bir xil API adapteri
│   ├── auth.js             #   parol xesh (PBKDF2), sessiya, requireAuth middleware
│   ├── hashars.js          #   hashar marshrutlari
│   ├── admin.js            #   /api/admin/* (admin panel)
│   ├── media.js            #   R2 yuklash/berish, APK yuklab olish
│   ├── ratelimit.js        #   D1 asosidagi oddiy limitlagich
│   └── validate.js         #   kirish tekshiruvi
├── tests/api.test.mjs      # wrangler dev'ga qarshi to'liq API testi (node:test)
├── src/                    # React web (sayt + APK uchun bir xil)
├── android/                # Capacitor Android loyihasi (commit qilinadi)
├── scripts/                # yordamchi skriptlar (ikonka generatsiyasi va h.k.)
└── README.md
```

Versiyalar: React 18, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), MapLibre GL 5 (v3 dan; Leaflet o'rniga), Hono 4, wrangler 4,
Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`,
`@capacitor/status-bar`, `@capacitor/splash-screen`). JDK 21 (Capacitor 8 talabi).

## 2. Brending

- Asosiy: emerald (`emerald-600`/`emerald-700`). CTA/marker/ogohlantirish: amber (`amber-400`/`amber-500`).
- Fon `slate-50`, matn `slate-900`, kartalar oq, `rounded-2xl`, yumshoq soya. Mobile-first.
- Logo: "hashar" (emerald) + "chilar" (amber) + ".uz" (slate-400), yonida barg ikonkasi (emerald kvadrat).
- Til: o'zbek (lotin). Barcha UI matnlari o'zbekcha.

## 3. D1 sxemasi (`migrations/0001_init.sql`)

```sql
users(id INTEGER PK AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, email TEXT, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))
sessions(token_hash TEXT PK, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         created_at TEXT DEFAULT now, expires_at TEXT NOT NULL)  + INDEX(user_id)
hashars(id PK, title, description DEFAULT '', address DEFAULT '', lat REAL CHECK, lng REAL CHECK,
        date_time TEXT NOT NULL /* 'YYYY-MM-DDTHH:MM' Toshkent vaqti */, items TEXT DEFAULT '[]' /* JSON */,
        status TEXT DEFAULT 'PENDING' CHECK IN ('PENDING','COMPLETED'), creator_id REFERENCES users(id),
        completed_at TEXT, created_at)  + INDEX(status, date_time), INDEX(creator_id)
hashar_media(id PK, hashar_id REFERENCES hashars ON DELETE CASCADE, photo_type CHECK IN ('BEFORE','AFTER'),
             r2_key TEXT NOT NULL, r2_url TEXT NOT NULL /* /api/media/<r2_key> */, created_at) + INDEX(hashar_id)
volunteers(id PK, hashar_id REFERENCES hashars ON DELETE CASCADE, user_id REFERENCES users ON DELETE CASCADE,
           joined_at, UNIQUE(hashar_id, user_id))
rate_limits(key TEXT PK, window_start INTEGER NOT NULL, count INTEGER NOT NULL)
```

`migrations/0002_admin.sql`: `users.role TEXT NOT NULL DEFAULT 'user' CHECK IN ('user','admin')`, `users.blocked_at TEXT` (NULL — bloklanmagan).

`migrations/0003_v3.sql` (DO rejimida production ma'lumotlari ustida qo'llanadi — barcha NOT NULL ustunlarda DEFAULT):
```sql
hashars.category TEXT NOT NULL DEFAULT 'cleaning' CHECK IN ('cleaning','greening','repair','other')
hashars.max_volunteers INTEGER CHECK (NULL OR 2..1000)          -- NULL = cheklanmagan, tashkilotchi ham hisobda
users.bio TEXT NOT NULL DEFAULT '' CHECK (length ≤ 300)
users.district TEXT NOT NULL DEFAULT '' CHECK (length ≤ 60)
users.avatar_key TEXT                                           -- R2: avatars/<uuid>.<ext>
comments(id PK, hashar_id REFERENCES hashars ON DELETE CASCADE, user_id REFERENCES users ON DELETE CASCADE,
         body TEXT NOT NULL CHECK (length 1..500), created_at)  + INDEX(hashar_id, id), INDEX(user_id)
geo_cache(key TEXT PK, value TEXT NOT NULL /* JSON */, created_at INTEGER NOT NULL /* unix */) + INDEX(created_at)
```

`migrations/0004_email.sql` (DO rejimida production ma'lumotlari ustida; `users` jadvali qayta qurilmaydi — `phone NOT NULL` qoladi):
```sql
-- avval: users.email = NULLIF(lower(trim(email)), ''), takrorlari (eng kichik id dan tashqari) NULL
users.email_verified_at TEXT                                    -- NULL — tasdiqlanmagan (eski hisoblar)
UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL   -- emaillar trim + kichik harf
email_otps(id PK, email TEXT NOT NULL, purpose TEXT NOT NULL CHECK IN ('register','reset','verify'),
           user_id INTEGER, code_hash TEXT NOT NULL /* sha256(purpose|email|code) hex */,
           payload TEXT /* register: {name, phone, password_hash}; ishlatilgach NULL */,
           attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL /* unix */,
           consumed_at INTEGER)  + INDEX(email, purpose, created_at), INDEX(user_id) WHERE user_id IS NOT NULL
```

## 4. Autentifikatsiya

- Ro'yxat: ism + email + telefon (+998XXXXXXXXX ga normallashtiriladi) + parol (≥ 6 belgi); email xizmati
  yoqilgan bo'lsa — faqat email kodi orqali (5.2-bo'lim). Kirish — telefon yoki email + parol.
- Parol: PBKDF2-SHA256, 100 000 iteratsiya (Workers limiti), 16 bayt tasodifiy salt.
  Saqlash formati: `pbkdf2$100000$<salt_b64>$<hash_b64>`. Solishtirish — doimiy vaqtli.
- Sessiya: 32 bayt tasodifiy token (base64url) → mijozga; DB'da faqat SHA-256 xeshi. Muddat 90 kun.
- Mijoz tokenni `localStorage['hashar_token']` da saqlaydi va har so'rovda `Authorization: Bearer <token>` yuboradi
  (sayt ham, APK ham — cookie ishlatilmaydi, shuning uchun CSRF muammosi yo'q).
- Login/ro'yxat rate-limit: IP bo'yicha 10 urinish / 15 daqiqa → 429.

## 5. API (barcha javoblar JSON; xato: `{ "error": "<o'zbekcha matn>" }` + mos status)

Umumiy Hashar obyekti (`HasharDTO`):
```json
{ "id": 1, "title": "...", "description": "...", "address": "...", "lat": 41.3, "lng": 69.2,
  "date_time": "2027-10-11T09:00", "items": ["Qo'lqop"], "status": "PENDING" | "COMPLETED",
  "creator": { "id": 3, "name": "Aziz" }, "volunteer_count": 12,
  "before_url": "/api/media/before/<uuid>.jpg" | null, "after_url": "..." | null,
  "joined": true|false /* joriy foydalanuvchi qo'shilganmi; mehmon uchun false */,
  "is_owner": true|false, "created_at": "...", "completed_at": "..." | null }
```
`before_url`/`after_url` — NISBIY yo'l. Mijoz uni `API_BASE + url` qilib ishlatadi (APK uchun muhim).

| Metod | Yo'l | Auth | Tavsif |
|---|---|---|---|
| POST | `/api/auth/register` | – | `{name, phone, password}` → 201 `{token, user}`; telefon band → 409 |
| POST | `/api/auth/login` | – | `{phone, password}` → `{token, user}`; noto'g'ri → 401 "Telefon yoki parol noto'g'ri" |
| POST | `/api/auth/logout` | ✓ | sessiyani o'chiradi → `{ok:true}` |
| GET | `/api/me` | ✓ | `{user:{id,name,phone,created_at}, stats:{created, joined, completed}}` |
| GET | `/api/stats` | – | `{hashars, completed, volunteers}` (hero uchun umumiy raqamlar) |
| GET | `/api/hashars` | ixtiyoriy | `HasharDTO[]`; query: `status=PENDING|COMPLETED`, `mine=created|joined` (auth kerak), `q=` qidiruv. Tartib: PENDING sana bo'yicha o'sish, keyin COMPLETED eng yangisi. Max 300 |
| GET | `/api/hashars/:id` | ixtiyoriy | `HasharDTO` + `volunteers: [{id, name}]` + `creator.phone` (faqat joined yoki owner bo'lsa, aks holda yo'q) |
| POST | `/api/hashars` | ✓ | multipart: `title, description, address, lat, lng, date_time, items(JSON massiv), photo?` → 201 `HasharDTO`. Yaratuvchi avtomatik qatnashuvchi. Rate limit: 10/soat/foydalanuvchi |
| POST | `/api/hashars/:id/join` | ✓ | idempotent → `{joined:true, volunteer_count}`; COMPLETED → 409 |
| DELETE | `/api/hashars/:id/join` | ✓ | chiqish → `{joined:false, volunteer_count}`; egasi chiqa olmaydi → 409 |
| POST | `/api/hashars/:id/complete` | ✓ egasi | multipart `photo` (AFTER, majburiy) → `HasharDTO` (status COMPLETED, completed_at) |
| DELETE | `/api/hashars/:id` | ✓ egasi | faqat PENDING; R2 rasmlarini ham o'chiradi → `{ok:true}` |
| GET | `/api/media/:folder/:file` | – | R2 dan rasm; `folder ∈ {before, after}`; immutable cache, nosniff |
| GET | `/api/app` | – | `{available: bool, version: string|null, versionCode: number|null, size: number|null, url: "/api/app/download"}` (statik `/app/hasharchilar.apk` + `/app/version.json`; zaxira — R2 `app/hasharchilar.apk`) |
| GET | `/api/app/download` | – | APK fayl, `content-type: application/vnd.android.package-archive`, `content-disposition: attachment; filename="hasharchilar.apk"` |
| GET | `/api/health` | – | `{ok:true}` |

**Admin panel** (`/api/admin/*`, mehmon → 401, admin emas → 403). Admin = `users.role = 'admin'` YOKI telefon
Worker secret `ADMIN_PHONES` da (vergul bilan, `parsePhone` bilan normallashtiriladi). `user` obyektida `is_admin`.
Bloklangan foydalanuvchi: kirish → 403 "Hisobingiz bloklangan", token qabul qilinmaydi, bloklashda sessiyalari o'chadi.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/api/admin/overview` | `{users, admins, blocked, hashars, pending, completed, volunteers, media, signups_7d, hashars_7d, recent_hashars[5], recent_users[5]}` |
| GET | `/api/admin/users?q=&offset=&limit=` | `{items:[{id,name,phone,role,is_admin,env_admin,blocked_at,created_at,created_count,joined_count}], total}`; limit ≤ 100 |
| POST | `/api/admin/users/:id/block` · `/unblock` · `/role {role}` | → `{user}`; o'ziga yoki `ADMIN_PHONES` admin'iga (bloklash/oddiy qilish) → 409; bloklash sessiyalarni va boshqalarning hali bo'lmagan PENDING hasharlaridagi (sanasi "hozir − 3 soat" dan keyin) qatnashuvlarni o'chiradi (o'z hasharlari, COMPLETED tarixi va o'tib ketgan, yakunlanmagan hasharlardagi qatnashuv qoladi; blokdan chiqarilganda tiklanmaydi) |
| DELETE | `/api/admin/users/:id` | foydalanuvchi + sessiyalar, qatnashuvlar, hasharlari (+ media, R2) → `{ok:true}`; o'zi / `ADMIN_PHONES` → 409 |
| GET | `/api/admin/hashars?status=&q=&offset=&limit=` | `{items: HasharDTO + creator.phone, total}` |
| DELETE | `/api/admin/hashars/:id` | istalgan holat; R2 rasmlari ham → `{ok:true}` |

| DELETE | `/api/admin/comments/:id` | istalgan izoh → `{ok:true}`; yo'q → 404 |

Admin `overview` da `comments` (izohlar soni) ham bor; `hashars` ro'yxatidagi DTO da `category`.

### 5.2. Email: ro'yxat, kirish, parolni tiklash, tasdiqlash (Resend)

`emailEnabled(env)` = `RESEND_API_KEY` bor YOKI `EMAIL_MOCK === '1'` (faqat lokal/test: xat yuborilmaydi, javobda
`dev_code`). Xat: `POST https://api.resend.com/emails`, `Authorization: Bearer <RESEND_API_KEY>`,
`{from: RESEND_FROM || 'Hasharchilar <no-reply@nfcstore.uz>', to: [email], subject, html, text}`, 8 s timeout;
xato/2xx emas → 502 `"Email yuborilmadi, birozdan keyin qayta urinib ko'ring"` (logda faqat Resend statusi).
Xato javoblarida mashina o'qiydigan `code` bo'lishi mumkin: `{ "error": "...", "code": "..." }`.

Kod qoidalari: 6 raqam (`crypto.getRandomValues`, rejection sampling); bazada `sha256(purpose|email|code)`;
muddat 10 daqiqa; 5 ta noto'g'ri urinish → kod o'ladi (urinish atomar band qilinadi); ishlatilgan kod qayta
ishlamaydi; yangi kod shu email+maqsad (verify'da — shu foydalanuvchi) eskilarini bekor qiladi; solishtirish
doimiy vaqtda. Qayta yuborish: email+maqsad bo'yicha 60 s (429 + `Retry-After`; kod ishlatilgach bekor);
bitta emailga 5 / soat (barcha maqsadlar), bitta IP dan 20 / soat. Test uchun (faqat `EMAIL_MOCK=1`):
`x-test-otp-ttl` / env `OTP_TTL_SEC`, `x-test-otp-cooldown`, `x-test-legacy-register: 1`.

| Metod | Yo'l | Auth | Tavsif |
|---|---|---|---|
| GET | `/api/config` | – | `{email_enabled}` |
| POST | `/api/auth/register/start` | – | `{name, phone, email, password}` → validatsiya (`parseName/parseEmail/parsePhone/parsePassword`), telefon yoki email band → 409, parol xeshi hozir hisoblanib kod payload'iga yoziladi → `{ok, email, expires_in: 600, resend_in: 60}` (+ `dev_code` faqat mock). Email o'chiq → 503 `"Email xizmati sozlanmagan"` |
| POST | `/api/auth/register/verify` | – | `{email, code}` → noto'g'ri → 400 `"Kod noto'g'ri"` (urinish +1); eskirgan/o'lgan/ishlatilgan → 400 `"Kod eskirgan, yangisini so'rang"`; telefon/email qayta tekshiriladi (409); hisob `email`, `email_verified_at` bilan yaratiladi → 201 `{token, user}` |
| POST | `/api/auth/register` | – | eski APK'lar: email yoqilgan bo'lsa 410 `{error: "Ilovani yangilang: ro'yxatdan o'tish endi email orqali", code: "email_required"}`, aks holda avvalgidek |
| POST | `/api/auth/login` | – | `{login, password}` (`@` bor — email, katta-kichik harfsiz, faqat tasdiqlangan) yoki eski `{phone, password}`; limitlar va soxta PBKDF2 avvalgidek; noto'g'ri → 401 `"Telefon yoki parol noto'g'ri"` / `"Email yoki parol noto'g'ri"`; bloklangan → 403 |
| POST | `/api/auth/forgot` | – | `{email}` → doim 200 `{ok, email, expires_in, resend_in}`; `reset` kodi faqat shu email tasdiqlangan va bloklanmagan hisob bo'lsa yaratiladi (xat fonda); limitlar hisob borligidan qat'i nazar bir xil |
| POST | `/api/auth/reset` | – | `{email, code, new_password}` → yangi parol xeshi, foydalanuvchining BARCHA sessiyalari o'chadi, yangi sessiya → `{token, user}` |
| POST | `/api/me/email/start` | ✓ | `{email}` → boshqa hisobda → 409; o'zining tasdiqlangan emaili → 400; `verify` kodi shu foydalanuvchiga bog'lanadi → `{ok, email, expires_in, resend_in}` |
| POST | `/api/me/email/verify` | ✓ | `{code}` → `users.email`, `email_verified_at` → `{user}` |

**Email majburiy** (faqat `emailEnabled`): `requireVerifiedEmail` — kirish + `email_verified_at`, aks holda 403
`{error: "Avval emailingizni tasdiqlang", code: "email_unverified"}`. Qo'llanadi: `POST /api/hashars`,
`POST|DELETE /api/hashars/:id/join`, `POST /api/hashars/:id/complete`, `DELETE /api/hashars/:id`,
`POST /api/hashars/:id/comments`. Kirish, ko'rish, `/api/me/*` (profil, parol, email) va `/api/admin/*` — cheklanmaydi.
v3+ mijozlar token bilan so'rovlarda `?client=3` query yuboradi (`X-Client: hasharchilar/3` sarlavhasi ham qabul
qilinadi). Query tanlangani: CORS preflight ro'yxati o'zgarmaydi, ya'ni yangi APK eski yoki orqaga qaytarilgan
worker bilan ham ishlayveradi. Belgisiz (eski v2 APK — email oynasi yo'q) mijozga shu holatda 403
`{error: "Ilovani yangilang: …", code: "app_update_required"}` qaytadi.

`user` (o'ziga: `/api/me`, kirish, ro'yxat, profil): `+ email` (null bo'lishi mumkin), `email_verified` (boolean).
Admin `users` ro'yxati: `+ email, email_verified`, qidiruv emailni ham qamraydi; foydalanuvchi o'chirilganda
`email_otps` ham o'chadi. Ommaviy javoblarda (users/:id, leaderboard, izohlar, hashar, ko'ngillilar) email YO'Q.

### 5.1. v3 qo'shimchalari (docs/V3_PLAN.md 2-bo'lim)

`HasharDTO` ga: `category`, `max_volunteers` (null — cheklanmagan), `comment_count`, `creator.avatar_url` (null yoki
`/api/media/avatars/<uuid>.<ext>`); `near` filtri bilan — `distance_km` (2 xona). Tafsilotdagi `volunteers[]`:
`{id, name, avatar_url}`. `user` obyekti (`/api/me`, kirish, ro'yxat, profil): `+ bio, district, avatar_url`.

| Metod | Yo'l | Auth | Tavsif |
|---|---|---|---|
| GET | `/api/hashars` | ixt. | qo'shimcha query: `category=greening` yoki `greening,repair` (noto'g'ri → 400); `from`/`to` = `YYYY-MM-DD` (Toshkent sanasi, ikkala chegara ham kiradi; `from > to` → 400); `near=lat,lng` + `radius_km` (standart 50, 0.1–1000) — SQL'da to'rtburchak va taxminiy masofa bo'yicha eng yaqin 300 ta (sana bo'yicha emas), JS'da aniq haversine, radius ichidagilar eng yaqini birinchi, `distance_km` bilan |
| POST | `/api/hashars` | ✓ | `+ category` (bo'sh → `cleaning`), `+ max_volunteers` (bo'sh → null, aks holda butun 2–1000) |
| POST | `/api/hashars/:id/join` | ✓ | joy to'lgan → 409 `"Joy qolmadi"` (shart INSERT ichida, bitta tranzaksiya); allaqachon a'zo → 200 |
| GET | `/api/hashars/:id/comments` | ixt. | `[{id, body, created_at, user:{id,name,avatar_url}, is_mine}]` oxirgi 200 ta, eski → yangi; hashar yo'q → 404 |
| POST | `/api/hashars/:id/comments` | ✓ | JSON `{body}`: tozalanadi (trim, boshqaruv belgilari), 1–500 belgi (code point) → 201 CommentDTO; 20 ta / soat / foydalanuvchi (429) |
| DELETE | `/api/comments/:id` | ✓ | o'z izohi yoki admin → `{ok:true}`; begona → 403; yo'q → 404 |
| GET | `/api/users/:id` | ixt. | `{id, name, bio, district, avatar_url, created_at, stats:{created, joined, completed}, hashars: HasharDTO[] (yaratganlari, oxirgi 20)}` — telefon hech qayerda yo'q |
| POST | `/api/me/profile` | ✓ | multipart `name?` (2–60), `bio?` (≤ 300, ko'p qatorli), `district?` (≤ 60), `avatar?` (JPG/PNG/WebP ≤ 5 MB), `remove_avatar?=1` → `{user}`; yuborilmagan maydon o'zgarmaydi, hech narsa yo'q → 400; avatar almashsa/o'chsa eski R2 obyekti o'chadi; 20 ta / soat |
| POST | `/api/me/password` | ✓ | JSON `{current_password, new_password}` → `{ok:true}`; joriy parol noto'g'ri → 401 `"Joriy parol noto'g'ri"` (joriy sessiya saqlanadi); yangi parol `parsePassword` (≥ 6); limit kirish bilan umumiy (IP 30/15 daq, telefon 10/15 daq); muvaffaqiyatda joriy sessiyadan boshqa barcha sessiyalar o'chadi |
| GET | `/api/leaderboard?period=all\|month` | – | top 50 `[{user:{id,name,avatar_url,district}, joined, completed, created, score}]`; `score = completed*10 + joined*3 + created*5`; `joined` — o'zi yaratmagan hasharlar; `month` — Toshkent oyining boshidan (`joined_at`, `completed_at`, `created_at`); bloklanganlar va 0 ballilar yo'q |
| GET | `/api/geo/search?q=` | – | q 2–120 belgi → `[{name, display, lat, lng}]` ≤ 6 (Nominatim `countrycodes=uz`) |
| GET | `/api/geo/reverse?lat=&lng=` | – | `{display, district, city}` (topilmasa bo'sh satrlar); koordinata 4 xonaga yaxlitlanib keshlanadi |
| GET | `/api/media/avatars/:file` | – | avatar (media allowlist: `before`, `after`, `avatars`) |
| GET | `/api/stats` | – | `{hashars, completed, volunteers, upcoming /* kelgusi PENDING */, districts /* bloklanmaganlarning users.district noyob qiymatlari: kichik harf, apostroflarsiz, oxiridagi "tumani"/"tuman" siz; hech kim kiritmagan bo'lsa 0 — bosh sahifa o'rniga "Kutilmoqda" (upcoming) ko'rsatadi */}` |

Geo: `User-Agent: hasharchilar.uz/1.0 (+https://hasharchilar-api.davlatsudekspert.workers.dev)`, `format=jsonv2`,
`accept-language=uz,ru`; `geo_cache` 30 kun (`x-geo-cache: hit|miss`); IP bo'yicha 30 / daqiqa; keshda yo'q so'rovlar
umumiy navbat bilan (barcha IP lar uchun upstream so'rovlar orasida ≥ 1.1 s; 3 s da navbat kelmasa → 503 `"Manzil xizmati band.
Bir necha soniyadan so'ng qayta urinib ko'ring"` + Retry-After); upstream xatosi
yoki 8 s timeout → 502 `"Manzil xizmati vaqtincha ishlamayapti"` (keshlanmaydi). `env.GEO_MOCK === '1'` — testlar
uchun deterministik soxta javob (`x-geo-source: mock`), production'da o'rnatilmaydi.

Web: admin panel `#admin` hash manzilida (sayt va APK), `src/admin/` — `React.lazy` bilan alohida bundle;
Profil oynasida `is_admin` bo'lsa "🛡️ Admin panel" tugmasi.

Rasm qoidalari: faqat `image/jpeg|png|webp`, ≤ 5 MB, kalit `<folder>/<uuid>.<ext>` (kengaytma MIME dan).
Mijoz yuklashdan oldin rasmni canvas orqali ≤ 1600px JPEG (sifat 0.82) ga siqadi.

Validatsiya: title 3–120, description ≤ 1000, address ≤ 200, lat/lng chegarada, date_time `YYYY-MM-DDTHH:MM`
va yangi yaratishda o'tmishda bo'lmasligi (Toshkent vaqti UTC+5, 1 soat bag'rikenglik), items ≤ 12 ta, har biri ≤ 40.

CORS: `/api/*` uchun ruxsat etilgan originlar: `https://localhost`, `capacitor://localhost`, `http://localhost`,
`http://localhost:5173`, va so'rov kelgan host'ning o'zi. Header'lar: `Authorization, Content-Type`.
Metodlar: GET, POST, DELETE, OPTIONS. Preflight 204.

Xavfsizlik: barcha SQL bind parametrlar bilan; foydalanuvchi matni hech qachon HTML sifatida chiqarilmaydi;
xatolar ichki tafsilotni oshkor qilmaydi (500 → "Server xatosi", log `console.error`).

## 6. Web (React) — ekranlar va xatti-harakat

- `src/lib/config.js`: `API_BASE = import.meta.env.VITE_API_BASE || ''`, `IS_NATIVE = Capacitor.isNativePlatform()`.
- `src/lib/api.js`: barcha so'rovlar `API_BASE + /api/...`, token qo'shadi, 401 da tokenni tozalaydi.
- Header: logo, qidiruv, "+ Hashar e'lon qilish" (amber), profil tugmasi (kirgan bo'lsa ism bosh harfi, aks holda "Kirish").
- Hero (ixcham): sarlavha "Birgalikda obod qilamiz", subtitr, 3 ta raqam (`/api/stats`): hasharlar, bajarildi, ko'ngillilar.
- Tablar: "Xaritada ko'rish" | "Yaqindagi hasharlar" (geolokatsiya, masofa bo'yicha) | "Bajarilganlar (Oldin/Keyin)".
- Xarita + kartalar (desktop: yonma-yon, chap ro'yxat scroll, o'ng xarita sticky 600px; mobil: xarita tepada 340px).
  Pinlar: PENDING amber, COMPLETED emerald; popup: nom, sana, ko'ngillilar soni, "Qatnashish".
  Xarita (v3): MapLibre GL + OpenFreeMap vektor uslublari (`styles/liberty`, tungi rejimda `styles/dark`), kalitsiz;
  attribution "© OpenFreeMap © OpenMapTiles © OpenStreetMap" doim ko'rinadi; APK User-Agent'iga "Hasharchilar/1.0" qo'shiladi.
  v3 da bu ekran ko'p sahifali tuzilmaga o'tdi — `docs/V3_PLAN.md` 3-bo'lim va README "Frontend (v3)".
- Karta: status badge ("Kutilmoqda" amber / "Bajarildi" emerald), nom, manzil, sana, kerakli narsalar, ko'ngillilar soni,
  "Qatnashish" (amber) / "✓ Qatnashasiz" / "Yakunlangan". Bosilsa → Hashar tafsiloti oynasi.
- Hashar tafsiloti (modal/sheet): oldin rasmi (yoki Oldin/Keyin slayder), tavsif, manzil, sana, narsalar,
  ko'ngillilar ro'yxati (ismlar), tashkilotchi telefoni (qo'shilgandan keyin, `tel:` havola), xaritada ochish havolasi;
  egasi uchun: "Yakunlash (Keyin rasmi)" va "O'chirish"; qo'shilgan uchun: "Chiqish".
- "Qatnashish" mehmon bossa → Kirish/Ro'yxat oynasi, muvaffaqiyatdan keyin avtomatik qo'shiladi.
- E'lon yaratish: 4 bosqichli modal (1 nom+tavsif, 2 xaritada joy + manzil + "Mening joylashuvim",
  3 sana+vaqt+kerakli narsalar chiplari, 4 "Oldin" rasmi). Mehmon bossa avval Kirish.
- Profil oynasi: ism, telefon, statistika, "Mening hasharlarim" (yaratganlarim / qo'shilganlarim), "Chiqish".
- Bajarilganlar: Oldin/Keyin slayder galereyasi.
- Saytda (native emas) va Android brauzerda: "📱 Android ilovasini yuklab olish" banneri, agar `/api/app` `available`.
  APK ichida (bosh sahifa): `/api/app` `versionCode` > `App.getInfo().build` bo'lsa "Yangi versiya" banneri.
- Bo'sh holatlar, yuklanish skeletlari, xato + "Qayta urinish", toast xabarlar.
- Accessibility: tugmalarda aria-label, modal Esc bilan yopiladi, fokus ko'rinadi.
- Native'da: Android "orqaga" tugmasi ochiq modalni yopadi, modal bo'lmasa ilovadan chiqadi (`@capacitor/app`);
  status bar emerald; safe-area hisobga olinadi.

### 6.1. v3 frontend (ko'p sahifali)

- Hash router: `#/`, `#/xarita`, `#/hasharlar`, `#/hashar/:id`, `#/yaratish`, `#/natijalar`, `#/reyting`, `#/profil`,
  `#/u/:id`, `#/haqida`, `#/kirish`, `#admin` / `#/admin`, qolgani — 404. Sahifalar `src/pages/`.
- Desktop: yuqori menyu; mobil/APK: pastki tab bar (Bosh · Xarita · ＋ · Natijalar · Profil).
- Tungi rejim: tizim + qo'lda (`localStorage['hashar_theme']` = `light|dark`, yo'q — tizim). Admin panel doim yorug'.
- API mijozi: token `localStorage['hashar_token']`, `Authorization: Bearer`, `API_BASE + /api/...`, `mediaUrl()` —
  o'zgarmagan. 401 → mehmon holati; istisno — `POST /api/me/password` (joriy parol noto'g'ri bo'lsa sessiya saqlanadi,
  "Joriy parol noto'g'ri" maydon ostida ko'rsatiladi).
- Avatar yuklashdan oldin ≤ 512px JPEG ga siqiladi; hashar rasmlari — ≤ 1600px.
- Nishonlar mijozda `stats` dan hisoblanadi; ball = completed×10 + joined×3 + created×5 (reyting bilan bir xil).
- Ulashish havolasi: `<sayt>/#/hashar/<id>`; kalendar: web — `.ics` fayl, APK — Google Calendar havolasi.

### 6.2. Email oqimlari (frontend)

- Ilova ochilganda `GET /api/config` (localStorage'da keshlanadi; 410 `email_required` kelsa ham yoqilgan deb belgilanadi).
- `email_enabled` bo'lsa: ro'yxat 2 bosqich — (1) Ism, Email (majburiy, maydon ostida aniq xato), Telefon +998,
  Parol (ko'rsatish/yashirish) → "Kod yuborish"; (2) 6 ta alohida katak (`inputmode="numeric"`,
  `autocomplete="one-time-code"`, avtomatik o'tish, butun kodni joylash, Backspace orqaga), email + "O'zgartirish",
  60 s teskari sanoqli "Kodni qayta yuborish", xatolar katak ostida → muvaffaqiyatda kirish va kutilayotgan amal davom etadi.
  O'chiq bo'lsa — eski telefon ro'yxati.
- Kirish: bitta "Telefon yoki email" maydoni + parol, "Parolni unutdingizmi?" → email → kod + yangi parol (2 marta) → kirish.
- Emaili tasdiqlanmagan foydalanuvchi parol bilan kirgach — to'liq ekranli "Emailni tasdiqlang" (email → kod,
  "Keyinroq" / Esc / Android "orqaga" bilan yopiladi); ko'rish sahifalarida yopsa bo'ladigan banner (sessiya davomida);
  yozuvchi amallar (`requireVerified`) va API'dan kelgan har qanday 403 `email_unverified` shu bosqichni ochadi,
  tasdiqlangach amal o'zi davom etadi.
- Profil → Sozlamalar → "Email" kartasi: email + "Tasdiqlangan" belgisi ("O'zgartirish") yoki "Tasdiqlanmagan" +
  "Email qo'shish" (o'sha kod komponenti). Admin foydalanuvchilar ro'yxatida email (✓ — tasdiqlangan).

## 7. Android APK (Capacitor 8)

- `appId: uz.hasharchilar.app`, `appName: Hasharchilar`, `webDir: dist`, `android.adjustMarginsForEdgeToEdge: "auto"` (agar versiyada bor bo'lsa).
- Build: `VITE_API_BASE=https://<deploy qilingan domen> npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`.
- Manifest ruxsatlari: INTERNET, ACCESS_NETWORK_STATE (network), ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION
  (geolocation), CAMERA (camera), VIBRATE (haptics). Joylashuv va kamera ruxsati ish vaqtida so'raladi.
- v3 plaginlari: `@capacitor/haptics`, `share`, `geolocation`, `camera`, `network`, `preferences` (+ app, splash-screen,
  status-bar). Orqaga tugmasi: modal → sahifa tarixi → bosh sahifada ilovadan chiqish.
- Mavzu: `AppTheme.NoActionBar` — DayNight (oyna foni `values`/`values-night`), WebView `prefers-color-scheme` tizimga ergashadi.
- Ikonka: emerald fonda oq barg (adaptive icon + barcha mipmap PNG'lar), splash: emerald fon.
- Imzo: `android/app/build.gradle` `signingConfigs.release` — `android/key.properties` mavjud bo'lsa undan
  (storeFile, storePassword, keyAlias, keyPassword), aks holda debug kaliti bilan imzolanadi (APK baribir o'rnatiladi).
- `versionCode` / `versionName` — Gradle property `-PversionCode=N -PversionName=1.0.N` orqali (CI beradi), standart 1 / "1.0.0".

## 8. CI/CD (`.github/workflows/hasharchilar.yml`)

Trigger: push (branch `claude/peaceful-meitner-zlvydj` va `main`, paths `hasharchilar/**` va workflow fayli), `workflow_dispatch`.
Secretlar: `CLOUDFLARE_API_TOKEN` (mavjud), hisob `31c4b3d8ece4b65de515debc4552334a`,
ixtiyoriy `ANDROID_KEYSTORE_BASE64`/`ANDROID_KEYSTORE_PASSWORD`/`ANDROID_KEY_ALIAS`.

> Yangilangan (deploy haqiqiy hisobga moslandi): Worker — mavjud `hasharchilar-api`; baza — D1 ruxsati
> bo'lmasa SQLite Durable Object (tanlov sticky); APK — statik fayllar ichida. Batafsil: README → Deploy.

1. `test`: npm ci → build → `npm run test:storage` → `wrangler dev` lokal D1 VA Durable Object rejimida → `npm run test:api` ikkalasida.
2. `apk` (needs test): URL = `https://<worker>.<subdomen>.workers.dev` (Cloudflare API, zaxira `davlatsudekspert`);
   `VITE_API_BASE=<URL>`; APK quradi; saytdagi `/app/version.json` sertifikati bilan imzo mosligi
   (debug kaliti farq qilsa `publish=false`, job yiqilmaydi); artefakt (`hasharchilar.apk` + `version.json`).
3. `deploy` (needs apk): URL qayta hisoblanadi; oddiy build + artefakt `dist/app/` ga (`publish=false` bo'lsa —
   saytdagi hozirgi APK); baza turi aniqlanadi (Worker'da D1 `DB` → D1,
   `HASHAR_DB` → DO, birinchi marta: D1 topiladi/yaratiladi, ruxsat bo'lmasa DO); `wrangler.deploy.json`;
   R2 tekshiruvi; D1 rejimida `wrangler d1 migrations apply --remote`; `wrangler deploy`; ixtiyoriy secret
   `RESEND_API` bo'lsa — Worker secret'lari `RESEND_API_KEY` va `RESEND_FROM` (`Hasharchilar <no-reply@<domen>>`:
   Resend'dagi tasdiqlangan domen, "hasharchilar" bo'lgani afzal; o'qib bo'lmasa / yo'q — `nfcstore.uz`);
   `/api/health`, baza (`/api/stats`, `/api/hashars`), `/api/app`, `/api/app/download`.
   `test` job'idagi `wrangler dev` lar `--var GEO_MOCK:1 --var EMAIL_MOCK:1` bilan.
4. `release` (needs deploy, faqat `publish=true`): GitHub Release `hasharchilar-v1.0.N`.

nfcstore resurslariga (Worker `nfcstore-uz`, D1 `DB`, R2 `nfcstore-uploads`) HECH QACHON tegilmaydi.
