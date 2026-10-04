#!/usr/bin/env node
// wrangler.jsonc → wrangler.deploy.json (o'sha papkada, shuning uchun nisbiy yo'llar ishlayveradi).
//
//   node scripts/wrangler-config.mjs --storage d1 --d1-id <uuid>   # D1: database_id yoziladi
//   node scripts/wrangler-config.mjs --storage do                  # Durable Object: d1_databases olib tashlanadi
//   node scripts/wrangler-config.mjs --print name                  # yuqori darajadagi maydonni chiqaradi
//   --config <yo'l>  — boshqa wrangler.jsonc (standart: loyiha ildizidagisi)
//
// Generatsiya qilingan fayl commit qilinmaydi (.gitignore).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * JSONC → JSON matn: satrlardan tashqaridagi // va /* *\/ izohlar hamda oxirgi vergullar olib tashlanadi.
 * Satr ichidagi "https://..." kabi matnga tegilmaydi.
 */
export function stripJsonc(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  // Izoh va bo'shliqlarni o'tkazib, keyingi muhim belgining indeksi
  const skipToSignificant = (from) => {
    let j = from;
    while (j < n) {
      if (/\s/.test(text[j])) j++;
      else if (text[j] === '/' && text[j + 1] === '/') {
        const nl = text.indexOf('\n', j);
        j = nl === -1 ? n : nl + 1;
      } else if (text[j] === '/' && text[j + 1] === '*') {
        const end = text.indexOf('*/', j + 2);
        j = end === -1 ? n : end + 2;
      } else break;
    }
    return j;
  };
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl; // qator ko'chirish saqlanadi
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (ch === ',') {
      const j = skipToSignificant(i + 1);
      if (text[j] !== '}' && text[j] !== ']') out += ch; // oxirgi vergul tashlanadi
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

export function readConfig(path) {
  return JSON.parse(stripJsonc(readFileSync(path, 'utf8')));
}

/** Deploy konfiguratsiyasi: storage = 'd1' (d1Id bilan) yoki 'do'. */
export function buildDeployConfig(cfg, { storage, d1Id }) {
  const out = structuredClone(cfg);
  const doBinding = out.durable_objects?.bindings?.find((b) => b.name === 'HASHAR_DB');
  if (!doBinding) throw new Error("wrangler.jsonc da durable_objects HASHAR_DB binding'i yo'q");
  if (storage === 'd1') {
    if (!UUID_RE.test(d1Id || '')) throw new Error(`--d1-id UUID bo'lishi kerak: '${d1Id ?? ''}'`);
    const db = out.d1_databases?.find((d) => d.binding === 'DB');
    if (!db) throw new Error("wrangler.jsonc da d1_databases DB binding'i yo'q");
    db.database_id = d1Id.toLowerCase();
  } else if (storage === 'do') {
    delete out.d1_databases;
  } else {
    throw new Error(`--storage d1 yoki do bo'lishi kerak: '${storage ?? ''}'`);
  }
  return out;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Noma'lum argument: ${a}`);
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) throw new Error(`${a} uchun qiymat yo'q`);
    args[key] = val;
    i++;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const src = resolve(args.config || join(root, 'wrangler.jsonc'));
  const cfg = readConfig(src);

  if (args.print) {
    const v = cfg[args.print];
    if (v === undefined || typeof v === 'object') throw new Error(`'${args.print}' maydoni topilmadi yoki oddiy qiymat emas`);
    process.stdout.write(`${v}\n`);
    return;
  }

  const out = buildDeployConfig(cfg, { storage: args.storage, d1Id: args['d1-id'] });
  const dest = join(dirname(src), 'wrangler.deploy.json');
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
  const db = args.storage === 'd1' ? `D1 ${out.d1_databases.find((d) => d.binding === 'DB').database_id}` : 'Durable Object HasharDB';
  console.log(`${dest}: Worker=${out.name}, baza=${db}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`wrangler-config: ${err.message}`);
    process.exit(1);
  }
}
