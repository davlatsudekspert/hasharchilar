#!/usr/bin/env node
// Android ikonka va splash PNG'larini SVG dan generatsiya qiladi (headless Chromium orqali).
//
// Natija (hammasi commit qilinadi):
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher.png         — eski (kvadrat) ikonka
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png   — dumaloq ikonka
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png — adaptive old qatlam (shaffof)
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_background.png — adaptive fon (gradient)
//   android/app/src/main/res/mipmap-{mdpi..xxxhdpi}/ic_launcher_monochrome.png — Android 13+ mavzuli ikonka
//   public/icon-192.png, public/icon-512.png, public/favicon.svg                — sayt ikonkalari
//   android/app/src/main/res/drawable{,-port-*,-land-*}/splash.png          — splash (gradient + barg + nom)
//   resources/*.svg                                                          — manba SVG'lar
//   resources/play-icon-512.png                                              — Google Play uchun 512x512
// Adaptive fon: mipmap ic_launcher_background.png (gradient); rang zaxirasi values/ic_launcher_background.xml.
//
// Ishga tushirish (hasharchilar/ papkasida). playwright-core package.json'da YO'Q (faqat ikonka
// o'zgarganda kerak), shuning uchun vaqtincha o'rnatiladi:
//   npm i --no-save playwright-core && npx playwright-core install chromium
//   node scripts/gen-android-assets.mjs
// Yoki mavjud nusxalarni ko'rsating:
//   PLAYWRIGHT_CORE=/yo'l/node_modules/playwright-core/index.mjs \
//   CHROMIUM_PATH=/yo'l/chromium node scripts/gen-android-assets.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const OUT_SRC = path.join(ROOT, 'resources');

// Brending (SPEC 2, v3): emerald gradient + oq to'ldirilgan barg (sayt logosi bilan bir xil)
const EMERALD = '#059669';
const EMERALD_LIGHT = '#10b981';
const EMERALD_DARK = '#065f46';
const AMBER = '#fbbf24';
const WHITE = '#ffffff';

// Barg — saytdagi LeafIcon (24 birlikli koordinata): to'ldirilgan shakl + band + tomir
const LEAF_SHAPE = 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z';
const LEAF_STEM = 'M2 21c0-3 1.9-5.5 6-7';
const LEAF_VEIN = 'M9.8 14.2C12.2 11.6 14.6 9.6 17.4 7.6';
const LEAF_CENTER = 11.5; // chegaraviy quti ~ (2..21, 2..21)

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

/**
 * (cx, cy) markazida `size` o'lchamli barg.
 * mono=true — faqat bitta rang (Android 13+ mavzuli ikonka uchun), tomir shaffof kesiladi.
 */
function leaf(cx, cy, size, { color = WHITE, vein = EMERALD, dot = false, mono = false } = {}) {
  const k = size / 24;
  const tx = cx - LEAF_CENTER * k;
  const ty = cy - LEAF_CENTER * k;
  const veinPath = mono
    ? `<path d="${LEAF_VEIN}" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round"/>`
    : `<path d="${LEAF_VEIN}" fill="none" stroke="${vein}" stroke-width="1.5" stroke-linecap="round"/>`;
  const body =
    `<g transform="translate(${tx} ${ty}) scale(${k})">` +
    (mono
      ? `<mask id="m"><rect x="-4" y="-4" width="32" height="32" fill="#fff"/>${veinPath}</mask>` +
        `<path d="${LEAF_SHAPE}" fill="${color}" mask="url(#m)"/>`
      : `<path d="${LEAF_SHAPE}" fill="${color}"/>${veinPath}`) +
    `<path d="${LEAF_STEM}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>` +
    (dot && !mono ? `<circle cx="20.6" cy="3.2" r="2.6" fill="${AMBER}" stroke="${EMERALD_DARK}" stroke-width="0.6"/>` : '') +
    `</g>`;
  return body;
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** Gradient fon (id unikal bo'lishi kerak emas — har SVG alohida chiziladi). */
const gradDefs = (w, h) =>
  `<defs><linearGradient id="g" x1="0" y1="0" x2="${w}" y2="${h}" gradientUnits="userSpaceOnUse">` +
  `<stop offset="0" stop-color="${EMERALD_LIGHT}"/><stop offset="1" stop-color="${EMERALD_DARK}"/></linearGradient>` +
  `<radialGradient id="hl" cx="${w * 0.25}" cy="${h * 0.15}" r="${Math.max(w, h) * 0.7}" gradientUnits="userSpaceOnUse">` +
  `<stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;

// --- SVG shablonlari (o'lcham — 1 birlik = 1 px) ---

/** Eski launcher ikonka: gradient yumaloq kvadrat (48dp dan 2dp chekka) + barg. */
function legacyIcon(s) {
  const inset = (s * 2) / 48;
  const side = s - inset * 2;
  return svg(
    s,
    s,
    gradDefs(s, s) +
      `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.24}" fill="url(#g)"/>` +
      `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.24}" fill="url(#hl)"/>` +
      leaf(s / 2, s / 2, s * 0.56),
  );
}

