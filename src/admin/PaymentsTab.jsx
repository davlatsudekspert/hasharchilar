// "To'lovlar": to'lov kutayotgan hasharlar (qo'lda tasdiqlash / bepul e'lon qilish) va to'lovlar tarixi
// (provayder, holat bo'yicha filtr, qidiruv, jami summa).
import { useState } from 'react';
import { Thumb } from '../components/HasharCard.jsx';
import { CheckIcon, ExternalIcon, HourglassIcon, WalletIcon } from '../components/icons.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, EmptyState, ErrorState, inputCls, labelCls, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatSom, PROVIDER_LABEL, TX_STATUS } from '../lib/payments.js';
import { cx, formatDateTime, formatPhone, timeAgo } from '../lib/utils.js';
import { LoadMore, RowsSkeleton, SearchField, useDebounced, usePagedList } from './shared.jsx';

const VIEWS = [
  { id: 'pending', label: 'Kutilayotganlar', icon: HourglassIcon },
  { id: 'history', label: 'Tarix', icon: WalletIcon },
];
const PROVIDERS = [
  { id: '', label: 'Barchasi' },
  { id: 'payme', label: 'Payme' },
  { id: 'click', label: 'Click' },
  { id: 'manual', label: "Qo'lda" },
];
const STATUSES = [
  { id: '', label: 'Har qanday holat' },
  { id: 'paid', label: "To'langan" },
  { id: 'pending', label: 'Jarayonda' },
  { id: 'cancelled', label: 'Bekor qilingan' },
  { id: 'refunded', label: 'Qaytarilgan' },
];

const pill = (active) =>
  cx('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition', active ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900');

/** Qo'lda tasdiqlash oynasi (izoh ixtiyoriy) yoki bepul e'lon qilish. */
function MarkPaidDialog({ hashar: h, waive, onDone, onClose }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.admin.markPaid(h.id, waive ? { waive: true, note: note.trim() || undefined } : { note: note.trim() || undefined });
      onDone(r);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={waive ? "Bepul e'lon qilish" : "To'langan deb belgilash"}
      subtitle={`#${h.id} · ${h.title}`}
      onClose={busy ? () => {} : onClose}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={cx(btn.ghost, 'h-12 flex-1')}>
            Bekor qilish
          </button>
          <button type="button" onClick={run} disabled={busy} className={cx(btn.primary, 'h-12 flex-1')} data-testid="confirm-mark-paid">
            {busy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} {waive ? "E'lon qilish" : 'Tasdiqlash'}
          </button>
        </div>
      }
    >
      <p className="text-[15px] leading-relaxed text-slate-700">
        {waive
          ? "Hashar to'lovsiz e'lon qilinadi (to'lov yozilmaydi). Tashkilotchiga bildirishnoma yuboriladi."
          : "To'lov qo'lda qabul qilinganini tasdiqlaysizmi? Hashar darhol e'lon qilinadi va tashkilotchiga bildirishnoma boradi."}
      </p>
      <label htmlFor="mp-note" className={cx(labelCls, 'mt-4')}>
        Izoh <span className="font-normal text-slate-400">(ixtiyoriy, masalan: chek raqami)</span>
      </label>
      <input id="mp-note" className={inputCls} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Karta orqali, 12:40" />
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </Modal>
  );
}

