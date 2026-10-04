// SQL matnini alohida so'rovlarga ajratadi (Durable Object migratsiyalari uchun).
// Oddiy split(';') emas: tirnoq/qo'shtirnoq ichidagi va izohdagi (-- , /* */) ';' hisobga olinmaydi,
// CREATE TRIGGER ... BEGIN ... END bitta so'rov bo'lib qoladi.

const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_$]/;
const SPACE = /\s/;

/** CREATE [TEMP|TEMPORARY] TRIGGER bilan boshlanadimi (birinchi so'zlar bo'yicha). */
function isTrigger(words) {
  if (words[0] !== 'CREATE') return false;
  if (words[1] === 'TRIGGER') return true;
  return (words[1] === 'TEMP' || words[1] === 'TEMPORARY') && words[2] === 'TRIGGER';
}

/** SQL matn → bo'sh bo'lmagan so'rovlar ro'yxati (oxiridagi ';' siz, faqat izohdan iborat qismlar tashlanadi). */
export function splitSql(text) {
  const src = String(text ?? '');
  const n = src.length;
  const out = [];
  let start = 0; // joriy so'rov boshi
  let hasCode = false; // joriy so'rovda izohdan tashqari kod bormi
  let words = []; // joriy so'rovning birinchi so'zlari (trigger aniqlash uchun)
  let trigger = false;
  let depth = 0; // trigger ichida BEGIN/CASE … END chuqurligi

  const finish = (end) => {
    if (hasCode) out.push(src.slice(start, end).trim());
    start = end + 1;
    hasCode = false;
    words = [];
    trigger = false;
    depth = 0;
  };

  let i = 0;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // Qator izohi: -- ... \n
    if (ch === '-' && next === '-') {
      const nl = src.indexOf('\n', i + 2);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    // Blok izohi: /* ... */
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // Satr / identifikator: '...' "..." `...` [...]; '' va "" — ichidagi ekranlangan tirnoq
    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let j = i + 1;
      while (j < n) {
        if (src[j] === close) {
          if (close !== ']' && src[j + 1] === close) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      hasCode = true;
      i = j + 1;
      continue;
    }
    if (ch === ';') {
      if (depth === 0) finish(i);
      i++;
      continue;
    }
    if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(src[j])) j++;
      const w = src.slice(i, j).toUpperCase();
      hasCode = true;
      if (words.length < 3) {
        words.push(w);
        trigger = isTrigger(words);
      }
      if (trigger) {
        if (w === 'BEGIN' || w === 'CASE') depth++;
        else if (w === 'END' && depth > 0) depth--;
      }
      i = j;
      continue;
    }
    if (!SPACE.test(ch)) hasCode = true;
    i++;
  }
  finish(n);
  return out;
}
