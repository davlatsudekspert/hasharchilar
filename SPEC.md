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

Versiyalar: React 18, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), Leaflet 1.9, Hono 4, wrangler 4,
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

## 4. Autentifikatsiya

- Ro'yxat: ism + telefon (+998XXXXXXXXX ga normallashtiriladi) + parol (≥ 6 belgi).
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
| GET | `/api/app` | – | `{available: bool, version: string|null, size: number|null, url: "/api/app/download"}` (statik `/app/hasharchilar.apk` + `/app/version.json`; zaxira — R2 `app/hasharchilar.apk`) |
| GET | `/api/app/download` | – | APK fayl, `content-type: application/vnd.android.package-archive`, `content-disposition: attachment; filename="hasharchilar.apk"` |
| GET | `/api/health` | – | `{ok:true}` |

**Admin panel** (`/api/admin/*`, mehmon → 401, admin emas → 403). Admin = `users.role = 'admin'` YOKI telefon
Worker secret `ADMIN_PHONES` da (vergul bilan, `parsePhone` bilan normallashtiriladi). `user` obyektida `is_admin`.
Bloklangan foydalanuvchi: kirish → 403 "Hisobingiz bloklangan", token qabul qilinmaydi, bloklashda sessiyalari o'chadi.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/api/admin/overview` | `{users, admins, blocked, hashars, pending, completed, volunteers, media, signups_7d, hashars_7d, recent_hashars[5], recent_users[5]}` |
| GET | `/api/admin/users?q=&offset=&limit=` | `{items:[{id,name,phone,role,is_admin,env_admin,blocked_at,created_at,created_count,joined_count}], total}`; limit ≤ 100 |
| POST | `/api/admin/users/:id/block` · `/unblock` · `/role {role}` | → `{user}`; o'ziga yoki `ADMIN_PHONES` admin'iga (bloklash/oddiy qilish) → 409 |
| DELETE | `/api/admin/users/:id` | foydalanuvchi + sessiyalar, qatnashuvlar, hasharlari (+ media, R2) → `{ok:true}`; o'zi / `ADMIN_PHONES` → 409 |
| GET | `/api/admin/hashars?status=&q=&offset=&limit=` | `{items: HasharDTO + creator.phone, total}` |
| DELETE | `/api/admin/hashars/:id` | istalgan holat; R2 rasmlari ham → `{ok:true}` |

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
  Xarita plitkalari: OpenStreetMap `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (kalitsiz; CARTO endi kalit so'raydi),
  attribution "© OpenStreetMap hissadorlari"; APK User-Agent'iga "Hasharchilar/1.0" qo'shiladi (OSM qoidasi).
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
- Bo'sh holatlar, yuklanish skeletlari, xato + "Qayta urinish", toast xabarlar.
- Accessibility: tugmalarda aria-label, modal Esc bilan yopiladi, fokus ko'rinadi.
- Native'da: Android "orqaga" tugmasi ochiq modalni yopadi, modal bo'lmasa ilovadan chiqadi (`@capacitor/app`);
  status bar emerald; safe-area hisobga olinadi.

## 7. Android APK (Capacitor 8)

- `appId: uz.hasharchilar.app`, `appName: Hasharchilar`, `webDir: dist`, `android.adjustMarginsForEdgeToEdge: "auto"` (agar versiyada bor bo'lsa).
- Build: `VITE_API_BASE=https://<deploy qilingan domen> npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`.
- Manifest ruxsatlari: INTERNET, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, CAMERA (rasm olish uchun fayl tanlagich).
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
   R2 tekshiruvi; D1 rejimida `wrangler d1 migrations apply --remote`; `wrangler deploy`; `/api/health`,
   baza (`/api/stats`, `/api/hashars`), `/api/app`, `/api/app/download`.
4. `release` (needs deploy, faqat `publish=true`): GitHub Release `hasharchilar-v1.0.N`.

nfcstore resurslariga (Worker `nfcstore-uz`, D1 `DB`, R2 `nfcstore-uploads`) HECH QACHON tegilmaydi.
