-- hasharchilar.uz — v4: hashar e'lon qilish to'lovi (Payme / Click / qo'lda), sozlamalar, saqlanganlar,
-- bildirishnomalar, QR davomat (0005_v4)
-- DIQQAT: DO rejimida production ma'lumotlari ustida (deploy'dan keyin, birinchi so'rovda) qo'llanadi —
-- yangi NOT NULL ustunda DEFAULT bor, ADD COLUMN dagi CHECK esa DEFAULT qiymatni o'tkazadi.
-- Mavjud hasharlar to'langan hisoblanadi (DEFAULT 'paid'); yangilari kod orqali 'unpaid' bilan yoziladi.

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
