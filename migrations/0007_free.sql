-- hasharchilar.uz — hamma narsa bepul (0007_free): e'lon qilish to'lovi olib tashlandi.
-- Eski to'lanmagan hasharlardan sanasi hali kelmaganlari e'lon qilinadi; o'tib ketganlari yashirin qoladi.
-- Faqat ma'lumot yangilanadi: payment_status ustuni va payments jadvali (eski ma'lumotlar uchun) o'zgarmaydi,
-- yangi hasharlar doim 'paid' (DEFAULT) bilan yoziladi.
UPDATE hashars SET payment_status = 'paid' WHERE payment_status = 'unpaid' AND date_time >= date('now');
