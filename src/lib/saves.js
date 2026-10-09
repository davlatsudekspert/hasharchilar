// Saqlanganlar (xatcho'p): optimistik almashtirish — barcha keshdagi ro'yxatlarda belgi darhol o'zgaradi,
// server xato qaytarsa orqaga qaytariladi.
import { useCallback, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { useActions } from './actions.jsx';
import { api } from './api.js';
import { haptic } from './native.js';
import { invalidate, updateCached } from './store.js';

/** Keshdagi qiymatda (ro'yxat, bitta hashar yoki {hashars: [...]}) shu hasharning `saved` belgisini o'zgartiradi. */
function patch(data, id, saved) {
  const one = (h) => (h && typeof h === 'object' && h.id === id && h.saved !== saved ? { ...h, saved } : h);
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((h) => {
      const n = one(h);
      if (n !== h) changed = true;
      return n;
    });
    return changed ? next : data;
  }
  if (data && typeof data === 'object') {
    if (data.id === id && 'title' in data) return one(data);
    if (Array.isArray(data.hashars)) {
      const hs = patch(data.hashars, id, saved);
      return hs !== data.hashars ? { ...data, hashars: hs } : data;
    }
  }
  return data;
}

function applyEverywhere(id, saved) {
  updateCached('', (d, key) => {
    if (key === 'me:saves' && Array.isArray(d) && !saved) return d.filter((h) => h.id !== id);
    return patch(d, id, saved);
  });
}

/** `toggle(h)` → yangi holat (yoki null — bekor/xato); `busy` — so'rov ketayotgan hashar ID si. */
export function useSaveToggle() {
  const { requireAuth } = useActions();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const toggle = useCallback(
    async (h) => {
      if (!(await requireAuth('save'))) return null;
      const next = !h.saved;
      haptic(next ? 'success' : 'light');
      applyEverywhere(h.id, next);
      setBusy(h.id);
      try {
        await (next ? api.save(h.id) : api.unsave(h.id));
        invalidate('me:saves');
        toast(next ? "Saqlanganlarga qo'shildi" : 'Saqlanganlardan olindi', next ? 'success' : 'info');
        return next;
      } catch (e) {
        applyEverywhere(h.id, !next);
        toast(e.status === 404 ? "Saqlash hozircha ishlamaydi" : e.message, 'error');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [requireAuth, toast],
  );
  return { toggle, busy };
}
