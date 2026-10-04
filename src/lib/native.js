// Native (Capacitor) sozlamalari: status bar rangi va splash ekran.
// Dinamik import — web bundle'ga plaginlar qo'shilmaydi.
import { IS_NATIVE } from './config.js';
import { initBackButton } from './backButton.js';

export async function initNative() {
  if (!IS_NATIVE) return;
  document.documentElement.classList.add('is-native');
  initBackButton();
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); // oq matn
    await StatusBar.setBackgroundColor({ color: '#059669' }).catch(() => {}); // Android 15+ da yo'q
  } catch (err) {
    console.warn('StatusBar', err);
  }
}

let splashHidden = false;
/** Birinchi ma'lumot yuklangach splash ekranni yashiradi. */
export async function hideSplash() {
  if (!IS_NATIVE || splashHidden) return;
  splashHidden = true;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (err) {
    console.warn('SplashScreen', err);
  }
}