/** Dumaloq launcher ikonka. */
function roundIcon(s) {
  const r = (s * 22) / 48;
  return svg(
    s,
    s,
    gradDefs(s, s) +
      `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="url(#g)"/><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="url(#hl)"/>` +
      leaf(s / 2, s / 2, s * 0.52),
  );
}

/** Adaptive old qatlam: 108dp, barg 50dp — 66dp xavfsiz doira ichida. */
function adaptiveForeground(s) {
  return svg(s, s, leaf(s / 2, s / 2, (s * 50) / 108));
}

/** Adaptive fon qatlami: gradient (108dp). */
function adaptiveBackground(s) {
  return svg(s, s, gradDefs(s, s) + `<rect width="${s}" height="${s}" fill="url(#g)"/><rect width="${s}" height="${s}" fill="url(#hl)"/>`);
}

/** Android 13+ mavzuli (monoxrom) ikonka. */
function adaptiveMonochrome(s) {
  return svg(s, s, leaf(s / 2, s / 2, (s * 50) / 108, { color: '#000', mono: true }));
}

/** Splash: gradient fon, markazda oq kartochkada barg, ostida nom va shior. */
function splash(w, h, fontCss = '') {
  const m = Math.min(w, h);
  const card = m * 0.26;
  const cx = w / 2;
  const cy = h / 2 - m * 0.06;
  const titleSize = m * 0.07;
  const subSize = m * 0.032;
  return svg(
    w,
    h,
    (fontCss ? `<style>${fontCss}</style>` : '') +
      gradDefs(w, h) +
      `<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#hl)"/>` +
      `<rect x="${cx - card / 2}" y="${cy - card / 2}" width="${card}" height="${card}" rx="${card * 0.28}" fill="#fff" fill-opacity=".14" stroke="#fff" stroke-opacity=".25" stroke-width="${m * 0.003}"/>` +
      leaf(cx, cy, card * 0.62) +
      `<text x="${cx}" y="${cy + card / 2 + titleSize * 1.5}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="800" font-size="${titleSize}" fill="#fff">hashar<tspan fill="${AMBER}">chilar</tspan><tspan fill="#fff" fill-opacity=".6">.uz</tspan></text>` +
      `<text x="${cx}" y="${cy + card / 2 + titleSize * 1.5 + subSize * 2}" text-anchor="middle" font-family="Manrope, sans-serif" font-weight="600" font-size="${subSize}" fill="#ecfdf5" fill-opacity=".85">Birgalikda obod qilamiz</text>`,
  );
}

/** Google Play ikonka: 512x512 to'liq kvadrat (niqobni Play o'zi qo'yadi). */
function playIcon(s) {
  return svg(s, s, gradDefs(s, s) + `<rect width="${s}" height="${s}" fill="url(#g)"/><rect width="${s}" height="${s}" fill="url(#hl)"/>` + leaf(s / 2, s / 2, s * 0.5));
}

/** Sayt ikonkalari (public/icon-*.png, favicon.svg). */
const webIcon = (s) => legacyIcon(s);

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
    await page.evaluate(() => document.fonts.ready);
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
    await render(adaptiveBackground(f), f, f, path.join(dir, 'ic_launcher_background.png'));
    await render(adaptiveMonochrome(f), f, f, path.join(dir, 'ic_launcher_monochrome.png'), true);
  }

  // Splash (Manrope shrifti data: URL sifatida — offline)
  const fontFile = path.join(ROOT, 'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2');
  let fontCss = '';
  try {
    const b64 = (await readFile(fontFile)).toString('base64');
    fontCss = `@font-face{font-family:Manrope;font-weight:200 800;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  } catch {
    console.warn('Manrope topilmadi — tizim shrifti ishlatiladi');
  }
  for (const [dir, [w, h]] of Object.entries(SPLASH)) {
    await render(splash(w, h, fontCss), w, h, path.join(RES, dir, 'splash.png'));
  }

  // Sayt ikonkalari
  await render(webIcon(192), 192, 192, path.join(ROOT, 'public/icon-192.png'), true);
  await render(webIcon(512), 512, 512, path.join(ROOT, 'public/icon-512.png'), true);
  await writeFile(path.join(ROOT, 'public/favicon.svg'), webIcon(64) + '\n');

  // Manba SVG'lar va Play ikonka
  await mkdir(OUT_SRC, { recursive: true });
  await writeFile(path.join(OUT_SRC, 'icon.svg'), legacyIcon(1024) + '\n');
  await writeFile(path.join(OUT_SRC, 'icon-foreground.svg'), adaptiveForeground(1024) + '\n');
  await writeFile(path.join(OUT_SRC, 'splash.svg'), splash(1280, 1920) + '\n');
  await writeFile(path.join(OUT_SRC, 'icon-background.svg'), adaptiveBackground(1024) + '\n');
  await writeFile(path.join(OUT_SRC, 'icon-monochrome.svg'), adaptiveMonochrome(1024) + '\n');
  await render(playIcon(512), 512, 512, path.join(OUT_SRC, 'play-icon-512.png'));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
