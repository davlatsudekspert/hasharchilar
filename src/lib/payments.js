// Hashar e'lon qilish to'lovi: summa formati, holat yorliqlari va to'lov holatini kuzatish (polling + ilova qaytishi).
import { useEffect, useRef } from 'react';
import { onAppResume } from './native.js';
import { Q } from './queries.js';
import { useApi } from './store.js';

/** 5000 → "5 000 so'm". */
export const formatSom = (n) => `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

export const PAYMENT_STATUS = {
  unpaid: { label: "To'lov kutilmoqda", tone: 'amber' },
  paid: { label: "To'langan", tone: 'brand' },
  waived: { label: "Bepul e'lon qilingan", tone: 'sky' },
};

export const PROVIDER_LABEL = { payme: 'Payme', click: 'Click', manual: "Qo'lda" };
export const TX_STATUS = {
  pending: { label: 'Jarayonda', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300' },
  paid: { label: "To'langan", cls: 'bg-brand-100 text-brand-800 dark:bg-brand-400/15 dark:text-brand-300' },
  cancelled: { label: 'Bekor qilingan', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300' },
  refunded: { label: 'Qaytarilgan', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  unknown: { label: "Noma'lum", cls: 'bg-slate-200 text-slate-700' },
};

/**
 * Hashar to'lov holati: GET /api/hashars/:id/payment. To'lanmagan bo'lsa — ko'rinib turganda har 6 s da,
 * ilova fondan qaytganda / oyna qayta faollashganda darhol qayta tekshiriladi.
 */
export function usePaymentStatus(id, { enabled = true, interval = 6000 } = {}) {
  const q = useApi(...(enabled && id ? Q.payment(id) : [null, null]));
  const unpaid = q.data ? q.data.status === 'unpaid' : enabled;
  const reload = useRef(q.reload);
  reload.current = q.reload;
  useEffect(() => {
    if (!enabled || !id || !unpaid) return undefined;
    const tick = () => document.visibilityState === 'visible' && reload.current();
    const t = setInterval(tick, interval);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    const off = onAppResume(tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      off();
    };
  }, [enabled, id, unpaid, interval]);
  return q;
}
