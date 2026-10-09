# hasharchilar.uz v4 — reja va shartnoma

v3 ustiga. Email OTP hozircha e'tiborsiz (Resend domeni keyin) — mavjud email kodi o'zgarmaydi.

## 1. Dizayn va tezlik
- **Mavzular (themes):** rejim — Yorug' / Tungi / Tizim; rang aksenti — **Zumrad** (standart, emerald), **Okean** (ko'k-feruza), **Shafaq** (to'q sariq-pushti), **Binafsha** (violet). Hammasi CSS o'zgaruvchilari orqali; tanlov `localStorage['hashar_theme']` (rejim) va `localStorage['hashar_accent']` da, birinchi chizishdan oldin qo'llanadi. Sozlamalarda vizual tanlagich (rangli doiralar + oldindan ko'rish). Status bar (APK) aksentga mos.
- **Bottom bar (mobil/APK):** shisha (blur) fon, aktiv tab ostida silliq siljiydigan "pill" indikator (spring easing), ikonka bosilganda bounce/scale, aktiv ikonka to'ldirilgan variantga o'tadi, markaziy ＋ tugma aksent gradient + bosilganda burilish/puls, scroll pastga — bar yashirinadi, tepaga — chiqadi, haptics. Bildirishnomalar badge'i (qizil nuqta/son).
- **Animatsiyalar:** sahifa o'tishlari (View Transitions API, bo'lmasa CSS fade/slide), kartalar paydo bo'lishi (stagger), skeleton shimmer, tugma press-feedback, modal/sheet spring. `prefers-reduced-motion` hurmat qilinadi.
- **Tezlik:** route-level lazy chunk'lar, bo'sh vaqtda keyingi sahifalarni prefetch, API javoblari uchun SWR kesh (xotira + sessionStorage, darhol ko'rsatib fonda yangilash), rasmlar `loading=lazy decoding=async` + o'lcham, birinchi ekran ≤ 1 so'rov kutadi.

## 2. Ilova qulfi — PIN kod va barmoq izi (faqat APK)
- `src/lock/AppLock.jsx` (default export `AppLock({children})`) — ilova ustida qulf ekrani; `src/lock/LockSettings.jsx` (default export) — Profil → Sozlamalar ichidagi "Xavfsizlik" kartasi. Saytda (web) ikkalasi ham hech narsa qilmaydi (`LockSettings` web'da "faqat ilovada" deb ko'rsatadi yoki yashiriladi).
- 4 xonali PIN: o'rnatish (2 marta), o'zgartirish (eski PIN bilan), o'chirish. PIN PBKDF2 (salt bilan) xeshlanib `@capacitor/preferences` da saqlanadi — hech qachon ochiq matnda emas.
- Barmoq izi / yuz: `@capgo/capacitor-native-biometric` — mavjud bo'lsa "Barmoq izi bilan ochish" yoqiladi; qulf ekranida avtomatik so'raladi, PIN zaxira.
- Qachon qulflanadi: ilova ochilganda va fondan qaytganda, sozlama bo'yicha (darhol / 30 s / 1 daqiqa / 5 daqiqa).
- 5 ta xato → 30 s kutish (har safar ikki baravar, max 15 daqiqa); "PIN ni unutdim" → tizimdan chiqish (token + PIN o'chiriladi), qayta kirish kerak.
- Qulf ekrani: logo, ism/avatar, raqamli klaviatura (katta tugmalar, haptics, nuqtalar animatsiyasi, xato bo'lsa silkinish), biometrik tugma.

## 3. Hashar e'lon qilish — 5000 so'm
- Narx admin sozlamasida (`hashar_fee`, so'mda, standart **5000**; 0 = bepul). Mavjud hasharlar to'langan hisoblanadi.
- Yangi hashar yaratilganda `payment_status='unpaid'` — u **ommaga ko'rinmaydi** (faqat egasi va admin), to'langach `paid` → e'lon qilinadi (egasiga bildirishnoma).
- To'lov usullari: **Payme** (Merchant API, JSON-RPC), **Click** (Shop API prepare/complete), **qo'lda** (admin tasdiqlaydi — provayder sozlanmagan bo'lsa ham ishlaydi; admin sozlamasidagi `manual_payment_note` matni egasiga ko'rsatiladi, masalan karta raqami).
- Provayder kalitlari Worker secret'lari (CI GitHub secret'lardan o'tkazadi, bo'lsa): `PAYME_MERCHANT_ID`, `PAYME_KEY` (+ ixtiyoriy `PAYME_TEST_KEY`, `PAYME_TEST_MODE=1`), `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`, `CLICK_MERCHANT_USER_ID`. GitHub nomlari: `HASHARCHILAR_PAYME_MERCHANT_ID` va h.k.
- Namuna (ishlab turgan, shu egasining boshqa loyihasi): `/home/user/nfcx/server/payme.js`, `/home/user/nfcx/server/click.js` (faqat o'qish uchun).

### Baza (migration 0005 — mavjud ma'lumotda ishlashi SHART)
- `hashars.payment_status TEXT NOT NULL DEFAULT 'paid' CHECK IN ('unpaid','paid','waived')`
- `payments(id PK, hashar_id INTEGER, user_id INTEGER, provider TEXT CHECK IN ('payme','click','manual'), amount INTEGER NOT NULL /* tiyin */, state INTEGER NOT NULL /* payme: 1,2,-1,-2; click: 0 prepared,1 done,-1 cancelled */, provider_tx_id TEXT, create_time INTEGER, perform_time INTEGER, cancel_time INTEGER, reason INTEGER, created_at TEXT)` + UNIQUE(provider, provider_tx_id)
- `settings(key TEXT PK, value TEXT NOT NULL)`

### API
| Metod | Yo'l | Auth | Tavsif |
|---|---|---|---|
| GET | `/api/config` | – | + `hashar_fee` (so'm), `payments: {payme, click, manual}`, `manual_payment_note` |
| POST | `/api/hashars` | ✓ | fee>0 bo'lsa 201 + `payment_status:'unpaid'`, `payment: {amount, payme_url?, click_url?, manual_note?}` |
| GET | `/api/hashars/:id/payment` | egasi/admin | `{status, amount, payme_url?, click_url?, manual_note?, history:[...]}` |
| POST | `/api/payments/payme` | Basic `Paycom:<KEY>` | JSON-RPC: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement. `account.hashar_id`, summa tiyinda (5000 so'm = 500000). Xato kodlari Payme spetsifikatsiyasi bo'yicha (-32504, -31001, -31003, -31008, -31050..-31099, -31007, -32600/-32601) |
| POST | `/api/payments/click/prepare`, `/api/payments/click/complete` | md5 imzo | form-urlencoded; `merchant_trans_id` = hashar_id; javob Click formatida |
| GET | `/api/admin/payments` | admin | ro'yxat + filtr |
| POST | `/api/admin/hashars/:id/mark-paid` | admin | qo'lda tasdiqlash (`provider='manual'`) |
| GET/POST | `/api/admin/settings` | admin | `{hashar_fee, manual_payment_note}` |

Ro'yxat/xarita/stats/leaderboard/users/:id faqat `paid|waived` hasharlarni ko'rsatadi (egasiga o'zi ko'rinadi). Payme/Click tranzaksiyalari idempotent, summa va hashar holati tekshiriladi, timing-safe solishtirish, Payme 12 soatlik timeout.

APK: to'lov sahifasi tashqi brauzerda (`@capacitor/browser`), qaytgach holat avtomatik tekshiriladi (polling + app resume).

## 4. Qo'shimcha funksiyalar
1. **Saqlanganlar** — hasharni xatchoʻpga qoʻshish (`saves(user_id, hashar_id, created_at)`), Profil → "Saqlanganlar".  `POST/DELETE /api/hashars/:id/save`, `GET /api/me/saves`; DTO'da `saved`.
2. **Bildirishnomalar markazi** — `notifications(id, user_id, type, hashar_id, actor_id, data JSON, read_at, created_at)`. Hodisalar: hasharingizga kimdir qo'shildi, hasharingizga/qo'shilgan hasharingizga izoh, qo'shilgan hasharingiz yakunlandi, to'lov tasdiqlandi, hashar e'lon qilindi. `GET /api/me/notifications?before=`, `GET /api/me/notifications/unread-count`, `POST /api/me/notifications/read {ids?|all}`. Header'da qo'ng'iroqcha + badge, `#/bildirishnomalar` sahifasi; ilova ko'rinib turganda 60 s da bir yangilanadi.
3. **Eslatmalar (APK)** — qo'shilgan hasharlar uchun 1 kun va 2 soat oldin mahalliy bildirishnoma (`@capacitor/local-notifications`), chiqib ketilsa/bekor bo'lsa o'chiriladi; Sozlamalarda yoqish/o'chirish.
4. **QR davomat** — tashkilotchi hashar kuni "Davomat QR" ni ochadi (server imzolagan, ~10 daqiqada yangilanadigan kod); ko'ngilli APK'da skanerlaydi (`@capacitor-mlkit/barcode-scanning`) yoki kodni qo'lda kiritadi → `POST /api/hashars/:id/checkin {code}` → `volunteers.checked_in_at`. Reytingda davomat bonusi (+5). Tashkilotchi kim kelganini ko'radi.
5. **Ulashish kartasi / sertifikat** — yakunlangan hashar uchun canvas'da chiroyli rasm ("Men … hasharida qatnashdim", sana, logo) — yuklab olish/ulashish.
6. **Onboarding** — APK birinchi ochilganda 3 slayd (nima, qanday, boshlash), keyin ko'rsatilmaydi.
