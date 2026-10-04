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

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length > 0) {
      e.preventDefault();
      closeTopModal();
    }
  });
}
