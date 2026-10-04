-- hasharchilar.uz — email bilan ro'yxatdan o'tish va bir martalik kodlar (OTP) (0004_email)
-- DIQQAT: DO rejimida production ma'lumotlari ustida (deploy'dan keyin, birinchi so'rovda) qo'llanadi.
-- users jadvali QAYTA QURILMAYDI (phone NOT NULL qoladi): faqat ADD COLUMN, indeks va yangi jadval.

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