function PendingList() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const list = usePagedList((p) => api.admin.hashars({ ...p, payment: 'unpaid', q }), [q]);
  const [dialog, setDialog] = useState(null); // { hashar, waive }

  let body;
  if (list.loading) body = <RowsSkeleton />;
  else if (list.error && !list.items.length) body = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!list.items.length) {
    body = <EmptyState icon={CheckIcon} title={q ? 'Hech narsa topilmadi' : "To'lov kutayotgan hashar yo'q"} text={q ? undefined : "Barcha hasharlar to'langan yoki bepul e'lon qilingan."} />;
  } else {
    body = (
      <>
        <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {list.items.map((h) => (
            <li key={h.id} data-testid="admin-unpaid" className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-center gap-3">
                <Thumb hashar={h} className="h-14 w-14 shrink-0 rounded-xl" iconClass="h-6 w-6" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-bold text-slate-900">
                    <span className="text-slate-400">#{h.id}</span> {h.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {h.creator?.name}
                    {h.creator?.phone ? ` · ${formatPhone(h.creator.phone)}` : ''}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {formatDateTime(h.date_time)} · yaratildi {timeAgo(h.created_at)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setDialog({ hashar: h, waive: false })} className={cx(btn.primary, 'h-10 flex-1 text-sm')} data-testid="mark-paid">
                  <CheckIcon className="h-4 w-4" strokeWidth={2.8} /> To'landi
                </button>
                <button type="button" onClick={() => setDialog({ hashar: h, waive: true })} className={cx(btn.outline, 'h-10 px-3.5 text-sm')}>
                  Bepul
                </button>
                <a href={`#/hashar/${h.id}`} target="_blank" rel="noopener noreferrer" className={cx(btn.ghost, 'h-10 w-10 p-0')} aria-label="Hasharni ochish">
                  <ExternalIcon className="h-4 w-4" />
                </a>
              </div>
            </li>
          ))}
        </ul>
        <LoadMore list={list} />
      </>
    );
  }
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={query} onChange={setQuery} placeholder="Nom yoki tashkilotchi…" label="Kutilayotgan to'lovlarni qidirish" />
        {!list.loading && <span className="shrink-0 text-sm font-semibold text-slate-500">Jami: {list.total}</span>}
      </div>
      {body}
      {dialog && (
        <MarkPaidDialog
          hashar={dialog.hashar}
          waive={dialog.waive}
          onClose={() => setDialog(null)}
          onDone={() => {
            list.patch(dialog.hashar.id, null);
            setDialog(null);
            toast(dialog.waive ? "Hashar bepul e'lon qilindi" : "To'lov tasdiqlandi, hashar e'lon qilindi");
          }}
        />
      )}
    </div>
  );
}

function HistoryList() {
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [summary, setSummary] = useState(null);
  const list = usePagedList(
    (p) =>
      api.admin.payments({ ...p, provider, status, q }).then((r) => {
        if (p.offset === 0) setSummary(r.summary || null);
        return r;
      }),
    [provider, status, q],
  );

  let body;
  if (list.loading) body = <RowsSkeleton h="h-[68px]" />;
  else if (list.error && !list.items.length) body = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!list.items.length) body = <EmptyState icon={WalletIcon} title="To'lovlar yo'q" text={q || provider || status ? "Filtr bo'yicha to'lov topilmadi." : "Hali hech qanday to'lov qabul qilinmagan."} />;
  else {
    body = (
      <>
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <ul className="divide-y divide-slate-100">
            {list.items.map((p) => {
              const st = TX_STATUS[p.status] || TX_STATUS.unknown;
              return (
                <li key={p.id} data-testid="admin-payment" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black uppercase text-slate-700">{(PROVIDER_LABEL[p.provider] || p.provider).slice(0, 2)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">
                      {p.hashar?.title || "O'chirilgan hashar"} <span className="font-semibold text-slate-400">#{p.hashar?.id}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {PROVIDER_LABEL[p.provider] || p.provider} · {p.user?.name || '—'} · {timeAgo(p.created_at)}
                      {p.note ? ` · ${p.note}` : ''}
                    </p>
                  </div>
                  <span className="font-extrabold tabular text-slate-900">{formatSom(p.amount)}</span>
                  <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', st.cls)}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <LoadMore list={list} />
      </>
    );
  }

  return (
    <div>
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <p className="text-sm font-semibold text-slate-500">To'langanlar</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{summary.paid_count}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <p className="text-sm font-semibold text-slate-500">Jami tushum</p>
            <p className="mt-1 text-2xl font-black text-brand-700">{formatSom(summary.paid_amount)}</p>
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div role="radiogroup" aria-label="Provayder" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <div className="inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
            {PROVIDERS.map((o) => (
              <button key={o.id || 'all'} type="button" role="radio" aria-checked={provider === o.id} onClick={() => setProvider(o.id)} className={pill(provider === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Holat" className="h-11 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-500">
          {STATUSES.map((o) => (
            <option key={o.id || 'all'} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <SearchField value={query} onChange={setQuery} placeholder="Hashar, foydalanuvchi, tranzaksiya…" label="To'lovlarni qidirish" />
      </div>
      {body}
    </div>
  );
}

export default function PaymentsTab() {
  const [view, setView] = useState('pending');
  return (
    <section aria-label="To'lovlar">
      <div role="tablist" aria-label="To'lovlar bo'limi" className="mb-4 inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={cx(pill(view === v.id), 'inline-flex items-center gap-1.5')}>
            <v.icon className="h-4 w-4" /> {v.label}
          </button>
        ))}
      </div>
      {view === 'pending' ? <PendingList /> : <HistoryList />}
    </section>
  );
}
