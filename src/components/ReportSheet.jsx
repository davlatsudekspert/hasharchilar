// Shikoyat qilish (Google Play UGC talabi): hashar, izoh yoki foydalanuvchi uchun sabab tanlash + ixtiyoriy izoh.
// `useReport()` — kirishni talab qiladi (mehmon bo'lsa kirish oynasi), keyin sheet'ni ochadi.
import { useCallback, useState } from 'react';
import { api } from '../lib/api.js';
import { useActions } from '../lib/actions.jsx';
import { haptic } from '../lib/native.js';
import { cx } from '../lib/utils.js';
import { AlertIcon, FlagIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { btn, inputCls, Spinner } from './ui.jsx';

const MAX = 500;

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam / reklama' },
  { id: 'abuse', label: 'Haqorat yoki tahdid' },
  { id: 'sexual', label: 'Jinsiy kontent' },
  { id: 'child_safety', label: 'Bolalar xavfsizligi (bolalarga zarar)' },
  { id: 'violence', label: "Zo'ravonlik" },
  { id: 'fraud', label: 'Firibgarlik' },
  { id: 'other', label: 'Boshqa' },
];

const TARGET_TITLES = { hashar: 'Hashar', comment: 'Izoh', user: 'Foydalanuvchi' };

/** target: { type: 'hashar' | 'comment' | 'user', id, label? } */
export default function ReportSheet({ target, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return setError('Sababni tanlang');
    setBusy(true);
    setError('');
    try {
      await api.report(target.type, target.id, reason, details.trim());
      haptic('success');
      toast("Shikoyatingiz yuborildi. Administrator 24 soat ichida ko'rib chiqadi.");
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Shikoyat qilish"
      subtitle={target.label ? `${TARGET_TITLES[target.type] || ''}: ${target.label}` : undefined}
      onClose={busy ? () => {} : onClose}
      autoFocus={false}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className={cx(btn.ghost, 'h-12 px-5')}>
            Bekor
          </button>
          <button type="submit" form="report-form" disabled={busy || !reason} className={cx(btn.danger, 'h-12 flex-1')} data-testid="report-submit">
            {busy ? <Spinner /> : <FlagIcon className="h-5 w-5" />} Yuborish
          </button>
        </div>
      }
    >
      <form id="report-form" onSubmit={submit} noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-2">Shikoyat sababi</legend>
          <div role="radiogroup" className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.id}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] font-semibold transition',
                  reason === r.id ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-400/50 dark:bg-red-500/10 dark:text-red-200' : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                )}
              >
                <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="h-4 w-4 shrink-0 accent-red-600" />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="relative mt-4">
          <label htmlFor="report-details" className="mb-1.5 block text-sm font-semibold text-ink-2">
            Qo'shimcha izoh <span className="font-normal text-ink-3">(ixtiyoriy)</span>
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, MAX))}
            rows={3}
            placeholder="Nima bo'lganini qisqacha yozing…"
            className={cx(inputCls, 'resize-y')}
          />
          <span className="mt-1 block text-right text-[11px] text-ink-3 tabular">
            {details.length}/{MAX}
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** [report(target), element] — `report` kirishni talab qiladi, `element` ni sahifa JSX'iga qo'ying. */
export function useReport() {
  const { requireAuth } = useActions();
  const [target, setTarget] = useState(null);
  const report = useCallback(
    async (t) => {
      if (await requireAuth('report')) setTarget(t);
    },
    [requireAuth],
  );
  const element = target ? <ReportSheet target={target} onClose={() => setTarget(null)} /> : null;
  return [report, element];
}
