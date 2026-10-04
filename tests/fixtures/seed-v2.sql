-- v2 (0003 dan oldingi sxema) namuna ma'lumotlari — FAQAT tests/storage.test.mjs uchun: 0003_v3 migratsiyasi to'la bazada sinaladi.
-- Qo'llash: npx wrangler d1 execute hasharchilar --local --file=seed.sql
-- Barcha demo foydalanuvchilar paroli: demo1234

INSERT OR IGNORE INTO users (id, phone, name, password_hash) VALUES
  (1, '+998901112233', 'Aziz Karimov',    'pbkdf2$100000$Lqsxf80VEbI2gU5IXbPRKQ==$Ov3ojYnb5rEmmOR23iWGeU0z+/hqymmdfO6jjUEJE5k='),
  (2, '+998935556677', 'Malika Yusupova', 'pbkdf2$100000$cBH9qG0lHe/z0GH+K02WHQ==$jqfgnJOYV6kpc0TMIXXEH3Zrh667XndsMuEGDbn7MGk='),
  (3, '+998977778899', 'Jasur Toshmatov', 'pbkdf2$100000$XpNWHjaaM0PWNwFKS13aeA==$z8rKPUtNC14cOKKNQWgM+YXBLWQzBSYr/pa9QZnOJD0=');

INSERT OR IGNORE INTO hashars (id, title, description, address, lat, lng, date_time, items, status, creator_id, completed_at) VALUES
  (1, 'Mahalla bog''ini tozalash',
      'Bog''dagi axlatlarni yig''amiz, skameykalarni tartibga keltiramiz va gullarni sug''oramiz.',
      'Chilonzor tumani, 9-kvartal', 41.2756, 69.2043, '2027-04-11T09:00',
      '["Qo''lqop","Axlat qoplari","Belkurak"]', 'PENDING', 1, NULL),
  (2, 'Ko''cha bo''yiga 50 ta ko''chat ekish',
      'Ko''cha bo''ylab yangi daraxtlar ekamiz. Ko''chatlar tayyor, faqat qo''llar kerak.',
      'Yunusobod tumani, 4-mavze', 41.3646, 69.2878, '2027-04-12T08:30',
      '["Ko''chat","Belkurak","Suv"]', 'PENDING', 2, NULL),
  (3, 'Bolalar maydonchasini bo''yash',
      'Eski maydonchani yangi ranglar bilan jonlantiramiz.',
      'Mirzo Ulug''bek tumani, Qorasaroy', 41.3392, 69.3341, '2027-04-18T10:00',
      '["Bo''yoq","Cho''tka","Qo''lqop"]', 'PENDING', 3, NULL),
  (4, 'Ariq bo''yini tozalash',
      'Ariq atrofi axlatdan tozalanib, ko''kalamzor qilindi.',
      'Sergeli tumani, Yangi Sergeli', 41.2273, 69.2189, '2026-09-27T08:00',
      '["Belkurak","Etik"]', 'COMPLETED', 2, '2026-09-27 12:30:00');

-- Demo rasmlar R2 da emas, statik fayl sifatida (public/demo/) beriladi
INSERT OR IGNORE INTO hashar_media (id, hashar_id, photo_type, r2_key, r2_url) VALUES
  (1, 4, 'BEFORE', 'demo/before.svg', '/demo/before.svg'),
  (2, 4, 'AFTER',  'demo/after.svg',  '/demo/after.svg');

-- Tashkilotchi har doim o'z hasharining qatnashuvchisi
INSERT OR IGNORE INTO volunteers (hashar_id, user_id) VALUES
  (1, 1), (1, 2),
  (2, 2), (2, 1), (2, 3),
  (3, 3),
  (4, 2), (4, 1), (4, 3);
