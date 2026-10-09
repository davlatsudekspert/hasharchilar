// QR skaner (APK, @capacitor-mlkit/barcode-scanning).
// 1) Google kod skaneri moduli bo'lsa — tayyor tizim oynasi (kamera ruxsati ham shart emas);
// 2) modul yo'q (yoki Google Play xizmatlari yo'q, masalan Huawei) — kamera WebView ortida ochiladi va
//    ustiga o'zimizning ramka chiziladi; modul shu payt fonda o'rnatiladi (keyingi safar uchun).
// Natija: QR matni (rawValue); bekor qilinsa yoki saytda — null. Xato — Error (o'zbekcha matn bilan).
import { IS_NATIVE } from '../lib/config.js';
import { registerModal } from '../lib/modals.js';
import { haptic } from '../lib/native.js';

// Ilova qulfi moduli faqat APK'da kerak — sayt chunk'lariga statik qo'shilmasin (dinamik import)
const lockMod = () => import('../lock/lockStore.js').catch(() => null);
const markExternal = () => lockMod().then((m) => m && m.markExternal());
/** Ilova qulflanganmi — qulflangan holda skan natijasi (check-in) yuborilmaydi. */
const isLocked = () => lockMod().then((m) => !!(m && m.getLockState().locked));

/** Skaner shu qurilmada bormi (sinxron: tugmani ko'rsatish uchun). */
export function scannerSupported() {
  return IS_NATIVE;
}

const DENIED =
  "Kameraga ruxsat berilmadi. Telefon Sozlamalari → Ilovalar → Hasharchilar → Ruxsatlar bo'limida kamerani yoqing yoki kodni qo'lda kiriting.";

const firstValue = (barcodes) => {
  const b = Array.isArray(barcodes) ? barcodes.find((x) => x && (x.rawValue || x.displayValue)) : null;
  return b ? String(b.rawValue || b.displayValue) : null;
};
const isCancel = (err) => /cancel/i.test(String((err && err.message) || err || ''));

let busy = false;

/** QR kodni skanerlaydi. */
export async function scanQr() {
  if (!IS_NATIVE || busy) return null;
  busy = true;
  try {
    const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
    const { supported } = await BarcodeScanner.isSupported().catch(() => ({ supported: true }));
    if (!supported) throw new Error("Qurilmada kamera topilmadi — kodni qo'lda kiriting");
    if (await googleScannerReady(BarcodeScanner)) {
      // Tizim skaneri alohida oyna — qaytishda ilova qulfi darhol so'ramasin
      await markExternal();
      try {
        const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
        if (await isLocked()) return null;
        const v = firstValue(barcodes);
        if (v) haptic('success');
        return v;
      } catch (err) {
        if (isCancel(err)) return null;
        // Modul ishlamadi — o'zimizning skanerga o'tamiz
      }
    }
    return await scanWithOverlay(BarcodeScanner, BarcodeFormat);
  } finally {
    busy = false;
  }
}

/** Google skaner moduli tayyormi; yo'q bo'lsa — fonda o'rnatishni boshlaydi (kutmaydi). */
async function googleScannerReady(BS) {
  let available = false;
  try {
    ({ available } = await BS.isGoogleBarcodeScannerModuleAvailable());
  } catch {
    return false; // Google Play xizmatlari yo'q
  }
  if (!available) BS.installGoogleBarcodeScannerModule().catch(() => {});
  return !!available;
}

// ---------------- Zaxira: kamera WebView ortida + ramka ----------------
const STYLE_ID = 'hs-scan-style';
const CSS = `
html.hs-scanning, html.hs-scanning body { background: transparent !important; }
html.hs-scanning { color-scheme: light !important; }
html.hs-scanning body > *:not(.hs-scan) { visibility: hidden !important; }
.hs-scan { position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column; align-items: center; color: #fff;
  font-family: var(--font-sans, system-ui, sans-serif); padding: calc(var(--sat, 0px) + 20px) 24px calc(var(--sab, 0px) + 28px); }
.hs-scan__frame { position: relative; width: min(72vw, 300px); aspect-ratio: 1; margin: auto 0; border-radius: 28px;
  box-shadow: 0 0 0 100vmax rgb(2 6 23 / 0.62); }
.hs-scan__c { position: absolute; width: 38px; height: 38px; border: 4px solid var(--a-400, #34d399); }
.hs-scan__c--tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-top-left-radius: 28px; }
.hs-scan__c--tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-top-right-radius: 28px; }
.hs-scan__c--bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-bottom-left-radius: 28px; }
.hs-scan__c--br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-bottom-right-radius: 28px; }
.hs-scan__line { position: absolute; left: 10%; right: 10%; top: 12%; height: 3px; border-radius: 3px;
  background: linear-gradient(90deg, transparent, var(--a-400, #34d399), transparent);
  box-shadow: 0 0 16px var(--a-400, #34d399); animation: hs-scan-line 2.2s ease-in-out infinite alternate; }
@keyframes hs-scan-line { to { top: 86%; } }
.hs-scan__title, .hs-scan__hint, .hs-scan__bar { z-index: 1; }
.hs-scan__title { position: relative; font-weight: 800; font-size: 20px; text-align: center; text-shadow: 0 1px 8px rgb(0 0 0 / 0.5); }
.hs-scan__hint { position: relative; margin-top: 6px; font-size: 14px; opacity: 0.85; text-align: center; }
.hs-scan__bar { position: relative; display: flex; gap: 12px; width: 100%; max-width: 360px; }
.hs-scan__btn { flex: 1; height: 52px; border-radius: 18px; border: 1px solid rgb(255 255 255 / 0.28); font-weight: 800; font-size: 15px;
  color: #fff; background: rgb(255 255 255 / 0.14); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  transition: transform 0.15s; }
.hs-scan__btn:active { transform: scale(0.96); }
.hs-scan__btn[aria-pressed="true"] { background: var(--a-500, #10b981); border-color: transparent; }
@media (prefers-reduced-motion: reduce) { .hs-scan__line { animation: none; top: 50%; } }
`;

