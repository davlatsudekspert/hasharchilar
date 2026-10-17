// Ichki sozlamalar (settings jadvali): hozircha faqat davomat kodining imzo kaliti (checkin_secret) —
// worker/checkin.js ishlatadi. API orqali hech qachon qaytarilmaydi.

/**
 * Qiymatni faqat yo'q bo'lsa yozadi va joriy qiymatni o'qiydi — db.batch uchun [INSERT OR IGNORE, SELECT]
 * (parallel so'rovlarda ham hamma bir xil qiymatni oladi).
 */
export const initSettingStmts = (db, key, value) => [
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)').bind(key, String(value)),
  db.prepare('SELECT value FROM settings WHERE key = ?1').bind(key),
];
