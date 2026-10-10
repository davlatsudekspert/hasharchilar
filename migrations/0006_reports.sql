-- hasharchilar.uz — shikoyatlar (UGC moderatsiya) va foydalanuvchilarni bloklash (0006_reports)
-- Faqat yangi jadvallar va indekslar: DO rejimida production ma'lumotlari ustida ham xavfsiz qo'llanadi.

-- Shikoyatlar. target_id uchun tashqi kalit YO'Q (nishon turi hashar / izoh / foydalanuvchi bo'lishi mumkin);
-- nishon o'chsa kod shikoyatni yopadi (hashar / izoh) yoki o'chiradi (foydalanuvchi). Shikoyatchi o'chsa — kaskad.
-- Bitta foydalanuvchi bitta nishonga bitta shikoyat (takror — mavjudini yangilaydi).
CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('hashar', 'comment', 'user')),
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'sexual', 'child_safety', 'violence', 'fraud', 'other')),
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by INTEGER,                                     -- ko'rib chiqqan administrator (tashqi kalitsiz)
  UNIQUE (reporter_id, target_type, target_id)
);
CREATE INDEX idx_reports_status ON reports(status, id);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);

-- Foydalanuvchi boshqa foydalanuvchini bloklaydi: uning izohlari va hasharlari bloklovchiga ko'rinmaydi
CREATE TABLE user_blocks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);
