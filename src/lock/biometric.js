// Barmoq izi / yuz orqali tasdiqlash (@capgo/capacitor-native-biometric). Faqat APK.
import { IS_NATIVE } from '../lib/config.js';
import { setBioBusy } from './lockStore.js';

// Plagin proksisi async funksiyadan qaytarilmaydi (.then() muammosi) — modul qaytariladi
const bioMod = () => import('@capgo/capacitor-native-biometric');

// BiometryType: 1 TOUCH_ID, 2 FACE_ID, 3 FINGERPRINT, 4 FACE, 5 IRIS, 6 MULTIPLE
const LABELS = { 2: 'Yuz orqali', 4: 'Yuz orqali', 5: "Ko'z orqali", 6: 'Barmoq izi yoki yuz' };

/**
 * Qurilmada biometrika bormi.
 * Natija: { available, label, reason } — reason: 'none' (sensor yo'q) | 'not_enrolled' (sozlanmagan) | null.
 */
export async function biometricInfo() {
  if (!IS_NATIVE) return { available: false, label: 'Barmoq izi', reason: 'none' };
  try {
    const r = await (await bioMod()).NativeBiometric.isAvailable({ useFallback: false });
    const label = LABELS[r.biometryType] || 'Barmoq izi';
    if (r.isAvailable) return { available: true, label, reason: null };
    return { available: false, label, reason: Number(r.errorCode) === 3 ? 'not_enrolled' : 'none' };
  } catch {
    return { available: false, label: 'Barmoq izi', reason: 'none' };
  }
}

/**
 * Biometrik oynani ochadi. Natija: 'ok' | 'cancel' | 'lockout' | 'fail'.
 * Oyna ilovani pauza qiladi — shu vaqtda qulf hayot sikli e'tiborsiz qoldiriladi.
 */
export async function verifyBiometric({ subtitle = 'Ilovani ochish', description } = {}) {
  if (!IS_NATIVE) return 'fail';
  setBioBusy(true);
  try {
    await (await bioMod()).NativeBiometric.verifyIdentity({
      title: 'Hasharchilar',
      subtitle,
      description: description || "Davom etish uchun barmoq izingizni qo'ying",
      negativeButtonText: 'PIN kod',
      maxAttempts: 5,
    });
    return 'ok';
  } catch (err) {
    const code = Number(err && err.code);
    // 2/4 — bloklangan (ko'p xato), 15/16 — bekor qilindi (tizim / foydalanuvchi)
    if (code === 2 || code === 4) return 'lockout';
    if (code === 15 || code === 16 || /cancel/i.test(String(err && err.message))) return 'cancel';
    return 'fail';
  } finally {
    setBioBusy(false);
  }
}
