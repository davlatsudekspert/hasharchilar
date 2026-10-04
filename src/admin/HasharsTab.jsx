// "Hasharlar": holat filtri, qidiruv, ro'yxat (rasm bilan), ko'rish oynasi va o'chirish.
import { useEffect, useState } from 'react';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';
import { Thumb } from '../components/HasharCard.jsx';
import { CalendarIcon, ChevronRightIcon, ExternalIcon, LeafIcon, PhoneIcon, PinIcon, TrashIcon, UsersIcon } from '../components/icons.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, EmptyState, ErrorState, ItemChips, StatusBadge } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { mediaUrl } from '../lib/config.js';
import { cx, formatDateLong, formatDateTime, formatDay, formatPhone, osmLink, volunteersLabel } from '../lib/utils.js';
import { ConfirmDialog, LoadMore, RowsSkeleton, SearchField, useDebounced, usePagedList } from './shared.jsx';

const FILTERS = [
  { id: '', label: 'Barchasi' },
  { id: 'PENDING', label: 'Kutilmoqda' },
  { id: 'COMPLETED', label: 'Bajarildi' },
];

/** O'chirishni tasdiqlash matni. */
export const deleteHasharText = (h) =>
  `"${h.title}" (${h.creator?.name || 'tashkilotchi'}) butunlay o'chiriladi: ko'ngillilar ro'yxati va rasmlari ham. Bu amalni qaytarib bo'lmaydi.`;

/** Hashar ko'rish oynasi (admin uchun: tashkilotchi telefoni, ko'ngillilar, O'chirish). */
export function AdminHasharPreview({ hashar: h, onClose, onDelete }) {
  const [volunteers, setVolunteers] = useState(null);
  useEffect(() => {
    let alive = true;
    api
      .getHashar(h.id)
      .then((d) => alive && setVolunteers(d.volunteers || []))
      .catch(() => alive && setVolunteers([]));
    return () => {
      alive = false;
    };
  }, [h.id]);

  const before = mediaUrl(h.before_url);
  const after = mediaUrl(h.after_url);
  return (
    <Modal
      title={h.title}
      subtitle={`#${h.id} · e'lon qilingan: ${formatDay(h.created_at)}`}
      onClose={onClose}
      size="lg"
      footer={
        <button type="button" onClick={onDelete} className={cx(btn.dangerSoft, 'h-12 w-full')}>
          <TrashIcon className="h-5 w-5" /> Hasharni o'chirish
        </button>
      }
    >
      {before && after ? (
        <BeforeAfterSlider before={before} after={after} alt={h.title} />
      ) : before || after ? (
        <img src={before || after} alt="" className="aspect-[16/10] w-full rounded-2xl bg-slate-100 object-cover" />
      ) : (
        <div className="grid aspect-[16/7] place-items-center rounded-2xl bg-emerald-50 text-emerald-300">
          <LeafIcon className="h-12 w-12" />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={h.status} />
        <span className="text-sm font-semibold text-slate-600">{volunteersLabel(h.volunteer_count)}</span>
      </div>
      {h.description && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{h.description}</p>}
      <ul className="mt-4 space-y-2.5 text-[15px] text-slate-800">
        <li className="flex gap-2.5">
          <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <span>
            {formatDateLong(h.date_time)}
            {h.completed_at && <span className="text-slate-500"> · yakunlangan: {formatDay(h.completed_at)}</span>}
          </span>
        </li>
        <li className="flex gap-2.5">
          <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <span>
            {h.address || "Manzil ko'rsatilmagan"}{' '}
            <a href={osmLink(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
              xarita <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          </span>
        </li>
        <li className="flex gap-2.5">
          <PhoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <span>
            {h.creator?.name}
            {h.creator?.phone && (
              <>
                {' · '}
                <a href={`tel:${h.creator.phone}`} className="font-semibold text-emerald-700 hover:underline">
                  {formatPhone(h.creator.phone)}
                </a>
              </>
            )}
          </span>
        </li>
      </ul>
      <ItemChips items={h.items} className="mt-4" />
      <h3 className="mt-5 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">
        <UsersIcon className="h-4 w-4" /> Ko'ngillilar
      </h3>
      {volunteers === null ? (
        <div className="skeleton mt-2 h-8 rounded-xl" aria-hidden="true" />
      ) : volunteers.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {volunteers.map((v) => (
            <li key={v.id} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
              {v.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Hali hech kim yo'q</p>
      )}
    </Modal>
  );
}

export default function HasharsTab() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const list = usePagedList((p) => api.admin.hashars({ ...p, status, q }), [status, q]);
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const askDelete = (h) =>
    setConfirm({
      hashar: h,
      run: async () => {
        await api.admin.deleteHashar(h.id);
        list.patch(h.id, null);
        setPreview(null);
        toast("Hashar o'chirildi");
      },
    });

  let body;
  if (list.loading) body = <RowsSkeleton />;
  else if (list.error && !list.items.length) body = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!list.items.length) {
    body = <EmptyState title={q || status ? 'Hech narsa topilmadi' : "Hozircha hashar yo'q"} text={q ? `"${q}" bo'yicha hashar topilmadi.` : undefined} />;
  } else {
    body = (
      <>
        <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {list.items.map((h) => (
            <li key={h.id} data-testid="admin-hashar" className="flex items-center gap-2 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200/70">
              <button
                type="button"
                onClick={() => setPreview(h)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition hover:bg-slate-50"
              >
                <Thumb hashar={h} className="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-bold text-slate-900">{h.title}</p>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <StatusBadge status={h.status} className="shrink-0 !px-2 !py-0.5" />
                    <span className="truncate text-sm text-slate-500">{formatDateTime(h.date_time)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {h.creator?.name} · {volunteersLabel(h.volunteer_count)}
                  </p>
                </div>
                <ChevronRightIcon className="hidden h-5 w-5 shrink-0 text-slate-400 sm:block" />
              </button>
              <button
                type="button"
                onClick={() => askDelete(h)}
                aria-label={`O'chirish: ${h.title}`}
                title="O'chirish"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-600 transition hover:bg-red-50"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
        {list.error && <p className="mt-3 text-center text-sm font-medium text-red-700">{list.error}</p>}
        <LoadMore list={list} />
      </>
    );
  }

  return (
    <section aria-label="Hasharlar">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Holat" className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-slate-200/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              type="button"
              role="radio"
              aria-checked={status === f.id}
              onClick={() => setStatus(f.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-bold transition',
                status === f.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Nom, manzil yoki tashkilotchi…" label="Hasharlarni qidirish" />
        {!list.loading && <span className="shrink-0 text-sm font-semibold text-slate-500">Jami: {list.total}</span>}
      </div>
      {body}
      {preview && <AdminHasharPreview hashar={preview} onClose={() => setPreview(null)} onDelete={() => askDelete(preview)} />}
      {confirm && (
        <ConfirmDialog
          title="Hasharni o'chirish"
          text={deleteHasharText(confirm.hashar)}
          confirmLabel="O'chirish"
          danger
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
