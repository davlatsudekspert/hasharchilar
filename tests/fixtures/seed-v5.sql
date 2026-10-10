-- v5 (0006_reports dan oldingi sxema) namuna ma'lumotlari — FAQAT tests/storage.test.mjs uchun: 0006_reports
-- migratsiyasi to'la bazada sinaladi (joriy seed.sql esa reports / user_blocks jadvallariga ham qator yozishi mumkin).
-- Namuna ma'lumotlar — FAQAT lokal dev uchun (production'ga qo'llanmaydi).
-- Qo'llash: npx wrangler d1 execute hasharchilar --local --file=seed.sql
-- Barcha demo foydalanuvchilar paroli: demo1234. Emaillar soxta (@example.com), tasdiqlangan —
-- telefon yoki email bilan kirish mumkin (masalan: aziz@example.com / demo1234).
-- v4: 1–4-hasharlar e'lon qilingan (to'langan), 5-hashar to'lanmagan (faqat egasi — Jasur — ko'radi);
-- hashar narxi sozlanmagan → standart 5000 so'm.

INSERT OR IGNORE INTO users (id, phone, name, password_hash, bio, district, email, email_verified_at) VALUES
  (1, '+998901112233', 'Aziz Karimov',    'pbkdf2$100000$Lqsxf80VEbI2gU5IXbPRKQ==$Ov3ojYnb5rEmmOR23iWGeU0z+/hqymmdfO6jjUEJE5k=',
      'Mahallamizni toza saqlashni yaxshi ko''raman.', 'Chilonzor', 'aziz@example.com', datetime('now')),
  (2, '+998935556677', 'Malika Yusupova', 'pbkdf2$100000$cBH9qG0lHe/z0GH+K02WHQ==$jqfgnJOYV6kpc0TMIXXEH3Zrh667XndsMuEGDbn7MGk=',
      'Ko''kalamzorlashtirish tashabbuskori.', 'Yunusobod', 'malika@example.com', datetime('now')),
  (3, '+998977778899', 'Jasur Toshmatov', 'pbkdf2$100000$XpNWHjaaM0PWNwFKS13aeA==$z8rKPUtNC14cOKKNQWgM+YXBLWQzBSYr/pa9QZnOJD0=',
      '', 'Mirzo Ulug''bek', 'jasur@example.com', datetime('now'));

INSERT OR IGNORE INTO hashars (id, title, description, address, lat, lng, date_time, items, status, creator_id, completed_at, category, max_volunteers) VALUES
  (1, 'Mahalla bog''ini tozalash',
      'Bog''dagi axlatlarni yig''amiz, skameykalarni tartibga keltiramiz va gullarni sug''oramiz.',
      'Chilonzor tumani, 9-kvartal', 41.2756, 69.2043, '2027-04-11T09:00',
      '["Qo''lqop","Axlat qoplari","Belkurak"]', 'PENDING', 1, NULL, 'cleaning', NULL),
  (2, 'Ko''cha bo''yiga 50 ta ko''chat ekish',
      'Ko''cha bo''ylab yangi daraxtlar ekamiz. Ko''chatlar tayyor, faqat qo''llar kerak.',
      'Yunusobod tumani, 4-mavze', 41.3646, 69.2878, '2027-04-12T08:30',
      '["Ko''chat","Belkurak","Suv"]', 'PENDING', 2, NULL, 'greening', 20),
  (3, 'Bolalar maydonchasini bo''yash',
      'Eski maydonchani yangi ranglar bilan jonlantiramiz.',
      'Mirzo Ulug''bek tumani, Qorasaroy', 41.3392, 69.3341, '2027-04-18T10:00',
      '["Bo''yoq","Cho''tka","Qo''lqop"]', 'PENDING', 3, NULL, 'repair', 10),
  (4, 'Ariq bo''yini tozalash',
      'Ariq atrofi axlatdan tozalanib, ko''kalamzor qilindi.',
      'Sergeli tumani, Yangi Sergeli', 41.2273, 69.2189, '2026-09-27T08:00',
      '["Belkurak","Etik"]', 'COMPLETED', 2, '2026-09-27 12:30:00', 'cleaning', NULL);

