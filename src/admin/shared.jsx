// Admin panel uchun umumiy bo'laklar: sahifalangan ro'yxat hook'i, qidiruv, tasdiqlash oynasi, badge'lar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, SearchIcon, XIcon } from '../components/icons.jsx';
import Modal from '../components/Modal.jsx';
import { btn, Spinner } from '../components/ui.jsx';
import { cx } from '../lib/utils.js';

export const PAGE_SIZE = 20;

/**
 * Sahifalangan ro'yxat: fetcher({offset, limit}) → {items, total}.
 * `deps` o'zgarsa boshidan yuklanadi; loadMore() keyingi sahifani qo'shadi.
 */
export function usePagedList(fetcher, deps) {
  const [state, setState] = useState({ items: [], total: 0, loading: true, more: false, error: '' });
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const countRef = useRef(0);
  countRef.current = state.items.length;

  const load = useCallback(async (offset) => {
    const my = ++seq.current; // faqat eng so'nggi so'rov natijasi qo'llanadi
    setState((s) => ({ ...s, error: '', loading: offset === 0, more: offset > 0 }));
    try {
      const data = await fetchRef.current({ offset, limit: PAGE_SIZE });
      if (my !== seq.current) return;
      setState((s) => ({
        items: offset === 0 ? data.items : [...s.items, ...data.items.filter((x) => !s.items.some((y) => y.id === x.id))],
        total: data.total,
        loading: false,
        more: false,
        error: '',
      }));
    } catch (e) {
      if (my === seq.current) setState((s) => ({ ...s, loading: false, more: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    load(0);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => load(0), [load]);
  const loadMore = useCallback(() => load(countRef.current), [load]);
  /** Lokal yangilash: bitta element almashtiriladi yoki (null bo'lsa) olib tashlanadi. */
  const patch = useCallback((id, next) => {
    setState((s) => ({
      ...s,
      items: next ? s.items.map((x) => (x.id === id ? next : x)) : s.items.filter((x) => x.id !== id),
      total: next ? s.total : Math.max(0, s.total - 1),
    }));
  }, []);

  return { ...state, reload, loadMore, patch, hasMore: state.items.length < state.total };
}

/** Kechiktirilgan qiymat (qidiruv uchun). */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchField({ value, onChange, placeholder, label }) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-slate-500 ring-1 ring-slate-200 transition focus-within:ring-2 focus-within:ring-emerald-500">
      <SearchIcon className="h-[18px] w-[18px] shrink-0" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        className="w-full min-w-0 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Qidiruvni tozalash"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300"
        >
          <XIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
        </button>
      )}
    </label>
  );
}

/** "Yana yuklash" + nechtadan nechtasi ko'rsatilgani. */
export function LoadMore({ list }) {
  if (!list.items.length) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-xs font-semibold text-slate-500">
        {list.items.length} / {list.total} ta ko'rsatilmoqda
      </p>
      {list.hasMore && (
        <button type="button" onClick={list.loadMore} disabled={list.more} className={cx(btn.outline, 'h-11 px-6 text-sm')}>
          {list.more && <Spinner />} Yana yuklash
        </button>
      )}
    </div>
  );
}

/** Ro'yxat skeleti. */
export function RowsSkeleton({ rows = 4, h = 'h-[84px]' }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cx('skeleton rounded-2xl', h)} />
      ))}
    </div>
  );
}

export function Badge({ tone = 'slate', children, title }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-700',
    sky: 'bg-sky-100 text-sky-800',
  };
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', tones[tone])}>
      {children}
    </span>
  );
}

/**
 * Tasdiqlash oynasi. onConfirm() Promise qaytaradi; xato bo'lsa oynada ko'rsatiladi.
 * `danger` — qizil tugma.
 */
export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={cx(btn.ghost, 'h-12 flex-1')}>
            Bekor qilish
          </button>
          <button type="button" onClick={run} disabled={busy} className={cx(danger ? btn.danger : btn.primary, 'h-12 flex-1')}>
            {busy && <Spinner />} {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-[15px] leading-relaxed text-slate-700">{text}</p>
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </Modal>
  );
}
