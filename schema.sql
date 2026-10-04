-- hasharchilar.uz — Cloudflare D1 sxemasi: migrations/*.sql birlashtirilgani (0001_init + 0002_admin + 0003_v3 + 0004_email)
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
