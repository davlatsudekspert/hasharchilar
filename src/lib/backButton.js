// Modal steki: Esc (web) va Android "orqaga" tugmasi eng yuqoridagi modalni yopadi.
// Modal yo'q bo'lsa native ilovadan chiqiladi. Body scroll ham shu yerda bloklanadi.
import { IS_NATIVE } from './config.js';
import { closeAdmin, isAdminRoute } from './route.js';

const stack = []; // [{ close: () => void }]

function syncScrollLock() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('modal-open', stack.length > 0);
}

/** Eng yuqoridagi modalni yopadi. Yopilgan bo'lsa true. */
export function closeTopModal() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** Modal ochilganda chaqiriladi; qaytgan funksiya — ro'yxatdan chiqarish. */
export function registerModal(close) {
  const entry = { close };
  stack.push(entry);
  syncScrollLock();
  return () => {
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
    syncScrollLock();
  };
}

/** Berilgan entry eng yuqoridami (focus trap uchun). */
export const modalDepth = () => stack.length;

// Esc — faqat eng yuqoridagi modal yopiladi
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length > 0) {
      e.preventDefault();
      closeTopModal();
    }
  });
}

/** Native'da Android "orqaga" tugmasini ulaydi (web'da hech narsa qilmaydi). */
export async function initBackButton() {
  if (!IS_NATIVE) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      if (closeTopModal()) return;
      // Admin paneldan — saytga, aks holda ilovadan chiqish
      if (isAdminRoute()) closeAdmin();
      else App.exitApp();
    });
  } catch (err) {
    console.warn('backButton', err);
  }
}