function mountOverlay({ onCancel, onTorch, torch }) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'hs-scan';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'QR kodni skanerlash');
  el.innerHTML = `
    <div class="hs-scan__title">QR kodni skanerlang</div>
    <div class="hs-scan__hint">Tashkilotchi ekranidagi kodni ramka ichiga to'g'rilang</div>
    <div class="hs-scan__frame" aria-hidden="true">
      <span class="hs-scan__c hs-scan__c--tl"></span><span class="hs-scan__c hs-scan__c--tr"></span>
      <span class="hs-scan__c hs-scan__c--bl"></span><span class="hs-scan__c hs-scan__c--br"></span>
      <span class="hs-scan__line"></span>
    </div>
    <div class="hs-scan__bar">
      ${torch ? '<button type="button" class="hs-scan__btn" data-act="torch" aria-pressed="false">Chiroq</button>' : ''}
      <button type="button" class="hs-scan__btn" data-act="cancel">Bekor qilish</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    haptic('select');
    if (btn.dataset.act === 'cancel') onCancel();
    else if (btn.dataset.act === 'torch') onTorch(btn);
  });
  document.body.appendChild(el);
  document.documentElement.classList.add('hs-scanning');
  return () => {
    document.documentElement.classList.remove('hs-scanning');
    el.remove();
  };
}

async function scanWithOverlay(BS, BarcodeFormat) {
  let perm = await BS.checkPermissions().catch(() => ({ camera: 'prompt' }));
  if (perm.camera !== 'granted' && perm.camera !== 'limited') {
    await markExternal(); // ruxsat oynasi — qulf darhol ishlamasin
    perm = await BS.requestPermissions().catch(() => ({ camera: 'denied' }));
  }
  if (perm.camera !== 'granted' && perm.camera !== 'limited') throw new Error(DENIED);
  const torch = await BS.isTorchAvailable()
    .then((r) => !!r.available)
    .catch(() => false);

  const lock = await lockMod();
  return new Promise((resolve, reject) => {
    const handles = [];
    let done = false;
    let unmount = () => {};
    let offBack = () => {};
    let offLock = () => {};
    const finish = async (value, err) => {
      if (done) return;
      done = true;
      offBack();
      offLock();
      handles.forEach((h) => h && h.remove && h.remove().catch(() => {}));
      await BS.stopScan().catch(() => {});
      unmount();
      if (err) reject(err);
      else resolve(value);
    };
    unmount = mountOverlay({
      torch,
      onCancel: () => finish(null),
      onTorch: async (btn) => {
        await BS.toggleTorch().catch(() => {});
        const on = await BS.isTorchEnabled()
          .then((r) => !!r.enabled)
          .catch(() => false);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      },
    });
    // Android "orqaga" — skanerni yopadi
    offBack = registerModal(() => finish(null));
    // Ilova qulflansa — skaner yopiladi (aks holda u qulf ekranini yashirib, ustida qoladi)
    if (lock) {
      if (lock.getLockState().locked) {
        finish(null);
        return;
      }
      offLock = lock.subscribeLock(() => lock.getLockState().locked && finish(null));
    }
    (async () => {
      try {
        handles.push(
          await BS.addListener('barcodesScanned', (e) => {
            const v = firstValue(e && e.barcodes);
            if (!v || (lock && lock.getLockState().locked)) return;
            haptic('success');
            finish(v);
          }),
        );
        handles.push(await BS.addListener('scanError', () => finish(null, new Error("Skanerlashda xatolik. Kodni qo'lda kiriting."))));
        await BS.startScan({ formats: [BarcodeFormat.QrCode] });
      } catch (err) {
        finish(null, new Error(/denied|permission/i.test(String(err && err.message)) ? DENIED : "Kamerani ochib bo'lmadi. Kodni qo'lda kiriting."));
      }
    })();
  });
}
