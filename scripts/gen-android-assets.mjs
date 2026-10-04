#!/usr/bin/env node
// Android ikonka va splash PNG'larini SVG dan generatsiya qiladi (headless Chromium orqali).
//
// Natija (hammasi commit qilinadi):
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher.png         — eski (kvadrat) ikonka
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png   — dumaloq ikonka
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png — adaptive old qatlam (shaffof)
//   android/app/src/main/res/drawable{,-port-*,-land-*}/splash.png          — splash (emerald fon + oq barg)
//   resources/*.svg                                                          — manba SVG'lar
//   resources/play-icon-512.png                                              — Google Play uchun 512x512
// Adaptive fon rangi: android/app/src/main/res/values/ic_launcher_background.xml (#059669).
//
// Ishga tushirish (hasharchilar/ papkasida). playwright-core package.json'da YO'Q (faqat ikonka
// o'zgarganda kerak), shuning uchun vaqtincha o'rnatiladi:
//   npm i --no-save playwright-core && npx playwright-core install chromium
//   node scripts/gen-android-assets.mjs
// Yoki mavjud nusxalarni ko'rsating:
//   PLAYWRIGHT_CORE=/yo'l/node_modules/playwright-core/index.mjs \
//   CHROMIUM_PATH=/yo'l/chromium node scripts/gen-android-assets.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const OUT_SRC = path.join(ROOT, 'resources');

// Brending (SPEC 2)
const EMERALD = '#059669';
const WHITE = '#ffffff';

// Barg — saytdagi favicon/LeafIcon bilan bir xil (24 birlikli koordinata, chiziqli uslub)
const LEAF_PATHS = [
  'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z',
  'M2 21c0-3 1.9-5.5 6-7',
];
const LEAF_CENTER = 11.5; // bargning chegaraviy qutisi ~ (2..21, 2..21)
const LEAF_STROKE = 2.1; // favicon: 4.2 / 2

// Zichliklar: mdpi=1x ... xxxhdpi=4x
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// Splash o'lchamlari (Capacitor shabloni bilan bir xil)
const SPLASH = {
  drawable: [480, 320],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
};

/** (cx, cy) markazida `size` o'lchamli oq barg. */
function leaf(cx, cy, size, color = WHITE) {
  const k = size / 24;
  const tx = cx - LEAF_CENTER * k;
  const ty = cy - LEAF_CENTER * k;
  const paths = LEAF_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return (
    `<g transform="translate(${tx} ${ty}) scale(${k})" fill="none" stroke="${color}" ` +
    `stroke-width="${LEAF_STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
  );
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// --- SVG shablonlari (o'lcham — 1 birlik = 1 px) ---

/** Eski launcher ikonka: emerald yumaloq kvadrat (48dp dan 2dp chekka) + barg. */
function legacyIcon(s) {
  const inset = (s * 2) / 48;
  const side = s - inset * 2;
  return svg(
    s,
    s,
    `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.22}" fill="${EMERALD}"/>` +
      leaf(s / 2, s / 2, s * 0.58),
  );
}

/** Dumaloq launcher ikonka. */
function roundIcon(s) {
  const r = (s * 22) / 48;
  return svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="${EMERALD}"/>` + leaf(s / 2, s / 2, s * 0.55));
}

/** Adaptive old qatlam: 108dp, barg 48dp — 66dp xavfsiz doira ichida (max radius ~29dp). */
function adaptiveForeground(s) {
  return svg(s, s, leaf(s / 2, s / 2, (s * 48) / 108));
}

/** Splash: to'liq emerald fon, markazda kichik barg. */
function splash(w, h) {
  return svg(w, h, `<rect width="${w}" height="${h}" fill="${EMERALD}"/>` + leaf(w / 2, h / 2, Math.min(w, h) * 0.3));
}

/** Google Play ikonka: 512x512 to'liq kvadrat (niqobni Play o'zi qo'yadi). */
function playIcon(s) {
  return svg(s, s, `<rect width="${s}" height="${s}" fill="${EMERALD}"/>` + leaf(s / 2, s / 2, s * 0.5));
}

// --- Chromium ---

async function loadPlaywright() {
  const spec = process.env.PLAYWRIGHT_CORE;
  try {
    const mod = await import(spec ? pathToFileURL(spec).href : 'playwright-core');
    return mod.chromium ?? mod.default?.chromium;
  } catch (err) {
    console.error(
      "playwright-core topilmadi. O'rnating: npm i --no-save playwright-core && npx playwright-core install chromium\n" +
        'yoki PLAYWRIGHT_CORE=/yo\'l/playwright-core/index.mjs bering.',
    );
    throw err;
  }
}

async function main() {
  const chromium = await loadPlaywright();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  /** SVG ni aynan w x h PNG ga chizadi (transparent=true — shaffof fon). */
  async function render(svgText, w, h, file, transparent = false) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}` +
        `svg{display:block}</style></head><body>${svgText}</body></html>`,
    );
    await mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
    console.log('✓', path.relative(ROOT, file), `${w}x${h}`);
  }

  // Launcher ikonkalar
  for (const [name, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${name}`);
    const s = Math.round(48 * k);
    const f = Math.round(108 * k);
    await render(legacyIcon(s), s, s, path.join(dir, 'ic_launcher.png'), true);
    await render(roundIcon(s), s, s, path.join(dir, 'ic_launcher_round.png'), true);
    await render(adaptiveForeground(f), f, f, path.join(dir, 'ic_launcher_foreground.png'), true);
  }

  // Splash
  for (const [dir, [w, h]] of Object.entries(SPLASH)) {
    await render(splash(w, h), w, h, path.join(RES, dir, 'splash.png'));
  }

  // Manba SVG'lar va Play ikonka
  await mkdir(OUT_SRC, { recursive: true });
  await writeFile(path.join(OUT_SRC, 'icon.svg'), legacyIcon(1024) + '\n');
  await writeFile(path.join(OUT_SRC, 'icon-foreground.svg'), adaptiveForeground(1024) + '\n');
  await writeFile(path.join(OUT_SRC, 'splash.svg'), splash(1280, 1920) + '\n');
  await render(playIcon(512), 512, 512, path.join(OUT_SRC, 'play-icon-512.png'));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
