// "Shikoyatlar": foydalanuvchilar yuborgan shikoyatlar (hashar / izoh / foydalanuvchi). Bolalar xavfsizligi (child_safety)
// shikoyatlari qizil va birinchi; "Hal qilindi" / "Rad etish" + tezkor amallar (kontentni o'chirish, foydalanuvchini bloklash).
import { useEffect, useState } from 'react';
import { AlertIcon, BanIcon, CheckIcon, ExternalIcon, FlagIcon, TrashIcon, XIcon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, EmptyState, ErrorState, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { cx, formatDay, timeAgo } from '../lib/utils.js';
import { Badge, ConfirmDialog, LoadMore, RowsSkeleton, usePagedList } from './shared.jsx';

const FILTERS = [
  { id: 'open', label: 'Ochiq' },
  { id: 'resolved', label: 'Hal qilingan' },
  { id: 'dismissed', label: 'Rad etilgan' },
  { id: 'all', label: 'Barchasi' },
];

export const REASON_LABELS = {
  spam: 'Spam / reklama',
  abuse: 'Haqorat yoki tahdid',
  sexual: 'Jinsiy kontent',
  child_safety: 'Bolalar xavfsizligi',
  violence: "Zo'ravonlik",
  fraud: 'Firibgarlik',
  other: 'Boshqa',
};
const TARGET_LABELS = { hashar: 'Hashar', comment: 'Izoh', user: 'Foydalanuvchi' };
const STATUS_BADGE = { open: ['amber', 'Ochiq'], resolved: ['emerald', 'Hal qilingan'], dismissed: ['slate', 'Rad etilgan'] };
const ACTION_BTN = 'h-9 px-3 text-[13px]';

/** Nishonni saytda ochish havolasi (yangi tabda: admin holati yo'qolmasin). */
function targetHref(r) {
  const t = r.target;
  if (!t || t.deleted) return null;
  if (r.target_type === 'user') return `#/u/${t.user_id}`;
  return t.hashar_id ? `#/hashar/${t.hashar_id}` : null;
}

function targetSummary(r) {
  const t = r.target;
  if (!t || t.deleted) return <span className="italic text-slate-500">O'chirilgan</span>;
  if (r.target_type === 'hashar') return <b>{t.title}</b>;
  if (r.target_type === 'comment') return <span className="whitespace-pre-line break-words">“{t.body}”</span>;
  return <b>{t.user_name}</b>;
}

function ReportCard({ r, busy, onResolve, onAction }) {
  const cs = r.reason === 'child_safety';
  const [tone, statusLabel] = STATUS_BADGE[r.status] || STATUS_BADGE.open;
  const href = targetHref(r);
  const t = r.target;
  const alive = t && !t.deleted;
  return (
    <li
      data-testid="admin-report"
      className={cx('rounded-2xl bg-white p-4 shadow-sm', cs && r.status === 'open' ? 'ring-2 ring-red-500' : 'ring-1 ring-slate-200/70')}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {cs ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
            <AlertIcon className="h-3 w-3" strokeWidth={2.6} /> {REASON_LABELS.child_safety}
          </span>
        ) : (
          <Badge tone="red">{REASON_LABELS[r.reason] || r.reason}</Badge>
        )}
        <Badge tone="sky">{TARGET_LABELS[r.target_type]}</Badge>
        <Badge tone={tone}>{statusLabel}</Badge>
        {r.count > 1 && <Badge tone="amber">{r.count} ta shikoyat</Badge>}
      </div>

      <p className="mt-2.5 text-[15px] leading-relaxed text-slate-800">{targetSummary(r)}</p>
      {alive && t.user && r.target_type !== 'user' && (
        <p className="mt-0.5 text-xs text-slate-500">
          Muallif: {t.user.name}
          {t.user.blocked && ' (bloklangan)'}
        </p>
      )}
      {r.details && <p className="mt-2 whitespace-pre-line break-words rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{r.details}</p>}
      <p className="mt-2 text-xs text-slate-500">
        Shikoyatchi: <b className="text-slate-700">{r.reporter?.name || '—'}</b> · {timeAgo(r.created_at)} ({formatDay(r.created_at)})
        {r.resolved_at && ` · ko'rib chiqilgan: ${formatDay(r.resolved_at)}`}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className={cx(btn.outline, ACTION_BTN)}>
            <ExternalIcon className="h-4 w-4" /> Ochish
          </a>
        )}
        {alive && r.target_type === 'hashar' && (
          <button type="button" onClick={() => onAction(r, 'deleteHashar')} className={cx(btn.dangerSoft, ACTION_BTN)}>
            <TrashIcon className="h-4 w-4" /> Hasharni o'chirish
          </button>
        )}
        {alive && r.target_type === 'comment' && (
          <button type="button" onClick={() => onAction(r, 'deleteComment')} className={cx(btn.dangerSoft, ACTION_BTN)}>
            <TrashIcon className="h-4 w-4" /> Izohni o'chirish
          </button>
        )}
        {alive && t.user && !t.user.blocked && (
          <button type="button" onClick={() => onAction(r, 'blockUser')} className={cx(btn.dangerSoft, ACTION_BTN)}>
            <BanIcon className="h-4 w-4" /> Foydalanuvchini bloklash
          </button>
        )}
      </div>

      {r.status === 'open' && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={() => onResolve(r, 'resolved')} disabled={busy} className={cx(btn.primary, 'h-10 flex-1 px-3 text-sm')}>
            {busy ? <Spinner /> : <CheckIcon className="h-4 w-4" strokeWidth={2.6} />} Hal qilindi
          </button>
          <button type="button" onClick={() => onResolve(r, 'dismissed')} disabled={busy} className={cx(btn.outline, 'h-10 flex-1 px-3 text-sm')}>
            <XIcon className="h-4 w-4" strokeWidth={2.6} /> Rad etish
          </button>
        </div>
      )}
    </li>
  );
}

