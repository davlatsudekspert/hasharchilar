// Modal steki: Esc (web) va Android "orqaga" tugmasi eng yuqoridagi modalni yopadi.
// Body scroll ham shu yerda bloklanadi.
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

export const modalDepth = () => stack.length;

// Android "orqaga" uchun sahifa ichki holati (wizard qadami, ochiq sheet): fn() true qaytarsa — ishlov berildi
const backStack = [];
/** Eng oxirgi ro'yxatdan o'tgandan boshlab chaqiradi; biri true qaytarsa — true. */
export function runBackHandlers() {
  for (let i = backStack.length - 1; i >= 0; i--) {
    if (backStack[i].fn()) return true;
  }
  return false;
}
/** Qaytadi — ro'yxatdan chiqarish. `fn` ref orqali yangilanishi mumkin (har renderda qayta ro'yxat shart emas). */
export function registerBackHandler(fn) {
  const entry = { fn };
  backStack.push(entry);
  return () => {
    const i = backStack.indexOf(entry);
    if (i !== -1) backStack.splice(i, 1);
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length > 0) {
      e.preventDefault();
      closeTopModal();
    }
  });
}