-- v4: to'lanmagan (e'lon qilinmagan) namuna hashar
INSERT OR IGNORE INTO hashars (id, title, description, address, lat, lng, date_time, items, status, creator_id, completed_at, category, max_volunteers, payment_status) VALUES
  (5, 'Ko''cha chiroqlarini bo''yash',
      'To''lov kutilmoqda — bu hashar to''lovdan keyin e''lon qilinadi (hozircha faqat egasiga ko''rinadi).',
      'Chilonzor tumani, 12-kvartal', 41.2851, 69.2102, '2027-05-02T09:00',
      '["Bo''yoq","Cho''tka"]', 'PENDING', 3, NULL, 'repair', NULL, 'unpaid');

-- Demo rasmlar R2 da emas, statik fayl sifatida (public/demo/) beriladi
INSERT OR IGNORE INTO hashar_media (id, hashar_id, photo_type, r2_key, r2_url) VALUES
  (1, 4, 'BEFORE', 'demo/before.svg', '/demo/before.svg'),
  (2, 4, 'AFTER',  'demo/after.svg',  '/demo/after.svg');

-- Tashkilotchi har doim o'z hasharining qatnashuvchisi; 4-hasharda ikki ko'ngilli QR davomatdan o'tgan
INSERT OR IGNORE INTO volunteers (hashar_id, user_id, checked_in_at) VALUES
  (1, 1, NULL), (1, 2, NULL),
  (2, 2, NULL), (2, 1, NULL), (2, 3, NULL),
  (3, 3, NULL),
  (4, 2, NULL), (4, 1, '2026-09-27 03:05:00'), (4, 3, '2026-09-27 03:12:00'),
  (5, 3, NULL);

-- Izohlar
INSERT OR IGNORE INTO comments (id, hashar_id, user_id, body) VALUES
  (1, 1, 2, 'Men ham boraman! Qo''lqop olib kelaman.'),
  (2, 1, 1, 'Rahmat! Soat 9:00 da bog'' kirish qismida uchrashamiz.'),
  (3, 2, 3, 'Ko''chatlar qaysi navda? Suv uchun chelak kerakmi?'),
  (4, 4, 1, 'Zo''r natija bo''ldi, hammaga rahmat!');

-- v4: qo'lda to'lov izohi (namuna; haqiqiy karta raqami emas)
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('manual_payment_note', 'Namuna (lokal dev): qo''lda to''lov uchun administrator bilan bog''laning.');

-- v4: saqlanganlar
INSERT OR IGNORE INTO saves (user_id, hashar_id) VALUES (1, 2), (1, 3), (3, 1);

-- v4: bildirishnomalar (Aziz uchun ikkitasi o'qilmagan)
INSERT OR IGNORE INTO notifications (id, user_id, type, hashar_id, actor_id, data, read_at) VALUES
  (1, 1, 'join', 1, 2, '{"title":"Mahalla bog''ini tozalash"}', NULL),
  (2, 1, 'comment', 1, 2, '{"title":"Mahalla bog''ini tozalash","comment_id":1,"excerpt":"Men ham boraman! Qo''lqop olib kelaman."}', NULL),
  (3, 1, 'completed', 4, 2, '{"title":"Ariq bo''yini tozalash"}', datetime('now')),
  (4, 2, 'comment', 2, 3, '{"title":"Ko''cha bo''yiga 50 ta ko''chat ekish","comment_id":3,"excerpt":"Ko''chatlar qaysi navda?"}', NULL);

-- v4: namuna to'lov (qo'lda tasdiqlangan, 5000 so'm = 500000 tiyin)
INSERT OR IGNORE INTO payments (id, hashar_id, user_id, provider, amount, state, provider_tx_id, create_time, perform_time, note) VALUES
  (1, 3, 3, 'manual', 500000, 1, 'manual:seed-demo-1', 1790000000000, 1790000000000, 'Namuna to''lov');
