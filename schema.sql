-- hasharchilar.uz — Cloudflare D1 sxemasi: migrations/*.sql birlashtirilgani (0001_init + 0002_admin)
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
