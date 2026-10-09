// Joriy vaqt manbai (to'lov timeout'lari, QR davomat oynalari).
// Testlar uchun (FAQAT EMAIL_MOCK=1 bo'lganda): `x-test-now` sarlavhasi (unix ms) bilan vaqtni siljitish mumkin —
// masalan, Payme 12 soatlik timeout yoki davomat kodining keyingi 10 daqiqalik oynasi. Production'da e'tiborsiz.
import { isEmailMock } from './email.js';

const TEST_NOW_RE = /^\d{12,14}$/;

/** Joriy vaqt (unix millisekund). */
export function nowMs(c) {
  if (isEmailMock(c.env)) {
    const raw = (c.req.header('x-test-now') || '').trim();
    if (TEST_NOW_RE.test(raw)) return Number(raw);
  }
  return Date.now();
}

/** unix ms → SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) — datetime('now') bilan bir xil ko'rinish. */
export const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/** unix ms → ISO yoki null (0 / null — vaqt yo'q). */
export const msToIso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);
