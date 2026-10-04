-- hasharchilar.uz — admin panel (0002_admin)
-- DIQQAT: DO rejimida production ma'lumotlari ustida qo'llanadi — yangi ustunlar mavjud qatorlarda
-- ham ishlashi shart (NOT NULL → DEFAULT bilan).

-- Rol: oddiy foydalanuvchi yoki administrator (ADMIN_PHONES secret'idagi raqamlar ham admin hisoblanadi)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Bloklangan vaqt (UTC, datetime('now')); NULL — bloklanmagan
ALTER TABLE users ADD COLUMN blocked_at TEXT;
