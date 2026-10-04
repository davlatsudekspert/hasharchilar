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
   users, sessions, hashars, hashar_media, volunteers, rate_limits
```

- **Stek:** React 18 · Vite 6 · Tailwind CSS v4 · Leaflet 1.9 (OpenStreetMap plitkalari) · Hono 4 ·
  Cloudflare Workers + D1 / SQLite Durable Object + R2 · Capacitor 8 (Android).
- **Autentifikatsiya:** ism + telefon (+998…) + parol. Parol PBKDF2-SHA256 (100 000 iteratsiya) bilan saqlanadi.
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
  - kirish: bitta telefon raqamiga 15 daqiqada 10 ta urinish (IP almashtirilsa ham);
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
├── migrations/              # 0001_init.sql, 0002_admin.sql (D1: wrangler d1 migrations apply; DO: o'zi qo'llaydi)
├── schema.sql               # migratsiyalar birlashtirilgani (qulaylik uchun)
├── seed.sql                 # FAQAT lokal namuna ma'lumot (parol: demo1234)
├── worker/                  # Hono backend (+ admin.js, do-db.js, d1-adapter.js, migrations.js, sql-split.js)
├── scripts/wrangler-config.mjs # wrangler.jsonc → wrangler.deploy.json (--storage d1|do)
├── scripts/site-url.sh      # CI: https://<worker>.<subdomen>.workers.dev manzili
├── tests/api.test.mjs       # API testi (node:test, wrangler dev ga qarshi; D1 va DO rejimida)
├── tests/admin.test.mjs     # admin panel API testi (server ADMIN_PHONES bilan); tests/helpers.mjs — umumiy
├── tests/storage.test.mjs   # baza qatlami: DO adapteri = D1, migratsiyalar, wrangler-config
├── src/                     # React (sayt va APK uchun bir xil)
│   ├── lib/                 #   config, api, auth, image, map, native, backButton, utils
│   ├── components/          #   Header, Hero, Tabs, MapView, HasharCard, HasharDetail,
│   │                        #   CreateHasharModal (4 bosqich), AuthModal, ProfileModal, ...
│   └── admin/               #   admin panel (#admin, alohida lazy bundle)
├── public/                  # favicon, ikonlar, og-image, demo/ (seed rasmlari)
├── android/                 # Capacitor Android loyihasi (commit qilinadi)
├── resources/, scripts/     # ikonka/splash manbalari va generatori
└── docs/screenshots/        # ekran rasmlari (mobil va desktop)
```

## Lokal ishga tushirish

Talablar: Node.js 22.

```bash
npm ci
npm run db:local     # lokal D1: migratsiya + namuna ma'lumot (.wrangler/state ichida)
npm run dev          # sayt: http://localhost:5173  (Vite, /api → wrangler dev :8787 ga proxy)
```

Namuna foydalanuvchilar uchun parol `demo1234`:

| Ism | Telefon |
|---|---|
| Aziz Karimov | +998 90 111 22 33 |
| Malika Yusupova | +998 93 555 66 77 |
| Jasur Toshmatov | +998 97 777 88 99 |

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
npx wrangler dev --port 8787 --var ADMIN_PHONES:+998900000099 &   # boshqa terminalda
npm run test:api                   # tests/api.test.mjs + tests/admin.test.mjs (BASE_URL bilan boshqa manzil)

# Durable Object rejimi (alohida port va saqlash papkasi):
node scripts/wrangler-config.mjs --storage do
npx wrangler dev --config wrangler.deploy.json --port 8788 --persist-to .wrangler/state-do-test \
  --var ADMIN_PHONES:+998900000099 &
STORAGE=do BASE_URL=http://localhost:8788 npm run test:api

