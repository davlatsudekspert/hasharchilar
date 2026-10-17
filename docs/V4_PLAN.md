# hasharchilar.uz v4 — reja va shartnoma

> **Eslatma:** 3-bo'lim (hashar e'lon qilish to'lovi: narx, Payme, Click, qo'lda to'lov) Apple App Review Guidelines 2.5.19 (yashirin / masofadan yoqiladigan funksiyalar) asosida kodidan olib tashlangan. Hamma narsa bepul; eski `payment_status` ustuni va `payments` jadvali faqat tarixiy ma'lumot sifatida sxemada qoladi (`migrations/0007_free.sql`).

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

## 3. (olib tashlangan)
Hashar e'lon qilish to'lovi bu yerda rejalashtirilgan edi; funksiya to'liq olib tashlangan (yuqoridagi izohga qarang).

## 4. Qo'shimcha funksiyalar
1. **Saqlanganlar** — hasharni xatchoʻpga qoʻshish (`saves(user_id, hashar_id, created_at)`), Profil → "Saqlanganlar".  `POST/DELETE /api/hashars/:id/save`, `GET /api/me/saves`; DTO'da `saved`.
2. **Bildirishnomalar markazi** — `notifications(id, user_id, type, hashar_id, actor_id, data JSON, read_at, created_at)`. Hodisalar: hasharingizga kimdir qo'shildi, hasharingizga/qo'shilgan hasharingizga izoh, qo'shilgan hasharingiz yakunlandi. `GET /api/me/notifications?before=`, `GET /api/me/notifications/unread-count`, `POST /api/me/notifications/read {ids?|all}`. Header'da qo'ng'iroqcha + badge, `#/bildirishnomalar` sahifasi; ilova ko'rinib turganda 60 s da bir yangilanadi.
3. **Eslatmalar (APK)** — qo'shilgan hasharlar uchun 1 kun va 2 soat oldin mahalliy bildirishnoma (`@capacitor/local-notifications`), chiqib ketilsa/bekor bo'lsa o'chiriladi; Sozlamalarda yoqish/o'chirish.
4. **QR davomat** — tashkilotchi hashar kuni "Davomat QR" ni ochadi (server imzolagan, ~10 daqiqada yangilanadigan kod); ko'ngilli APK'da skanerlaydi (`@capacitor-mlkit/barcode-scanning`) yoki kodni qo'lda kiritadi → `POST /api/hashars/:id/checkin {code}` → `volunteers.checked_in_at`. Reytingda davomat bonusi (+5). Tashkilotchi kim kelganini ko'radi.
5. **Ulashish kartasi / sertifikat** — yakunlangan hashar uchun canvas'da chiroyli rasm ("Men … hasharida qatnashdim", sana, logo) — yuklab olish/ulashish.
6. **Onboarding** — APK birinchi ochilganda 3 slayd (nima, qanday, boshlash), keyin ko'rsatilmaydi.
