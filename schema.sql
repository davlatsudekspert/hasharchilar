-- hasharchilar.uz — Cloudflare D1 sxemasi: migrations/*.sql birlashtirilgani (0001_init + 0002_admin + 0003_v3 + 0004_email + 0005_v4)
-- Qo'llash: npx wrangler d1 migrations apply hasharchilar --local | --remote
-- Eslatma: D1 tashqi kalitlarni (FOREIGN KEY) standart holatda tekshiradi;
-- LIKE/GLOB shablonlari 50 baytdan oshmasligi kerak (D1 limiti).

-- Foydalanuvchilar (telefon + parol bilan kirish)
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT NOT NULL UNIQUE,                  -- +998XXXXXXXXX
  email         TEXT,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                         -- pbkdf2$100000$<salt_b64>$<hash_b64>
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessiyalar: DB da faqat tokenning SHA-256 xeshi saqlanadi
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL                             -- datetime('now', '+90 days')
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Hasharlar (tadbirlar)
CREATE TABLE hashars (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  description  TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  address      TEXT NOT NULL DEFAULT '' CHECK (length(address) <= 200),
  lat          REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  date_time    TEXT NOT NULL                           -- 'YYYY-MM-DDTHH:MM' (Toshkent vaqti)
               CHECK (length(date_time) = 16 AND date_time GLOB '????-??-??T??:??'),
  items        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(items)),  -- JSON massiv
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  creator_id   INTEGER NOT NULL REFERENCES users(id),
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  -- Yakunlangan hasharda completed_at bo'lishi shart (va aksincha)
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX idx_hashars_status_date ON hashars(status, date_time);
CREATE INDEX idx_hashars_creator ON hashars(creator_id);

-- Rasmlar (R2 dagi fayllarga havola): oldin / keyin
CREATE TABLE hashar_media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hashar_id  INTEGER NOT NULL REFERENCES hashars(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('BEFORE', 'AFTER')),
  r2_key     TEXT NOT NULL,                            -- before/<uuid>.jpg
  r2_url     TEXT NOT NULL,                            -- /api/media/<r2_key>
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_hashar ON hashar_media(hashar_id);

-- Qatnashuvchilar: bir foydalanuvchi bitta hasharga bir marta qo'shiladi
CREATE TABLE volunteers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  hashar_id INTEGER NOT NULL REFERENCES hashars(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (hashar_id, user_id)
);
CREATE INDEX idx_volunteers_user ON volunteers(user_id);

-- Rate limit hisoblagichlari (fixed window)
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,                       -- masalan: auth:<ip>, create:<user_id>
  window_start INTEGER NOT NULL,                       -- unix soniya (oyna boshi)
  count        INTEGER NOT NULL
);

-- hasharchilar.uz — admin panel (0002_admin)
-- DIQQAT: DO rejimida production ma'lumotlari ustida qo'llanadi — yangi ustunlar mavjud qatorlarda
-- ham ishlashi shart (NOT NULL → DEFAULT bilan).

-- Rol: oddiy foydalanuvchi yoki administrator (ADMIN_PHONES secret'idagi raqamlar ham admin hisoblanadi)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Bloklangan vaqt (UTC, datetime('now')); NULL — bloklanmagan
ALTER TABLE users ADD COLUMN blocked_at TEXT;

-- hasharchilar.uz — v3: kategoriyalar, joy cheklovi, profil, izohlar, geo kesh (0003_v3)
-- DIQQAT: DO rejimida production ma'lumotlari ustida (deploy'dan keyin, birinchi so'rovda) qo'llanadi —
-- yangi NOT NULL ustunlarda DEFAULT bor, ADD COLUMN dagi CHECK esa DEFAULT qiymatni o'tkazadi.

-- Hashar turi: tozalash / ko'kalamzorlashtirish / ta'mirlash / boshqa
ALTER TABLE hashars ADD COLUMN category TEXT NOT NULL DEFAULT 'cleaning'
  CHECK (category IN ('cleaning', 'greening', 'repair', 'other'));

-- Ko'ngillilar soni chegarasi (tashkilotchi ham hisobga kiradi); NULL — cheklanmagan
ALTER TABLE hashars ADD COLUMN max_volunteers INTEGER
  CHECK (max_volunteers IS NULL OR max_volunteers BETWEEN 2 AND 1000);

-- Ommaviy profil
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 300);
ALTER TABLE users ADD COLUMN district TEXT NOT NULL DEFAULT '' CHECK (length(district) <= 60);
ALTER TABLE users ADD COLUMN avatar_key TEXT;                -- R2: avatars/<uuid>.<ext>

-- Izohlar (hashar yoki foydalanuvchi o'chsa — izohlari ham)
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hashar_id  INTEGER NOT NULL REFERENCES hashars(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_hashar ON comments(hashar_id, id);
CREATE INDEX idx_comments_user ON comments(user_id);

-- Nominatim javoblari keshi (30 kun): key = s:<qidiruv> yoki r:<lat>,<lng>
CREATE TABLE geo_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                                -- JSON (mijozga beriladigan shakl)
  created_at INTEGER NOT NULL                              -- unix soniya
);
CREATE INDEX idx_geo_cache_created ON geo_cache(created_at);

-- ---------- 0004_email: email bilan ro'yxat va bir martalik kodlar ----------

-- users.email 0001 dan beri bor, lekin kod uni hech qachon yozmagan (production'da hammasi NULL).
-- Shunday bo'lsa ham UNIQUE indeks har qanday ma'lumotda yaratilsin: qiymatlar normallashtiriladi
-- (trim + kichik harf), bo'shlari NULL, takrorlanganlari (eng kichik id dan tashqari) NULL.
UPDATE users SET email = NULLIF(lower(trim(email)), '') WHERE email IS NOT NULL;
UPDATE users SET email = NULL
  WHERE email IS NOT NULL
    AND id NOT IN (SELECT MIN(id) FROM users WHERE email IS NOT NULL GROUP BY email);

-- Email tasdiqlangan vaqt (UTC, datetime('now')); NULL — tasdiqlanmagan (eski hisoblar)
ALTER TABLE users ADD COLUMN email_verified_at TEXT;

-- Bitta email — bitta hisob (emaillar trim + kichik harf bilan saqlanadi); NULL lar cheklanmaydi
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Bir martalik kodlar: kodning o'zi emas, sha256(purpose|email|code) saqlanadi.
--   register — ro'yxat (payload: {name, phone, password_hash}, user_id NULL)
--   reset    — parolni tiklash (user_id — hisob egasi)
--   verify   — tizimga kirgan foydalanuvchi emailini qo'shish/tasdiqlash (user_id — o'sha foydalanuvchi)
-- Yangi kod shu email+maqsad uchun eskilarini bekor qiladi (consumed_at qo'yiladi).
CREATE TABLE email_otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('register', 'reset', 'verify')),
  user_id     INTEGER,
  code_hash   TEXT NOT NULL,                                -- sha256 hex
  payload     TEXT,                                         -- JSON (faqat register), ishlatilgach NULL
  attempts    INTEGER NOT NULL DEFAULT 0,                   -- noto'g'ri urinishlar (5 tadan keyin kod o'ladi)
  expires_at  INTEGER NOT NULL,                             -- unix soniya
  created_at  INTEGER NOT NULL,                             -- unix soniya
  consumed_at INTEGER                                       -- ishlatilgan yoki bekor qilingan vaqt
);
CREATE INDEX idx_email_otps_lookup ON email_otps(email, purpose, created_at);
CREATE INDEX idx_email_otps_user ON email_otps(user_id) WHERE user_id IS NOT NULL;

-- ---------- 0005_v4: hashar e'lon qilish to'lovi, sozlamalar, saqlanganlar, bildirishnomalar, QR davomat ----------
-- Mavjud hasharlar to'langan hisoblanadi (DEFAULT 'paid'); yangilari narx > 0 bo'lsa 'unpaid' bilan yoziladi.

-- To'lov holati: unpaid — ommaga ko'rinmaydi (faqat egasi va admin), paid — to'langan, waived — admin bepul e'lon qilgan
ALTER TABLE hashars ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid'
  CHECK (payment_status IN ('unpaid', 'paid', 'waived'));

-- Egasining to'lanmagan hasharlari (limit) va admin filtri uchun
CREATE INDEX idx_hashars_unpaid ON hashars(creator_id) WHERE payment_status = 'unpaid';

-- QR davomat: ko'ngilli hashar joyida kodni skanerlagan vaqt (UTC, 'YYYY-MM-DD HH:MM:SS'); NULL — kelmagan
ALTER TABLE volunteers ADD COLUMN checked_in_at TEXT;

-- To'lovlar. Tashqi kalit YO'Q: hashar yoki foydalanuvchi o'chsa ham moliyaviy tarix saqlanadi.
--   payme:  state 1 — yaratilgan, 2 — bajarilgan, -1 — bajarilmasdan bekor, -2 — bajarilgandan keyin bekor
--   click:  state 0 — prepare, 1 — complete (to'langan), -1 — bekor qilingan
--   manual: state 1 — admin tasdiqlagan
-- Vaqtlar (create/perform/cancel/provider_time) — unix millisekund (Payme formati).
CREATE TABLE payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  hashar_id      INTEGER NOT NULL,
  user_id        INTEGER,                                  -- to'lovchi (hashar egasi)
  provider       TEXT NOT NULL CHECK (provider IN ('payme', 'click', 'manual')),
  amount         INTEGER NOT NULL CHECK (amount >= 0),     -- tiyin (1 so'm = 100 tiyin)
  state          INTEGER NOT NULL,
  provider_tx_id TEXT,                                     -- Payme params.id / Click click_trans_id / manual:<uuid>
  provider_time  INTEGER,                                  -- Payme params.time (GetStatement shu bo'yicha)
  create_time    INTEGER,
  perform_time   INTEGER,
  cancel_time    INTEGER,
  reason         INTEGER,                                  -- Payme bekor qilish sababi
  note           TEXT CHECK (note IS NULL OR length(note) <= 500),
  admin_id       INTEGER,                                  -- qo'lda tasdiqlagan administrator
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_tx_id)
);
CREATE INDEX idx_payments_hashar ON payments(hashar_id, provider, state);
CREATE INDEX idx_payments_statement ON payments(provider, provider_time);

-- Admin sozlamalari (hashar_fee — so'm, manual_payment_note) va ichki qiymatlar (checkin_secret)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Saqlanganlar (xatcho'p)
CREATE TABLE saves (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hashar_id  INTEGER NOT NULL REFERENCES hashars(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, hashar_id)
);
CREATE INDEX idx_saves_hashar ON saves(hashar_id);
CREATE INDEX idx_saves_user_created ON saves(user_id, created_at);

-- Bildirishnomalar: type — join, comment, completed, payment_confirmed, payment_cancelled, published.
-- hashar_id / actor_id tashqi kalitsiz (hashar o'chirilganda kod o'zi tozalaydi); data — JSON (sarlavha nusxasi va h.k.)
CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 32),
  hashar_id  INTEGER,
  actor_id   INTEGER,
  data       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_hashar ON notifications(hashar_id);
CREATE INDEX idx_notifications_actor ON notifications(actor_id);
