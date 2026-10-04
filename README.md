# hasharchilar.uz

Mahalladagi hasharlarni (tozalash, ko'kalamzorlashtirish, obodonlashtirish) **xaritada topish**,
**bir bosishda qo'shilish**, yangi hashar **e'lon qilish** va **Oldin / Keyin** natijalarni ko'rish platformasi.

Bitta React kod bazasidan ikkita mahsulot chiqadi:

1. **Sayt** — Cloudflare Worker `hasharchilar-api` (Static Assets + Hono API), baza (D1 yoki SQLite
   Durable Object — deploy paytida avtomatik tanlanadi), R2 rasm ombori.
   Manzil: **https://hasharchilar-api.davlatsudekspert.workers.dev**.
2. **Android ilova (APK)** — Capacitor 8, o'sha sayt kodi; API ga to'liq manzil (`VITE_API_BASE`) orqali murojaat qiladi.

Batafsil texnik shartnoma: [`SPEC.md`](./SPEC.md).

## Arxitektura

```
 Brauzer (sayt)                     Android APK (Capacitor, origin https://localhost)
      │  /api/... (shu domen)              │  https://hasharchilar-api.<subdomen>.workers.dev/api/...
      ▼                                    ▼                         (CORS + Bearer token)
 ┌────────────────── Cloudflare Worker "hasharchilar-api" ───────────────────┐
 │  Static Assets: dist/ (React SPA + app/hasharchilar.apk, app/version.json)│
 │  run_worker_first: /api/*                                                 │
 │  Hono API: worker/index.js → auth.js, hashars.js, media.js, ratelimit.js  │
 │  env.DB: D1 binding YOKI d1-adapter.js → Durable Object HasharDB          │
 └───────────────┬────────────────────────────────────┬──────────────────────┘
                 ▼                                    ▼
   Baza (bittasi, sxema bir xil):            R2 "hasharchilar-photos" (binding PHOTOS)
   • D1 "hasharchilar" (binding DB)          before/<uuid>.jpg, after/<uuid>.jpg
   • yoki SQLite Durable Object HasharDB     (zaxira: app/hasharchilar.apk)
     (binding HASHAR_DB, obyekt "main")
   users, sessions, hashars, hashar_media, volunteers, rate_limits,
   comments, geo_cache, email_otps                 Resend API (email kodlari, RESEND_API_KEY)
```

- **Stek:** React 18 · Vite 6 · Tailwind CSS v4 · MapLibre GL 5 + OpenFreeMap (kalitsiz vektor xarita) ·
  Inter / Manrope (fontsource, bundle ichida) · Hono 4 · Cloudflare Workers + D1 / SQLite Durable Object + R2 ·
  Capacitor 8 (Android: app, camera, geolocation, haptics, network, preferences, share, splash-screen, status-bar).
- **Autentifikatsiya:** ism + **email** + telefon (+998…) + parol. Ro'yxat ikki bosqichli: emailga 6 xonali kod
  (Resend) → kod tasdiqlangach hisob yaratiladi. Kirish — telefon **yoki** email + parol; parolni unutganda —
  email kodi bilan tiklash. Batafsil: [Email bilan ro'yxat va tasdiqlash](#email-bilan-royxat-va-tasdiqlash).
  Parol PBKDF2-SHA256 (100 000 iteratsiya) bilan saqlanadi.
  Sessiya tokeni `localStorage['hashar_token']` da turadi va `Authorization: Bearer <token>` sarlavhasida yuboriladi.
  Cookie ishlatilmaydi. Sessiya 90 kun amal qiladi.
- **Rasmlar:** brauzer rasmni yuborishdan oldin ≤ 1600px JPEG ga siqadi. Server faqat JPEG/PNG/WebP qabul qiladi
  (≤ 5 MB, fayl boshidagi baytlar ham tekshiriladi) va R2 ga `<folder>/<uuid>.<ext>` kaliti bilan saqlaydi.
  DTO dagi `before_url` / `after_url` nisbiy yo'l bo'ladi. Mijoz ularni `API_BASE + url` ko'rinishida ishlatadi.
- **Baza:** worker kodi faqat `env.DB` (D1 API) bilan ishlaydi. D1 binding bo'lmasa, `worker/index.js`
  `env.DB` o'rniga `worker/d1-adapter.js` ni qo'yadi: u xuddi D1 dek `prepare → bind → first/all/run/raw`
  va `batch` beradi, so'rovlar esa SQLite asosidagi Durable Object `HasharDB` da (`worker/do-db.js`, bitta
  obyekt `main`, hudud `eeur`) bajariladi. Natija shakllari va xato matnlari D1 niki bilan bir xil
  (`D1_ERROR: UNIQUE constraint failed: ...`), `batch` bitta tranzaksiya, tashqi kalitlar ham tekshiriladi.
  DO o'z migratsiyalarini o'zi qo'llaydi: `migrations/*.sql` bundle'ga matn sifatida kiradi va har biri
  bitta tranzaksiyada bajarilib, `_migrations` jadvaliga yoziladi.
  **Diqqat:** DO rejimida yangi migratsiya deploy'dan *keyin*, birinchi so'rovda production ma'lumotlari ustida
  qo'llanadi. U to'la jadvallarda ham ishlashi shart (masalan, `NOT NULL` ustunga `DEFAULT` kerak), aks holda
  barcha baza so'rovlari 500 qaytaradi. Yangi migratsiya `worker/migrations.js` ga ham qo'shiladi;
  `npm run test:storage` uni namuna ma'lumotli bazada sinaydi.
- **Limitlar (bazadagi hisoblagichlar):**
  - kirish: bitta telefon raqami yoki emailga 15 daqiqada 10 ta urinish (IP almashtirilsa ham);
  - email kodlari: email+maqsad bo'yicha 60 soniyada bir marta, bitta emailga 5 ta / soat, bitta IP dan 20 ta / soat;
    bitta kodga 5 ta urinish;
  - kirish va ro'yxatdan o'tish: bitta IP dan 15 daqiqada 30 ta urinish. IPv6 manzillar /64 tarmoq bo'yicha
    hisoblanadi. SPEC'da IP limiti 10 edi: mobil operatorlarning CGNAT tarmog'ida ko'p foydalanuvchi bitta
    IP ni bo'lishadi, parol tanlashdan asosiy himoya esa endi telefon bo'yicha limit;
  - hashar e'lon qilish: bitta foydalanuvchi soatiga 10 ta;
  - qatnashish / chiqish: bitta foydalanuvchi soatiga 30 ta (tashkilotchi telefonlarini ommaviy yig'ishdan himoya).
- **Ro'yxat (`GET /api/hashars`, ko'pi bilan 300 ta):** holatlar alohida tanlanadi. Kelgusi hasharlar
  yakunlanmay qolgan eski hasharlardan oldin olinadi, bajarilganlarga kamida 60 ta joy qoladi. Javob tartibi
  SPEC bo'yicha (PENDING sana bo'yicha o'sish, keyin COMPLETED eng yangisi).
- **So'rov hajmi:** multipart tana 6 MB dan oshsa 413 (Content-Length bo'lmasa ham — tana oqim sifatida sanaladi).

## Papkalar