npm run test:storage               # server kerak emas: DO adapteri = D1, migratsiyalar, wrangler-config
```

- Test bo'sh bo'lmagan bazada ham qayta ishlaydi, chunki har safar tasodifiy telefon raqamlari va IP manzillar ishlatiladi.
- Admin testlari (`tests/admin.test.mjs`) server **`ADMIN_PHONES`** bilan ishga tushgan bo'lishini talab qiladi:
  `+998900000099` — soxta test raqami (boshqasi uchun `ADMIN_PHONE=+998... npm run test:api`). Bu raqam bilan
  hisob bo'lmasa ro'yxatdan o'tiladi, bo'lsa kiriladi (parol `admin-test-123`). `npm run dev:api` ham shu raqamni beradi.
- 300+ eski hasharli test eski sanali qatorlarni `wrangler d1 execute` bilan yozadi, shuning uchun DO
  rejimida (`STORAGE=do`) o'tkazib yuboriladi.
- `/api/app` testi `dist/app/` ga qaraydi: `dist/app/hasharchilar.apk` + `version.json` bo'lsa "mavjud"
  holati (versiya, hajm, yuklab olingan baytlar, sha256), bo'lmasa "yo'q" holati (`available:false`, 404 JSON) tekshiriladi.
- `test:storage` bir xil so'rovlar ketma-ketligini haqiqiy lokal D1 va `HasharDB` adapterida bajarib,
  natijalar, `meta.changes`/`last_row_id` va xato matnlari aynan bir xilligini, `batch` atomarligini,
  tashqi kalit / `ON DELETE CASCADE` ni va qayta ishga tushganda migratsiyalar takrorlanmasligini tekshiradi.
  Yangilanish testi: `0001` dan keyin `seed.sql` (+ sessiya va limit qatorlari) yoziladi, so'ng qolgan
  migratsiyalar birma-bir qo'llanadi — har biri ma'lumotli bazada o'tishi shart.

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
- Native imkoniyatlar:
  - Android "orqaga" tugmasi ochiq oynani yopadi, oyna ochiq bo'lmasa ilovadan chiqadi;
  - status bar emerald rangda, safe-area hisobga olinadi;
  - splash ekran ma'lumot yuklangach yopiladi (eng ko'pi 4 soniya);
  - rasm uchun "Kamera" (kamerani ochadi, CAMERA ruxsati so'raladi) va "Galereya" tugmalari bor;
  - joylashuv ruxsati "Yaqindagi hasharlar" va "Mening joylashuvim" bosilganda so'raladi;
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
   ikkita `wrangler dev` (to'liq lokal, tokensiz): D1 rejimi (:8787) va Durable Object rejimi (:8788,
   `wrangler.deploy.json --storage do`, alohida `--persist-to`) → `npm run test:api` ikkala rejimda.
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
- `GET /api/app` → `{available, version, size, url: "/api/app/download"}`; `GET /api/app/download` APK ni
  `content-type: application/vnd.android.package-archive` va `content-disposition: attachment; filename="hasharchilar.apk"`
  bilan beradi. Avval statik fayllar (`env.ASSETS`), ular bo'lmasa R2 dagi `app/hasharchilar.apk` (eski usul) o'qiladi.
  SPA rejimida yo'q fayl o'rniga `index.html` qaytadi — bu "APK yo'q" deb hisoblanadi.
- Saytdagi "Android ilovasini yuklab olish" banneri `/api/app` `available: true` bo'lganda chiqadi.

### Kerakli secretlar

| Secret | Majburiy | Izoh |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | ha | Hisob `31c4b3d8ece4b65de515debc4552334a`. Kerakli ruxsatlar: **Account → Workers Scripts: Edit, Workers R2 Storage: Read** (bucket yo'q bo'lsa Edit), **Account Settings: Read**. Ixtiyoriy: **D1: Edit** (birinchi deploy'dan oldin bo'lsa D1 tanlanadi), custom domen uchun **Zone → Workers Routes: Edit, DNS: Read**. Token faqat wrangler / Cloudflare API qadamlariga beriladi: `npm ci`, build va Gradle uni ko'rmaydi |
| `HASHARCHILAR_ADMIN_PHONES` | yo'q | admin panel egalari, vergul bilan (`+998901234567,+998...`); deploy'da Worker secret `ADMIN_PHONES` ga yoziladi (README → Admin panel) |
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

## API (qisqacha)

Barcha javoblar JSON formatida. Xato javobi `{ "error": "<o'zbekcha matn>" }` ko'rinishida, mos HTTP status bilan qaytadi.
To'liq tavsif va `HasharDTO` maydonlari [`SPEC.md`](./SPEC.md) ning 5-bo'limida.

| Metod | Yo'l | Auth | Tavsif |
|---|---|---|---|
| POST | `/api/auth/register` | – | `{name, phone, password}` → 201 `{token, user}`. Telefon band bo'lsa 409 |
| POST | `/api/auth/login` | – | `{phone, password}` → `{token, user}`. Noto'g'ri bo'lsa 401 |
| POST | `/api/auth/logout` | ✓ | sessiyani o'chiradi |
| GET | `/api/me` | ✓ | `{user, stats: {created, joined, completed}}` |
| GET | `/api/stats` | – | `{hashars, completed, volunteers}` |
| GET | `/api/hashars` | ixtiyoriy | `HasharDTO[]`. Query: `status`, `mine=created\|joined`, `q` |
| GET | `/api/hashars/:id` | ixtiyoriy | DTO + `volunteers[]`. `creator.phone` faqat qatnashuvchi yoki egasiga ko'rinadi |
| POST | `/api/hashars` | ✓ | multipart: `title, description, address, lat, lng, date_time, items` (JSON) va ixtiyoriy `photo` → 201 |
| POST / DELETE | `/api/hashars/:id/join` | ✓ | qo'shilish (idempotent) / chiqish (egasi chiqa olmaydi) |
| POST | `/api/hashars/:id/complete` | ✓ egasi | multipart `photo` ("Keyin" rasmi) → COMPLETED |
| DELETE | `/api/hashars/:id` | ✓ egasi | faqat PENDING holatda; R2 dagi rasmlar ham o'chiriladi |
| GET | `/api/media/:folder/:file` | – | R2 dagi rasm (immutable kesh) |
| GET | `/api/app`, `/api/app/download` | – | APK mavjudligi va versiyasi; faylni yuklab olish (statik `dist/app/`, zaxira — R2) |
| GET | `/api/health` | – | `{ok:true}` |
| GET | `/api/admin/overview` | ✓ admin | umumiy raqamlar + `recent_hashars`, `recent_users` (5 tadan) |
| GET | `/api/admin/users` | ✓ admin | `?q=&offset=&limit=` (≤ 100) → `{items, total}` |
| POST | `/api/admin/users/:id/block`, `/unblock`, `/role` | ✓ admin | bloklash (sessiyalar o'chadi) / blokdan chiqarish / `{role: 'user'\|'admin'}` |
| DELETE | `/api/admin/users/:id` | ✓ admin | foydalanuvchi + sessiyalari, qatnashuvlari, hasharlari va ularning rasmlari |
| GET | `/api/admin/hashars` | ✓ admin | `?status=&q=&offset=&limit=` → `{items: HasharDTO + creator.phone, total}` |
| DELETE | `/api/admin/hashars/:id` | ✓ admin | istalgan holatdagi hashar (R2 rasmlari bilan) |

`user` obyektida (`/api/me`, kirish, ro'yxat) `is_admin` maydoni bor. Admin marshrutlari: mehmon → 401, oddiy foydalanuvchi → 403.

CORS quyidagi originlarga ruxsat beradi: `https://localhost` (APK), `capacitor://localhost`, `http://localhost`,
`http://localhost:5173` va so'rov kelgan hostning o'zi.

## Ma'lum cheklovlar

- **Telefon tasdiqlanmaydi.** SMS (OTP) yo'q, parolni tiklash funksiyasi ham yo'q.
- **Xarita plitkalari** to'g'ridan-to'g'ri `tile.openstreetmap.org` dan keladi (kalitsiz, OSM foydalanish qoidalari bo'yicha kichik trafik uchun). Trafik katta bo'lsa, MapTiler yoki Stadia kabi kalitli xizmatga o'tish kerak (`src/lib/map.js` → `TILE_URL`).
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