/** `onCount(n)` — ochiq shikoyatlar soni o'zgarganda (tab belgisi uchun). */
export default function ReportsTab({ onCount }) {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const list = usePagedList((p) => api.admin.reports({ ...p, status }), [status]);
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [openCount, setOpenCount] = useState(null);

  // Ochiq soni serverdan (har yuklashda yangilanadi)
  useEffect(() => {
    api.admin
      .reports({ status: 'open', limit: 1 })
      .then((d) => {
        setOpenCount(d.open_count);
        onCount?.(d.open_count);
      })
      .catch(() => {});
  }, [list.items.length, list.total, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = async (r, next) => {
    setBusyId(r.id);
    try {
      await api.admin.resolveReport(r.id, next);
      toast(next === 'resolved' ? 'Shikoyat hal qilindi' : 'Shikoyat rad etildi');
      list.reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const act = (r, kind) => {
    const t = r.target;
    const variants = {
      deleteHashar: {
        title: "Hasharni o'chirish",
        text: `"${t.title}" butunlay o'chiriladi (ko'ngillilar, izohlar va rasmlari ham). Bu amalni qaytarib bo'lmaydi. Shu hashar bo'yicha ochiq shikoyatlar yopiladi.`,
        confirmLabel: "O'chirish",
        run: async () => {
          await api.admin.deleteHashar(t.hashar_id);
          toast("Hashar o'chirildi");
          list.reload();
        },
      },
      deleteComment: {
        title: "Izohni o'chirish",
        text: `Izoh o'chiriladi: “${t.body}”. Shu izoh bo'yicha ochiq shikoyatlar yopiladi.`,
        confirmLabel: "O'chirish",
        run: async () => {
          await api.admin.deleteComment(t.comment_id);
          toast("Izoh o'chirildi");
          list.reload();
        },
      },
      blockUser: {
        title: 'Foydalanuvchini bloklash',
        text: `${t.user.name} tizimdan chiqariladi va qayta kira olmaydi. Keyinroq "Foydalanuvchilar" bo'limidan blokdan chiqarish mumkin.`,
        confirmLabel: 'Bloklash',
        run: async () => {
          await api.admin.block(t.user.id);
          toast(`${t.user.name} bloklandi`);
          list.reload();
        },
      },
    };
    setConfirm(variants[kind]);
  };

  let body;
  if (list.loading) body = <RowsSkeleton h="h-[150px]" />;
  else if (list.error && !list.items.length) body = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!list.items.length) {
    body = <EmptyState icon={FlagIcon} title={status === 'open' ? "Ochiq shikoyat yo'q" : 'Shikoyat topilmadi'} text={status === 'open' ? 'Barcha shikoyatlar ko‘rib chiqilgan.' : undefined} />;
  } else {
    body = (
      <>
        <ul className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
          {list.items.map((r) => (
            <ReportCard key={r.id} r={r} busy={busyId === r.id} onResolve={resolve} onAction={act} />
          ))}
        </ul>
        {list.error && <p className="mt-3 text-center text-sm font-medium text-red-700">{list.error}</p>}
        <LoadMore list={list} />
      </>
    );
  }

  return (
    <section aria-label="Shikoyatlar">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Holat" className="grid shrink-0 grid-cols-4 gap-1 rounded-xl bg-slate-200/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={status === f.id}
              onClick={() => setStatus(f.id)}
              className={cx(
                'whitespace-nowrap rounded-lg px-1.5 py-2 text-[12px] font-bold transition min-[400px]:px-2 min-[400px]:text-[13px] sm:px-3 sm:text-sm',
                status === f.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {f.label}
              {f.id === 'open' && openCount > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[11px] text-white">{openCount}</span>}
            </button>
          ))}
        </div>
        {!list.loading && <span className="shrink-0 text-sm font-semibold text-slate-500">Jami: {list.total}</span>}
      </div>
      {body}
      {confirm && <ConfirmDialog title={confirm.title} text={confirm.text} confirmLabel={confirm.confirmLabel} danger onConfirm={confirm.run} onClose={() => setConfirm(null)} />}
    </section>
  );
}