```
hasharchilar/
├── SPEC.md                  # yagona texnik shartnoma
├── package.json             # web + worker + capacitor (bitta paket)
├── wrangler.jsonc           # Worker hasharchilar-api: assets ./dist (ASSETS), D1 (DB), DO (HASHAR_DB), R2 (PHOTOS)
├── capacitor.config.json    # uz.hasharchilar.app, webDir dist
├── migrations/              # 0001_init, 0002_admin, 0003_v3, 0004_email (D1: wrangler d1 migrations apply; DO: o'zi qo'llaydi)
├── schema.sql               # migratsiyalar birlashtirilgani (qulaylik uchun)
├── seed.sql                 # FAQAT lokal namuna ma'lumot (parol: demo1234)
├── worker/                  # Hono backend (+ admin.js, social.js — izoh/profil/reyting, geo.js — Nominatim proksi,
│                            #   email.js — Resend + xat shabloni, otp.js — email kodlari,
│                            #   do-db.js, d1-adapter.js, migrations.js, sql-split.js)
├── scripts/wrangler-config.mjs # wrangler.jsonc → wrangler.deploy.json (--storage d1|do)
├── scripts/site-url.sh      # CI: https://<worker>.<subdomen>.workers.dev manzili
├── tests/api.test.mjs       # API testi (node:test, wrangler dev ga qarshi; D1 va DO rejimida)
├── tests/admin.test.mjs     # admin panel API testi (server ADMIN_PHONES bilan); tests/helpers.mjs — umumiy
├── tests/email.test.mjs     # email ro'yxat / kirish / tiklash / tasdiqlash, "email majburiy" (server EMAIL_MOCK bilan)
├── tests/storage.test.mjs   # baza qatlami: DO adapteri = D1, migratsiyalar, wrangler-config (fixtures/: seed-v2/v3.sql)
├── src/                     # React (sayt va APK uchun bir xil)
│   ├── lib/                 #   router (hash), store (kesh), theme, actions, api, auth, native, map, meta, utils
│   ├── pages/               #   Home, Map, List, Hashar, Create, Results, Leaderboard, Profile, User, About,
│   │                        #   Login, NotFound — har biri alohida sahifa (#/...)
│   ├── components/          #   Header, TabBar, Footer, HasharCard, Comments, PhotoInput, ProfileParts, ui, icons,
│   │                        #   AuthForm, EmailOtp (6 katakli kod), EmailVerifyScreen ("Emailni tasdiqlang" + banner)
│   │   └── map/             #   HasharMap (klaster), MiniMap, LocationPicker — lazy (MapLibre faqat kerak bo'lganda)
│   └── admin/               #   admin panel (#admin / #/admin, alohida lazy bundle)
├── public/                  # favicon, ikonlar, og-image, demo/ (seed rasmlari)
├── android/                 # Capacitor Android loyihasi (commit qilinadi)
├── resources/, scripts/     # ikonka/splash manbalari va generatori
└── docs/screenshots/        # ekran rasmlari: v3-*.png (mobil 390px, desktop 1366px, yorug' va tungi)
```

## Frontend (v3): sahifalar va dizayn

Hash router (`src/lib/router.js`) — sayt va APK da bir xil, "orqaga" tugmasi brauzer tarixi bilan ishlaydi:

| Manzil | Sahifa |
|---|---|
| `#/` | Bosh sahifa: hero + jonli statistika, kategoriyalar, yaqinlashayotgan hasharlar karuseli, "Qanday ishlaydi", Oldin/Keyin vitrina, top ko'ngillilar, APK bloki |
| `#/xarita` | To'liq ekran MapLibre xarita: klasterlar, holat va kategoriya filtrlari, "Mening joyim", mobilda pastki panel (karusel ↔ ro'yxat), desktopda chap ro'yxat |
| `#/hasharlar` | Ro'yxat: qidiruv, holat, kategoriya, sana oralig'i, masofa (mendan N km), saralash, setka/ro'yxat ko'rinishi, tortib yangilash |
| `#/hashar/:id` | Hashar sahifasi: rasm yoki Oldin/Keyin slayder, mini xarita, progress (`max_volunteers`), ko'ngillilar, izohlar, ulashish, kalendar (.ics / Google Calendar), Google/Yandex yo'l ko'rsatish, egasi uchun yakunlash/o'chirish |
| `#/yaratish` | 4 qadamli e'lon: kategoriya kartalari → xaritada pin + manzil qidiruvi + avtomatik manzil (reverse geocode) → sana/vaqt, ko'ngillilar soni, narsalar → "Oldin" rasmi (kamera/galereya) va tekshirish; qoralama saqlanadi |
| `#/natijalar` | Oldin/Keyin galereya |
| `#/reyting` | Reyting: shu oy / umumiy, podium (top-3) |
| `#/profil` | Profilim: avatar, bio, tuman, statistika, daraja, nishonlar, mening hasharlarim, sozlamalar (email — qo'shish/tasdiqlash/o'zgartirish, mavzu, parolni o'zgartirish, admin, chiqish) |
| `#/u/:id` | Ommaviy profil (telefon ko'rsatilmaydi) |
| `#/haqida` | Loyiha haqida + FAQ |
| `#/kirish` | Kirish (telefon yoki email) / ro'yxatdan o'tish (email kodi bilan) / parolni tiklash (amallar uchun modal ham bor) |
| `#admin`, `#/admin` | Admin panel |

- **Dizayn:** emerald asosiy rang, amber faqat asosiy CTA va "kutilmoqda" pinlari uchun; semantik rang tokenlari
  (`src/index.css`, `--c-*` → Tailwind `bg-surface`, `text-ink` ...). **Tungi rejim**: tizimga ergashadi yoki
  qo'lda (`localStorage['hashar_theme']`), birinchi chizishdan oldin qo'llanadi; xarita ham `liberty` ↔ `dark`
  uslubiga o'tadi. Sahifa o'tish animatsiyalari, skeletlar, `prefers-reduced-motion` hurmat qilinadi.
- **Navigatsiya:** desktopda yuqori menyu, mobil va APK da pastki tab bar (Bosh · Xarita · ＋ · Natijalar · Profil),
  safe-area hisobga olinadi.
- **Xarita:** MapLibre GL + OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`, tungi — `/styles/dark`),
  atributsiya doim ko'rinadi ("© OpenFreeMap © OpenMapTiles © OpenStreetMap"). MapLibre (~1 MB) alohida lazy
  chunk — bosh sahifa tez ochiladi. Manzil qidiruvi va reverse geocode faqat worker proksi orqali
  (`/api/geo/search`, `/api/geo/reverse`); xizmat ishlamasa manzil qo'lda kiritiladi.
- **Kesh:** `src/lib/store.js` — sahifalar orasida ma'lumot darhol ko'rinadi, orqa fonda yangilanadi; amallardan
  keyin tegishli kalitlar (`hashars`, `hashar:<id>`, `stats`, `leaderboard`...) qayta yuklanadi.
- **Ulashish havolasi:** `<sayt>/#/hashar/<id>` (APK da sayt domeni bilan).

Ekran rasmlari (`docs/screenshots/`, lokal `wrangler dev` + Playwright E2E dan):

| Mobil (390px) | | Desktop (1366px) |
|---|---|---|
| ![Bosh sahifa](docs/screenshots/v3-mobile-home.jpg) | ![Tungi rejim](docs/screenshots/v3-mobile-home-dark.jpg) | ![Bosh sahifa](docs/screenshots/v3-desktop-home.jpg) |
| ![Xarita](docs/screenshots/v3-mobile-map.jpg) | ![Hashar](docs/screenshots/v3-mobile-hashar.jpg) | ![Xarita](docs/screenshots/v3-desktop-map.jpg) |
| ![Joy tanlash](docs/screenshots/v3-mobile-create-location.jpg) | ![Oldin/Keyin](docs/screenshots/v3-mobile-hashar-dark.jpg) | ![Hashar (tungi)](docs/screenshots/v3-desktop-hashar-dark.jpg) |
| ![Profil](docs/screenshots/v3-mobile-profile.jpg) | ![Reyting](docs/screenshots/v3-mobile-leaderboard.jpg) | ![Yaratish](docs/screenshots/v3-desktop-create.jpg) |
| ![Natijalar](docs/screenshots/v3-mobile-results.jpg) | ![Sozlamalar](docs/screenshots/v3-mobile-settings.jpg) | ![Hasharlar](docs/screenshots/v3-desktop-list.jpg) ![Admin](docs/screenshots/v3-desktop-admin.jpg) |
| ![Ro'yxat: email kodi](docs/screenshots/v3-email-register-code.jpg) | ![Emailni tasdiqlang](docs/screenshots/v3-email-verify-screen-dark.jpg) | ![Parolni tiklash (tungi)](docs/screenshots/v3-email-forgot-dark.jpg) |
| ![Sozlamalar: email](docs/screenshots/v3-email-profile-dark.jpg) | | |

## Lokal ishga tushirish

Talablar: Node.js 22.

```bash
npm ci
npm run db:local     # lokal D1: migratsiya + namuna ma'lumot (.wrangler/state ichida)
npm run dev          # sayt: http://localhost:5173  (Vite, /api → wrangler dev :8787 ga proxy)
```

Namuna foydalanuvchilar uchun parol `demo1234` (emaillar soxta, tasdiqlangan — telefon yoki email bilan kirish mumkin):

| Ism | Telefon | Email |
|---|---|---|
| Aziz Karimov | +998 90 111 22 33 | aziz@example.com |
| Malika Yusupova | +998 93 555 66 77 | malika@example.com |
| Jasur Toshmatov | +998 97 777 88 99 | jasur@example.com |

`npm run dev:api` (va `dev:api:mock`, `dev:api:do`) **`EMAIL_MOCK=1`** bilan ishlaydi: xat yuborilmaydi, kod
API javobida `dev_code` bo'lib qaytadi va brauzer konsolida `[EMAIL_MOCK] ... kodi: 123456` deb chiqadi.
Haqiqiy xat bilan sinash: `.dev.vars` ga `RESEND_API_KEY=re_...` (va ixtiyoriy `RESEND_FROM=...`) yozib,
`npx wrangler dev --port 8787` ni `EMAIL_MOCK` siz ishga tushiring (`.dev.vars` `.gitignore` da).

Production rejimiga yaqinroq sinash uchun sayt va API ni bitta originda ham ishga tushirish mumkin:

```bash
npm run build && npx wrangler dev --port 8787   # http://localhost:8787
```

> `npm run build` `dist/` ni tozalab qayta yozadi. `wrangler dev` ishlab turgan paytda build qilinsa,
> u ba'zan `/` uchun 404 qaytara boshlaydi. Bunday holda `wrangler dev` ni qayta ishga tushiring.

Lokal bazani nolga qaytarish: `rm -rf .wrangler/state && npm run db:local`.

Lokal dev standart holatda **D1 rejimida** ishlaydi (`wrangler.jsonc` dagi D1 binding). Production'dagi
**Durable Object rejimi**ni sinash:

```bash
npm run dev:api:do   # wrangler.deploy.json (--storage do) + wrangler dev, ma'lumot .wrangler/state-do da
```

DO rejimida `seed.sql` qo'llanmaydi (DO bazasiga `wrangler d1 execute` bilan yozib bo'lmaydi) — baza bo'sh
boshlanadi, migratsiyalar birinchi so'rovda avtomatik qo'llanadi.

### Testlar

```bash
npm run build && npm run db:local  # dist/ (assets) va lokal D1
npx wrangler dev --port 8787 --var ADMIN_PHONES:+998900000099 --var GEO_MOCK:1 --var EMAIL_MOCK:1 &   # boshqa terminalda
npm run test:api                   # tests/api.test.mjs + admin.test.mjs + email.test.mjs (BASE_URL bilan boshqa manzil)

# Durable Object rejimi (alohida port va saqlash papkasi):
node scripts/wrangler-config.mjs --storage do
npx wrangler dev --config wrangler.deploy.json --port 8788 --persist-to .wrangler/state-do-test \
  --var ADMIN_PHONES:+998900000099 --var GEO_MOCK:1 --var EMAIL_MOCK:1 &
STORAGE=do BASE_URL=http://localhost:8788 npm run test:api

npm run test:storage               # server kerak emas: DO adapteri = D1, migratsiyalar, wrangler-config
```

- Test bo'sh bo'lmagan bazada ham qayta ishlaydi, chunki har safar tasodifiy telefon raqamlari, emaillar va IP manzillar ishlatiladi.
- **`EMAIL_MOCK:1` majburiy:** testdagi foydalanuvchilar email kodi bilan ro'yxatdan o'tadi (`tests/helpers.mjs` →
  `register()` kodni javobdagi `dev_code` dan oladi). Faqat `EMAIL_MOCK=1` serverda ishlaydigan test
  sarlavhalari: `x-test-otp-ttl` (kod muddati, soniya), `x-test-otp-cooldown` (qayta yuborish oralig'i) va
  `x-test-legacy-register: 1` (eski `POST /api/auth/register` bilan emailsiz "eski" hisob — email majburiy
  qoidasini sinash uchun). Production'da `EMAIL_MOCK` hech qachon o'rnatilmaydi, bu sarlavhalar e'tiborsiz qoladi.
- `tests/email.test.mjs` oxirida email xizmati **o'chiq** holatni (`EMAIL_MOCK` ham, `RESEND_API_KEY` ham yo'q)
  sinash uchun o'zi vaqtinchalik papkada uchinchi `wrangler dev` (DO rejimi) ochadi — eski ro'yxat ishlaydi,
  email marshrutlari 503, yozuvchi amallar cheklanmaydi. Tayyor serverni berish: `NOEMAIL_URL=http://...`.
- Admin testlari (`tests/admin.test.mjs`) server **`ADMIN_PHONES`** bilan ishga tushgan bo'lishini talab qiladi:
  `+998900000099` — soxta test raqami (boshqasi uchun `ADMIN_PHONE=+998... npm run test:api`). Bu raqam bilan
  hisob bo'lmasa ro'yxatdan o'tiladi, bo'lsa kiriladi (parol `admin-test-123`). `npm run dev:api` ham shu raqamni beradi.
- **`GEO_MOCK:1`** — `/api/geo/*` haqiqiy Nominatim o'rniga deterministik soxta javob beradi (testlar tarmoqqa
  chiqmaydi; javobda `x-geo-source: mock` header'i). Server usiz ishga tushgan bo'lsa geo testlarining faqat
  validatsiya qismi bajariladi, qolganlari o'tkazib yuboriladi. `npm run dev:api` mock'siz — lokal dev'da haqiqiy
  Nominatim ishlatiladi. Production'da `GEO_MOCK` hech qachon o'rnatilmaydi.
- 300+ eski hasharli test eski sanali qatorlarni `wrangler d1 execute` bilan yozadi, shuning uchun DO
  rejimida (`STORAGE=do`) o'tkazib yuboriladi. Bu ikkinchi jarayon ishlab turgan server bilan bitta SQLite
  faylga yozadi — parallel so'rovlar `SQLITE_BUSY` (500) olishi mumkin, shuning uchun `test:api` fayllarni
  ketma-ket ishga tushiradi (`--test-concurrency=1`).
- `/api/app` testi `dist/app/` ga qaraydi: `dist/app/hasharchilar.apk` + `version.json` bo'lsa "mavjud"
  holati (versiya, hajm, yuklab olingan baytlar, sha256), bo'lmasa "yo'q" holati (`available:false`, 404 JSON) tekshiriladi.
- `test:storage` bir xil so'rovlar ketma-ketligini haqiqiy lokal D1 va `HasharDB` adapterida bajarib,
  natijalar, `meta.changes`/`last_row_id` va xato matnlari aynan bir xilligini, `batch` atomarligini,
  tashqi kalit / `ON DELETE CASCADE` ni va qayta ishga tushganda migratsiyalar takrorlanmasligini tekshiradi.
  Yangilanish testi: `0001` dan keyin `seed.sql` (+ sessiya va limit qatorlari) yoziladi, so'ng qolgan
  migratsiyalar birma-bir qo'llanadi — har biri ma'lumotli bazada o'tishi shart. `seed.sql` eng yangi sxemaga
  yozilgani uchun `tests/fixtures/seed-v2.sql` (0003 dan oldingi) va `seed-v3.sql` (0004 dan oldingi namuna)
  ham ishlatiladi: `0002`, `0003_v3` va `0004_email` albatta to'la jadvallarda sinaladi (yangi ustunlarning
  DEFAULT qiymatlari, emaillarni normallashtirish/takrorlarni tozalash va UNIQUE indeks ham tekshiriladi).

## Android ilova (APK) ni lokal qurish

Talablar: JDK 21, Android SDK (platform 36, build-tools 35+). SDK yo'li `ANDROID_HOME` orqali
yoki `android/local.properties` dagi `sdk.dir=...` qatori orqali beriladi (bu fayl commit qilinmaydi).

```bash
VITE_API_BASE=https://hasharchilar-api.davlatsudekspert.workers.dev npm run build
npx cap sync android
cd android && ./gradlew assembleRelease -PversionCode=3 -PversionName=1.0.3
# natija: android/app/build/outputs/apk/release/app-release.apk
```

- `VITE_API_BASE` — deploy qilingan saytning **https** manzili. Ilovada `usesCleartextTraffic=false`
  yoqilgan, shuning uchun `http://` manzilga ulanib bo'lmaydi.
- APK qurilgandan keyin saytni qo'lda deploy qilmoqchi bo'lsangiz, avval oddiy build qiling (`npm run build`,
  `VITE_API_BASE` siz). Sayt API ga nisbiy yo'l bilan murojaat qilishi kerak.
- **Imzo:** `android/key.properties` bo'lsa, APK shu kalit bilan imzolanadi. Bo'lmasa debug kaliti ishlatiladi:
  APK baribir o'rnatiladi, lekin Play Store'ga yaramaydi. Kalit va `key.properties` ni yaratish:

  ```bash
  keytool -genkeypair -v -keystore android/app/release.jks -alias hasharchilar \
          -keyalg RSA -keysize 2048 -validity 10000
  cat > android/key.properties <<EOF
  storeFile=release.jks
  storePassword=PAROL
  keyAlias=hasharchilar
  keyPassword=PAROL
  EOF
  ```

  `storeFile` yo'li `android/app/` papkasiga nisbatan yoziladi. `*.jks`, `*.keystore` va `key.properties`
  `.gitignore` da turibdi, ular **hech qachon commit qilinmaydi**.
- Native imkoniyatlar (Capacitor plaginlari, web'da zaxira bilan):
  - Android "orqaga" tugmasi: ochiq oyna → sahifa tarixi → (bosh sahifada) ilovadan chiqish;
  - status bar va oyna foni mavzuga mos (yorug' / tungi, `values-night`), edge-to-edge, safe-area CSS orqali;
  - splash: gradient fon + logo (Android 12+ — tizim splash'i), ma'lumot yuklangach yopiladi (eng ko'pi 3 soniya);
  - "Kamera" — `@capacitor/camera` (ruxsat ish vaqtida so'raladi; plagin ishlamasa tizim kamerasi), "Galereya" — fayl tanlagich;
  - "Mening joyim" — `@capacitor/geolocation` (ruxsat so'raladi, rad etilsa tushunarli xabar), web'da `navigator.geolocation`;
  - `@capacitor/haptics` — qo'shilish, e'lon, yakunlash kabi amallarda yengil tebranish;
  - `@capacitor/network` — internet yo'qolsa "oflayn" banner, tiklanganda ma'lumotlar yangilanadi;
  - `@capacitor/share` — tizim "Ulashish" oynasi (web'da `navigator.share` yoki havolani nusxalash);
  - `@capacitor/preferences` — tokenning zaxira nusxasi (asosiy joyi baribir `localStorage['hashar_token']`);
  - ikonka: adaptive (gradient fon + oq barg) va Android 13+ monoxrom; generator — `scripts/gen-android-assets.mjs`;
  - ilova ma'lumotlari (sessiya tokeni) Android zaxirasiga va qurilma ko'chirishga tushmaydi
    (`allowBackup="false"` + `data_extraction_rules.xml`).

## Deploy (GitHub Actions)

Workflow fayli: `.github/workflows/hasharchilar.yml`. U quyidagi hollarda ishga tushadi:

- `main` yoki `claude/peaceful-meitner-zlvydj` branchiga push qilinganda (faqat `hasharchilar/**` yoki workflow fayli o'zgarsa);
- qo'lda, `workflow_dispatch` orqali (`allow_key_change` — APK imzo kalitini ataylab almashtirish).

Bir vaqtda faqat bitta yugurish ishlaydi (`concurrency: hasharchilar-deploy`, boshlangani to'xtatilmaydi).
Hech qanday qo'lda qadam kerak emas: push qilinsa sayt va APK yangilanadi.

**Worker:** hisobdagi mavjud `hasharchilar-api` (`workers_dev: true`).
**Sayt:** https://hasharchilar-api.davlatsudekspert.workers.dev ·
**APK:** https://hasharchilar-api.davlatsudekspert.workers.dev/api/app/download

Ketma-ketlik:

1. **test** — `npm ci` → `npm run build` → `npm run test:storage` → `npm run db:local` →
   ikkita `wrangler dev` (to'liq lokal, tokensiz, `GEO_MOCK:1` va `EMAIL_MOCK:1`): D1 rejimi (:8787) va Durable
   Object rejimi (:8788, `wrangler.deploy.json --storage do`, alohida `--persist-to`) → `npm run test:api` ikkala
   rejimda (`tests/email.test.mjs` email o'chiq holat uchun o'zi uchinchi, vaqtinchalik `wrangler dev` ochadi).
2. **apk** (test o'tsa):
   - ilova API manzili: `https://<wrangler.jsonc name>.<subdomen>.workers.dev`; subdomen
     `GET /accounts/{id}/workers/subdomain` dan olinadi (bo'lmasa ogohlantirish bilan `davlatsudekspert`);
   - `VITE_API_BASE=<manzil>` bilan build va `cap sync`, keyin `assembleRelease`
     (`versionCode = run_number`, `versionName = 1.0.<run_number>`), `apksigner` va `aapt2` bilan tekshiruv;
   - `version.json` yaratiladi: `{version, versionCode, sha256, cert, size}`;
   - **imzo mosligi:** hozir saytda turgan `https://<manzil>/app/version.json` (ochiq, token kerak emas) o'qiladi.
     404 yoki HTML (fayl hali yo'q) — birinchi chiqarish. `cert` farq qilsa (`allow_key_change=true` bo'lmasa):
     debug kalitida — job yiqilmaydi, `publish=false` (pastga qarang); `HASHARCHILAR_KEYSTORE_*` kalitida — xato;
   - artefakt `hasharchilar-apk` (`hasharchilar.apk` + `version.json`).
   - Job output'lari faqat `publish` va `release_key` bayroqlari: URL, sha256 va sertifikat uzatilmaydi, chunki
     GitHub secret qiymati (masalan, alias `hasharchilar`) ichida bo'lgan output'ni tashlab yuboradi.
3. **deploy** (apk o'tsa):
   - URL qayta hisoblanadi (`scripts/site-url.sh`, apk job'idagi bilan bir xil); bo'sh bo'lsa deploy qilinmaydi;
   - oddiy `npm run build` (`VITE_API_BASE` siz), artefakt `dist/app/` ga yuklanadi — APK saytning statik
     fayllari ichida chiqadi (R2 ga yozish ruxsati shart emas). `publish=false` bo'lsa artefakt o'rniga
     saytdagi hozirgi `/app/hasharchilar.apk` + `version.json` yuklab olinib (sha256 tekshiriladi) qayta joylanadi;
   - **baza turi aniqlanadi** (pastda) va `scripts/wrangler-config.mjs` `wrangler.deploy.json` ni yaratadi;
   - xavfsizlik tekshiruvi: konfiguratsiya faqat `hasharchilar-api` / `hasharchilar` / `hasharchilar-photos` /
     `HasharDB` ni ko'rsatishi kerak, nfcstore resurslariga hech qachon tegilmaydi;
   - R2 `hasharchilar-photos` borligi tekshiriladi (yo'q bo'lsa yaratiladi; yaratishga ruxsat bo'lmasa-yu,
     bucket mavjud bo'lsa — davom etadi);
   - D1 rejimida: eski (migratsiyasiz) jadvallar tekshiriladi, keyin `wrangler d1 migrations apply --remote`;
   - `wrangler deploy --config wrangler.deploy.json` (custom domen faqat xavfsiz bo'lsa — pastga qarang);
   - **email:** `RESEND_API` secret bo'lsa — Worker secret'lari `RESEND_API_KEY` va `RESEND_FROM` yoziladi
     (pastda: [Email (Resend)](#email-resend)); bo'sh bo'lsa — o'tkazib yuboriladi;
   - `/api/health` kutiladi;
   - **baza tekshiruvi:** `/api/stats` va `/api/hashars?status=COMPLETED` to'g'ri JSON qaytarishi kerak
     (`/api/health` bazaga tegmaydi). DO rejimida obyekt va migratsiyalar shu so'rovda ishga tushadi —
     migratsiya yiqilsa job qizil bo'ladi (oldingi versiyaga qaytish: `npx wrangler rollback --name hasharchilar-api`);
   - `/api/app` kutilgan versiyani ko'rsatishi, `/api/app/download`
     `application/vnd.android.package-archive` turi va aynan shu APK baytlarini (sha256) berishi tekshiriladi;
   - job xulosasida sayt manzili, APK havolasi (yangilanmagan bo'lsa — ogohlantirish) va tanlangan baza yoziladi.
4. **release** (deploy'dan keyin, alohida job — xatosi saytga ta'sir qilmaydi; `publish=false` bo'lsa o'tkazib
   yuboriladi): GitHub Release `hasharchilar-v1.0.N` (APK bilan; `main` bo'lmasa — prerelease).

### Baza: D1 yoki Durable Object (avtomatik, "sticky")

Deploy job'i baza turini quyidagicha tanlaydi va bu tanlov **keyin o'zgarmaydi**:

1. `hasharchilar-api` Worker'ining hozirgi sozlamalari o'qiladi (`GET .../workers/scripts/hasharchilar-api/settings`):
   - D1 binding `DB` bor → **D1** (shu baza id si bilan);
   - Durable Object binding `HASHAR_DB` bor → **DO**.
2. Hech biri yo'q (birinchi deploy): D1 API ishlatib ko'riladi — `hasharchilar` D1 topiladi yoki
   `eeur` hududida yaratiladi → **D1**. Tokenda D1 ruxsati bo'lmasa (`Authentication error`) → **DO**.
3. Kutilmagan API xatosida (tarmoq, 5xx) taxmin qilinmaydi — workflow to'xtaydi, chunki noto'g'ri tanlov
   saytni bo'sh bazaga ulab qo'yadi.

Tanlangan tur log'da va job xulosasida aniq yoziladi. Hozirgi token D1 ga ruxsat bermaydi, shuning uchun
sayt **SQLite Durable Object** rejimida ishlaydi (bepul tarifda ham mavjud). Ikkala rejimda ham sxema, API
va xatti-harakat bir xil; D1 rejimida ham `HasharDB` klassi e'lon qilinadi (ishlatilmaydi), chunki uni
olib tashlash alohida migratsiya talab qiladi.

**Keyinchalik D1 ga o'tish** — bu ma'lumot ko'chirish, shunchaki tokenga ruxsat qo'shish yetmaydi
(Worker'da DO binding bor ekan, workflow DO ni tanlayveradi):

1. Tokenga **Account → D1: Edit** qo'shing va `npx wrangler d1 create hasharchilar --location eeur` bilan baza yarating.
2. Ma'lumotni DO dan D1 ga ko'chiring. Hozircha DO uchun tayyor eksport vositasi yo'q: buning uchun
   vaqtinchalik himoyalangan eksport endpoint yoki skript yozish kerak (jadvallar `migrations/0001_init.sql` dagi
   kabi, `INSERT` lar bilan D1 ga `wrangler d1 execute --remote --file` orqali yuklanadi).
3. Bir marta qo'lda D1 rejimida deploy qiling:
   `node scripts/wrangler-config.mjs --storage d1 --d1-id <uuid> && npx wrangler d1 migrations apply hasharchilar --remote --config wrangler.deploy.json && npx wrangler deploy --config wrangler.deploy.json`.
   Shundan keyin Worker'da D1 binding paydo bo'ladi va workflow har safar D1 ni tanlaydi.

### APK qayerda turadi

- APK va uning metama'lumoti saytning statik fayllari ichida: `/app/hasharchilar.apk`, `/app/version.json`.
- `GET /api/app` → `{available, version, versionCode, size, url: "/api/app/download"}`; `GET /api/app/download` APK ni
  `content-type: application/vnd.android.package-archive` va `content-disposition: attachment; filename="hasharchilar.apk"`
  bilan beradi. Avval statik fayllar (`env.ASSETS`), ular bo'lmasa R2 dagi `app/hasharchilar.apk` (eski usul) o'qiladi.
  SPA rejimida yo'q fayl o'rniga `index.html` qaytadi — bu "APK yo'q" deb hisoblanadi.
- Saytdagi "Android ilovasini yuklab olish" banneri `/api/app` `available: true` bo'lganda chiqadi. APK ichida
  esa `versionCode` o'rnatilgan ilovanikidan katta bo'lsa "Yangi versiya — Yangilash" banneri chiqadi.

### Kerakli secretlar

| Secret | Majburiy | Izoh |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | ha | Hisob `31c4b3d8ece4b65de515debc4552334a`. Kerakli ruxsatlar: **Account → Workers Scripts: Edit, Workers R2 Storage: Read** (bucket yo'q bo'lsa Edit), **Account Settings: Read**. Ixtiyoriy: **D1: Edit** (birinchi deploy'dan oldin bo'lsa D1 tanlanadi), custom domen uchun **Zone → Workers Routes: Edit, DNS: Read**. Token faqat wrangler / Cloudflare API qadamlariga beriladi: `npm ci`, build va Gradle uni ko'rmaydi |
| `HASHARCHILAR_ADMIN_PHONES` | yo'q | admin panel egalari, vergul bilan (`+998901234567,+998...`); deploy'da Worker secret `ADMIN_PHONES` ga yoziladi (README → Admin panel) |
| `RESEND_API` | yo'q (email uchun kerak) | Resend API kaliti (`re_...`); deploy'da Worker secret `RESEND_API_KEY` ga, jo'natuvchi — `RESEND_FROM` ga yoziladi ([Email (Resend)](#email-resend)). Bo'lmasa email o'chiq: eski telefon+parol ro'yxati ishlaydi |
| `HASHARCHILAR_KEYSTORE_BASE64` | yo'q (tavsiya etiladi) | `base64 -w0 release.jks` natijasi |
| `HASHARCHILAR_KEYSTORE_PASSWORD` | yo'q | keystore paroli (kalit paroli ham shu bo'lishi kerak) |
| `HASHARCHILAR_KEY_ALIAS` | yo'q | kalit aliasi |

> **Diqqat — SPEC 8 dan chetlanish:** SPEC'da `ANDROID_KEYSTORE_*` nomlari yozilgan, lekin bu repoda shu nomli
> secretlar **nfcstore** ilovasining haqiqiy imzo kaliti (`android-apk.yml`). hasharchilar boshqa paket,
> unga alohida kalit kerak, shuning uchun workflow faqat `HASHARCHILAR_*` nomlarini o'qiydi. Qo'shimcha himoya:
> APK nfcstore sertifikati (`60:24:1D:…:86:40`) bilan imzolangan bo'lsa, workflow to'xtaydi.
>
> Secretlarni joylashda parol va alias chetidagi bo'shliq / qator ko'chirish olib tashlanadi. Keystore
> paroli va aliasi Gradle'dan oldin `keytool` bilan tekshiriladi, xato bo'lsa build boshlanmaydi.

Keystore secretlari bo'lmasa, APK keshlangan debug kaliti bilan imzolanadi. Bu kesh ishonchli emas: u har bir
branch uchun alohida (`main` dagi run feature branch keshini ko'rmaydi), 7 kun ishlatilmasa yoki repo kesh limiti
to'lsa o'chadi, shunda yangi debug kaliti yaratiladi. Ikkala branch ham bitta production saytiga chiqaradi.
Shuning uchun **"Imzo mosligi"** qadami yangi APK sertifikatini saytdagi `app/version.json` → `cert` bilan
solishtiradi. Ular farq qilsa, yangi APK saytga ham, GitHub Release'ga ham chiqarilmaydi, chunki o'rnatilgan
ilovalar uni qabul qilmaydi ("App not installed"). Lekin **sayt deploy'i to'xtamaydi**: kod va API yangilanadi,
saytda esa hozirgi (yangilanadigan) APK qoladi, run'da "APK yangilanmadi" ogohlantirishi chiqadi. Debug kalit
keshi faqat yangi APK chiqarilganda saqlanadi (saytdagidan farq qiladigan kalit keshlanmaydi).

Barqaror yechim — bir marta kalit yaratib, uni `HASHARCHILAR_KEYSTORE_*` secretlariga joylash (yuqoridagi
`keytool` buyrug'i). Kalitni ataylab almashtirish kerak bo'lsa (shu jumladan saytda debug APK turganda o'z
kalitiga birinchi marta o'tish), workflow'ni qo'lda (**Run workflow**) `allow_key_change = true` bilan ishga
tushiring — aks holda o'z kaliti farq qilgani uchun apk job xato beradi. Bunda foydalanuvchilar ilovani o'chirib,
qayta o'rnatishi kerak bo'ladi.

### Email (Resend)

Email kodlari [Resend](https://resend.com) orqali yuboriladi (`POST https://api.resend.com/emails`).

1. GitHub → **Settings → Secrets and variables → Actions → New repository secret**: nomi `RESEND_API`,
   qiymati — Resend API kaliti.
2. Keyingi deploy'da "Email" qadami:
   - kalit niqoblanadi va hech qayerda chiqarilmaydi (curl va wrangler'ga stdin orqali beriladi);
   - jo'natuvchi domeni `GET https://api.resend.com/domains` dan aniqlanadi: holati `verified` va nomida
     `hasharchilar` bo'lgan domen, bo'lmasa birinchi `verified` domen. Kalit cheklangan bo'lsa (faqat
     "Sending access" — domenlarni o'qib bo'lmaydi) yoki tasdiqlangan domen yo'q bo'lsa — `nfcstore.uz`
     (egasining Resend'da allaqachon tasdiqlangan domeni);
   - Worker secret'lari yoziladi: `RESEND_API_KEY` va `RESEND_FROM` = `Hasharchilar <no-reply@<domen>>`.
3. Natija: `GET /api/config` → `{"email_enabled": true}`, sayt va APK ro'yxatni email kodi bilan qiladi.

Keyinchalik `hasharchilar.uz` domenini Resend'da tasdiqlasangiz (Resend → Domains → Add, DNS yozuvlari),
keyingi deploy jo'natuvchini avtomatik `no-reply@hasharchilar.uz` ga almashtiradi.
CI'siz qo'lda: `printf '%s' 're_...' | npx wrangler secret put RESEND_API_KEY --name hasharchilar-api` va
`printf '%s' 'Hasharchilar <no-reply@nfcstore.uz>' | npx wrangler secret put RESEND_FROM --name hasharchilar-api`.
Xat yuborilmasa foydalanuvchi 502 `"Email yuborilmadi, birozdan keyin qayta urinib ko'ring"` ko'radi, Worker
logida faqat Resend javob statusi yoziladi (kalit, manzil va xat matni yozilmaydi).

### Admin panel

Admin panel saytda ham, Android ilovada ham **`#admin`** manzilida ochiladi (`https://hasharchilar.uz/#admin`).
U alohida JS bo'lagi sifatida faqat shu manzil ochilganda yuklanadi. Bo'limlar: **Umumiy** (statistika, oxirgi
hasharlar va foydalanuvchilar), **Foydalanuvchilar** (qidiruv; bloklash / blokdan chiqarish, admin qilish /
oddiy qilish, o'chirish — hasharlari va rasmlari bilan), **Hasharlar** (holat filtri, qidiruv, ko'rish va istalgan
holatdagi hasharni o'chirish).

**Qanday admin bo'linadi:**

1. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**:
   nomi `HASHARCHILAR_ADMIN_PHONES`, qiymati — telefon raqam(lar), vergul bilan: `+998901234567` yoki
   `+998901234567,+998935556677`. Raqamlarni hech qachon repodagi fayllarga yozmang (repo ochiq).
2. Workflow'ni qayta ishga tushiring (**Actions → hasharchilar → Run workflow**) yoki `main` ga push qiling.
   Deploy qadami secretni Worker'ning `ADMIN_PHONES` secret'iga yozadi (secret bo'sh bo'lsa — o'tkazib yuboriladi,
   Worker'dagi qiymat o'zgarmaydi).
3. Saytda (yoki ilovada) **shu raqam bilan** ro'yxatdan o'ting yoki kiring.
4. **Profil → 🛡️ Admin panel** tugmasini bosing yoki `<sayt>/#admin` ni oching.

Qoidalar:
- Admin — `ADMIN_PHONES` dagi raqam **yoki** paneldan "Admin qilish" bilan tayinlangan foydalanuvchi (`users.role = 'admin'`).
- `ADMIN_PHONES` orqali tayinlangan "asosiy admin"ni paneldan bloklab, oddiy qilib yoki o'chirib bo'lmaydi;
  admin o'zini ham bloklay / o'chira / rolini o'zgartira olmaydi (409).
- Bloklangan foydalanuvchining barcha sessiyalari o'chiriladi, kirishda "Hisobingiz bloklangan" (403) chiqadi;
  uning hasharlari saytda qoladi.
- CI'siz qo'lda: `printf '%s' '+998901234567' | npx wrangler secret put ADMIN_PHONES --name hasharchilar-api`.

### Sayt manzili va `hasharchilar.uz` domenini ulash

Sayt `https://hasharchilar-api.davlatsudekspert.workers.dev` manzilida ishlaydi. Android ilova ham doim shu
manzilga murojaat qiladi (`workers_dev: true` — domen ulangandan keyin ham ishlayveradi).

`hasharchilar.uz` zonasi hozir Cloudflare hisobida yo'q, shuning uchun workflow domen qadamini o'tkazib yuboradi. Ulash:

1. Cloudflare Dashboard → **Add a site** → `hasharchilar.uz`. Domen registratorida nameserverlarni
   Cloudflare bergan qiymatlarga almashtiring va zona **Active** bo'lishini kuting.
2. Workflow'ni qayta ishga tushiring. Domen faqat quyidagi ikki holatda avtomatik ulanadi:
   - zona `active` va domen allaqachon shu Worker'ga ulangan;
   - zona `active` va `hasharchilar.uz` uchun hech qanday DNS yozuvi yo'q.

   Mavjud DNS yozuvlarini workflow hech qachon o'zgartirmaydi. Yozuvlar bor bo'lsa, domenni qo'lda ulang:
   Workers & Pages → `hasharchilar-api` → Settings → Domains & Routes → **Add → Custom domain**.

### Qo'lda deploy (CI siz)

```bash
npx wrangler login
npx wrangler r2 bucket create hasharchilar-photos     # agar yo'q bo'lsa
# Durable Object rejimi (hozirgi production):
node scripts/wrangler-config.mjs --storage do
# yoki D1 rejimi: node scripts/wrangler-config.mjs --storage d1 --d1-id <uuid> && npm run db:remote
npm run deploy                                        # vite build + wrangler deploy --config wrangler.deploy.json
```

Qaysi rejimda ekanini Worker sozlamalaridan tekshiring (Dashboard → `hasharchilar-api` → Bindings) va
production'ni boshqa rejimga **tasodifan** o'tkazmang: ma'lumotlar eski bazada qoladi.

## Email bilan ro'yxat va tasdiqlash

Email xizmati **yoqilgan** bo'lsa (`RESEND_API_KEY` bor yoki lokal/test `EMAIL_MOCK=1`) — `GET /api/config` →
`{"email_enabled": true}`:

- **Ro'yxat faqat email kodi bilan:** `POST /api/auth/register/start` (ism, email, telefon, parol) → emailga
  6 xonali kod → `POST /api/auth/register/verify` → hisob (email tasdiqlangan) va sessiya. Eski
  `POST /api/auth/register` (eski APK'lar) — 410 `{"error": "Ilovani yangilang: ro'yxatdan o'tish endi email orqali", "code": "email_required"}`.
- **Email majburiy:** emaili tasdiqlanmagan foydalanuvchi (email joriy qilinishidan oldingi hisoblar, admin ham)
  kira oladi, hamma narsani ko'radi, profilini tahrirlaydi va email qo'sha oladi. Lekin hashar yaratish,
  qo'shilish, chiqish, yakunlash, o'z hasharini o'chirish va izoh yozish — 403
  `{"error": "Avval emailingizni tasdiqlang", "code": "email_unverified"}` (`requireVerifiedEmail`).
  Eski v2 APK (`?client=3` belgisiz; v3 sayt/APK uni query'da yuboradi — CORS o'zgarmaydi, yangi APK eski worker bilan ham ishlaydi) shu holatda 403 `app_update_required` "Ilovani yangilang: …" oladi.
  Admin moderatsiyasi (`/api/admin/*`) bunga kirmaydi.
- **Sayt/APK:** bunday foydalanuvchi kirganda to'liq ekranli "Emailni tasdiqlang" bosqichi (email → kod) chiqadi;
  "Keyinroq" bosilsa ko'rish sahifalarida yopsa bo'ladigan eslatma (banner) turadi, yozuvchi amalga urinish
  yoki API'dan kelgan istalgan 403 `email_unverified` shu bosqichni qayta ochadi. Profil → Sozlamalar → "Email"
  kartasi: email va "Tasdiqlangan" belgisi yoki "Email qo'shish".
- **Kirish:** `{login, password}` — `login` telefon yoki email (katta-kichik harf farqi yo'q); eski `{phone, password}` ham ishlaydi.
- **Parolni tiklash:** `POST /api/auth/forgot` doim 200 qaytaradi (hisob borligi aytilmaydi; kod faqat shu email
  tasdiqlangan hisob bo'lsa yuboriladi), `POST /api/auth/reset` — yangi parol, barcha eski sessiyalar o'chadi.
- **Kod qoidalari:** 6 raqam (`crypto.getRandomValues`, teng taqsimot), bazada faqat `sha256(purpose|email|code)`,
  10 daqiqa amal qiladi, 5 ta noto'g'ri urinishdan keyin o'ladi, bir marta ishlatiladi, yangi kod eskisini bekor
  qiladi, solishtirish doimiy vaqtda. Qayta yuborish — email+maqsad bo'yicha 60 soniyada bir marta (429 +
  `Retry-After`), bitta emailga 5 ta / soat, bitta IP dan 20 ta / soat.
- Email faqat foydalanuvchining o'ziga (`/api/me`, kirish/ro'yxat/profil javoblari) va admin ro'yxatida
  qaytariladi; ommaviy javoblarda (profil, reyting, izohlar, hashar, ko'ngillilar) hech qachon.

Email xizmati **o'chiq** bo'lsa (kalit yo'q, `EMAIL_MOCK` emas) sayt qulflanib qolmaydi: eski telefon+parol
ro'yxati ishlaydi, email marshrutlari 503 `"Email xizmati sozlanmagan"`, yozuvchi amallar cheklanmaydi.

## API (qisqacha)

Barcha javoblar JSON formatida. Xato javobi `{ "error": "<o'zbekcha matn>" }` ko'rinishida, mos HTTP status bilan qaytadi
(ba'zilarida mashina o'qiydigan `code` ham bor: `email_required`, `email_unverified`).
To'liq tavsif va `HasharDTO` maydonlari [`SPEC.md`](./SPEC.md) ning 5-bo'limida.

| Metod | Yo'l | Auth | Tavsif |
|---|---|---|---|
| GET | `/api/config` | – | `{email_enabled}` |
| POST | `/api/auth/register/start` | – | `{name, phone, email, password}` → `{ok, email, expires_in: 600, resend_in: 60}` (+ `dev_code` faqat `EMAIL_MOCK=1`). Telefon/email band — 409, 60 s ichida qayta — 429, email o'chiq — 503 |
| POST | `/api/auth/register/verify` | – | `{email, code}` → 201 `{token, user}`. Noto'g'ri kod — 400 `"Kod noto'g'ri"`, eskirgan/o'lgan — 400 `"Kod eskirgan, yangisini so'rang"`, band — 409 |
| POST | `/api/auth/register` | – | eski: `{name, phone, password}` → 201. Email yoqilgan bo'lsa — 410 `email_required` |
| POST | `/api/auth/login` | – | `{login, password}` (telefon yoki email) yoki eski `{phone, password}` → `{token, user}`. Noto'g'ri bo'lsa 401 |
| POST | `/api/auth/forgot` | – | `{email}` → doim 200 `{ok, email, expires_in, resend_in}` |
| POST | `/api/auth/reset` | – | `{email, code, new_password}` → `{token, user}`; barcha eski sessiyalar o'chadi |
| POST | `/api/me/email/start` | ✓ | `{email}` → `{ok, email, expires_in, resend_in}`; boshqa hisobda bo'lsa 409 |
| POST | `/api/me/email/verify` | ✓ | `{code}` → `{user}` (email va `email_verified: true`) |
| POST | `/api/auth/logout` | ✓ | sessiyani o'chiradi |
| GET | `/api/me` | ✓ | `{user, stats: {created, joined, completed}}` |
| POST | `/api/me/password` | ✓ | `{current_password, new_password}` → `{ok:true}`; joriy parol noto'g'ri — 401 `"Joriy parol noto'g'ri"` (limit kirish bilan umumiy); boshqa sessiyalar o'chadi |
| POST | `/api/me/profile` | ✓ | multipart `name?, bio? (≤300), district? (≤60), avatar? (≤5 MB), remove_avatar?=1` → `{user}`; eski avatar R2 dan o'chadi |
| GET | `/api/stats` | – | `{hashars, completed, volunteers, upcoming, districts}` |
| GET | `/api/hashars` | ixtiyoriy | `HasharDTO[]`. Query: `status`, `mine=created\|joined`, `q`, `category` (vergul bilan bir nechta), `from`/`to` (YYYY-MM-DD), `near=lat,lng` + `radius_km` (standart 50, ≤ 1000; masofa bo'yicha tartib, `distance_km`) |
| GET | `/api/hashars/:id` | ixtiyoriy | DTO + `volunteers[]`. `creator.phone` faqat qatnashuvchi yoki egasiga ko'rinadi |
| POST | `/api/hashars` | ✓ | multipart: `title, description, address, lat, lng, date_time, items` (JSON), ixtiyoriy `category` (`cleaning`—standart, `greening`, `repair`, `other`), `max_volunteers` (2–1000, bo'sh — cheklanmagan) va `photo` → 201 |
| POST / DELETE | `/api/hashars/:id/join` | ✓ | qo'shilish (idempotent; `max_volunteers` to'lgan bo'lsa 409 `"Joy qolmadi"`) / chiqish (egasi chiqa olmaydi) |
| GET | `/api/hashars/:id/comments` | ixtiyoriy | `[{id, body, created_at, user:{id,name,avatar_url}, is_mine}]` (oxirgi 200 ta, eski → yangi) |
| POST | `/api/hashars/:id/comments` | ✓ | `{body}` (1–500 belgi) → 201 izoh; 20 ta / soat |
| DELETE | `/api/comments/:id` | ✓ | o'z izohi yoki admin |
| GET | `/api/users/:id` | ixtiyoriy | ommaviy profil `{id, name, bio, district, avatar_url, created_at, stats, hashars}` — telefon YO'Q |
| GET | `/api/leaderboard` | – | `?period=all\|month` → top 50 `[{user, joined, completed, created, score}]` |
| GET | `/api/geo/search` | – | `?q=` (2–120 belgi) → `[{name, display, lat, lng}]` (≤ 6, faqat O'zbekiston) |
| GET | `/api/geo/reverse` | – | `?lat=&lng=` → `{display, district, city}` |
| POST | `/api/hashars/:id/complete` | ✓ egasi | multipart `photo` ("Keyin" rasmi) → COMPLETED |
| DELETE | `/api/hashars/:id` | ✓ egasi | faqat PENDING holatda; R2 dagi rasmlar ham o'chiriladi |
| GET | `/api/media/:folder/:file` | – | R2 dagi rasm: `before`, `after`, `avatars` (immutable kesh) |
| GET | `/api/app`, `/api/app/download` | – | APK mavjudligi va versiyasi; faylni yuklab olish (statik `dist/app/`, zaxira — R2) |
| GET | `/api/health` | – | `{ok:true}` |
| GET | `/api/admin/overview` | ✓ admin | umumiy raqamlar + `recent_hashars`, `recent_users` (5 tadan) |
| GET | `/api/admin/users` | ✓ admin | `?q=&offset=&limit=` (≤ 100; ism, telefon yoki email) → `{items, total}` (`email`, `email_verified` bilan) |
| POST | `/api/admin/users/:id/block`, `/unblock`, `/role` | ✓ admin | bloklash (sessiyalar o'chadi, boshqalarning hali bo'lmagan PENDING hasharlaridagi qatnashuvlari bekor qilinadi — joy bo'shaydi; o'tib ketgan hasharlardagi qatnashuv qoladi) / blokdan chiqarish / `{role: 'user'\|'admin'}` |
| DELETE | `/api/admin/users/:id` | ✓ admin | foydalanuvchi + sessiyalari, email kodlari, qatnashuvlari, izohlari, hasharlari, ularning rasmlari va avatari |
| GET | `/api/admin/hashars` | ✓ admin | `?status=&q=&offset=&limit=` → `{items: HasharDTO + creator.phone, total}` |
| DELETE | `/api/admin/hashars/:id` | ✓ admin | istalgan holatdagi hashar (R2 rasmlari va izohlari bilan) |
| DELETE | `/api/admin/comments/:id` | ✓ admin | istalgan izohni o'chirish |

`user` obyektida (`/api/me`, kirish, ro'yxat, profil) `is_admin`, `bio`, `district`, `avatar_url`, `email`, `email_verified` maydonlari bor.
✓ belgili yozuvchi amallar (hashar yaratish, qo'shilish/chiqish, yakunlash, o'chirish, izoh) email yoqilgan bo'lsa
tasdiqlangan emailni ham talab qiladi (403 `email_unverified`).
`HasharDTO` da (v3): `category`, `max_volunteers`, `comment_count`, `creator.avatar_url`; tafsilotdagi `volunteers[]` da `avatar_url`.

**Geo proksi** (`worker/geo.js`): mijoz Nominatim'ga to'g'ridan-to'g'ri murojaat qilmaydi. Worker
`format=jsonv2, countrycodes=uz, accept-language=uz,ru, limit=6` va `User-Agent: hasharchilar.uz/1.0 (+https://hasharchilar-api.davlatsudekspert.workers.dev)`
bilan so'raydi; javob `geo_cache` jadvalida 30 kun saqlanadi (kalit: kichik harfli qidiruv so'zi yoki 4 xonagacha
yaxlitlangan koordinata; javobda `x-geo-cache: hit|miss`). IP bo'yicha 30 so'rov / daqiqa (429). Keshda yo'q so'rovlar
butun ilova uchun umumiy navbatdan o'tadi (Nominatim qoidasi: ≤ 1 so'rov/s): ikki upstream so'rov orasida ≥ 1.1 s,
navbat 3 s ichida kelmasa → 503 `"Manzil xizmati band…"` (Retry-After). Mijoz ham qidiruvni faqat Enter / "Qidirish"
bosilganda yuboradi (avtomatik to'ldirish yo'q), reverse — faqat foydalanuvchi pinni surgandan keyin. Upstream xatosi yoki
8 soniyalik timeout → 502 `"Manzil xizmati vaqtincha ishlamayapti"` (xato keshlanmaydi). Admin marshrutlari: mehmon → 401, oddiy foydalanuvchi → 403.

CORS quyidagi originlarga ruxsat beradi: `https://localhost` (APK), `capacitor://localhost`, `http://localhost`,
`http://localhost:5173` va so'rov kelgan hostning o'zi.

## Ma'lum cheklovlar

- **Telefon tasdiqlanmaydi** (SMS yo'q) — tasdiqlanadigan va parolni tiklashda ishlatiladigan kanal — email.
  Email xizmati o'chiq bo'lsa (`RESEND_API` secret yo'q) parolni tiklab bo'lmaydi (kirgan foydalanuvchi parolini
  `POST /api/me/password` bilan almashtira oladi).
- **Xarita** OpenFreeMap vektor plitkalaridan keladi (kalitsiz, limitsiz). Uslub manzillari `src/lib/map.js`
  (`STYLE_LIGHT`, `STYLE_DARK`) da; boshqa xizmatga o'tish uchun faqat shu ikki URL almashtiriladi. MapLibre WebGL2
  talab qiladi (Android System WebView 2021+); WebGL bo'lmagan juda eski qurilmalarda xarita o'rniga bo'sh fon chiqadi,
  ro'yxat va boshqa sahifalar ishlayveradi.
- **Qidiruv** oddiy `LIKE` bilan ishlaydi. D1 da shablon uzunligi 50 bayt bilan cheklangani uchun
  juda uzun so'rov qisqartiriladi.
- **Eski WebView:** Tailwind v4 taxminan Chrome 111+ ni talab qiladi. Eski Android WebView'larida dizayn buzilishi mumkin.
- **Android 15+** da status bar rangini kod orqali o'zgartirib bo'lmaydi. Uning o'rniga safe-area ustiga emerald chiziq chiziladi.
- **APK haqiqiy qurilmada sinalmagan.** Brauzerda mock Capacitor muhiti bilan va boshqa origin'dan
  (CORS, Bearer token, multipart) to'liq sinalgan.
- **Mavjud D1:** Cloudflare hisobida eski, migratsiyasiz `hasharchilar` D1 bo'lsa, deploy ma'lumotni o'chirmaydi.
  U to'xtab, nima qilish kerakligini aytadi: bazani zaxiralash (`wrangler d1 export`), so'ng o'chirish yoki boshqa nomga o'tkazish.
- **Durable Object rejimi:** butun baza bitta obyektda (`main`, hudud `eeur`) — so'rovlar ketma-ket bajariladi.
  Bu jamoat sayti hajmi uchun yetarli. DO bazasini `wrangler d1 execute/export` bilan ko'rib yoki eksport qilib
  bo'lmaydi (D1 ga o'tish — yuqoridagi "Keyinchalik D1 ga o'tish").
- **APK hajmi:** statik fayl sifatida ≤ 25 MiB bo'lishi kerak (hozir ~3.6 MB); CI buni tekshiradi.
- Push-bildirishnomalar va avtomatik moderatsiya hozircha yo'q (qo'lda boshqarish — admin panel, `#admin`).
