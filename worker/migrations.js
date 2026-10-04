// Durable Object rejimi uchun migratsiyalar: migrations/*.sql matn moduli sifatida bundle'ga kiradi
// (wrangler.jsonc → rules: **/*.sql = Text). D1 rejimida esa `wrangler d1 migrations apply` ishlatiladi.
// Yangi migrations/NNNN_*.sql qo'shilsa — shu ro'yxatga ham qo'shing (tests/storage.test.mjs tekshiradi).
// DIQQAT: DO rejimida migratsiya deploy'dan KEYIN, birinchi so'rovda production ma'lumotlari ustida
// qo'llanadi. U to'la jadvallarda ham ishlashi shart (masalan, NOT NULL ustunga DEFAULT kerak) — aks holda
// barcha baza so'rovlari 500 qaytaradi. `npm run test:storage` uni namuna ma'lumotli bazada sinaydi.
import m0001 from '../migrations/0001_init.sql';
import m0002 from '../migrations/0002_admin.sql';
import m0003 from '../migrations/0003_v3.sql';

/** Tartib muhim: nomi bo'yicha o'sish (D1 dagi kabi). */
export const MIGRATIONS = [
  { name: '0001_init.sql', sql: m0001 },
  { name: '0002_admin.sql', sql: m0002 },
  { name: '0003_v3.sql', sql: m0003 },
];
