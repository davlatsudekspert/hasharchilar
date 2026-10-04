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
