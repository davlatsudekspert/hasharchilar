// Foydalanuvchilarni bloklash: tasdiqlash oynasi (useBlockUser) va "Bloklangan foydalanuvchilar" ro'yxati.
import { useCallback, useState } from 'react';
import { api } from '../lib/api.js';
import { useActions } from '../lib/actions.jsx';
import { haptic } from '../lib/native.js';
import { Q } from '../lib/queries.js';
import { invalidate, useApi } from '../lib/store.js';
import { cx, timeAgo } from '../lib/utils.js';
import { BanIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { Avatar, btn, EmptyState, ErrorState, Spinner } from './ui.jsx';

/** Bloklash/blokdan chiqarishdan keyin ta'sirlangan keshlar yangilanadi. */
export const invalidateBlocked = () => invalidate('comments:', 'hashars', 'hashar:', 'user:', 'me:');

function ConfirmBlock({ person, onConfirm, onClose }) {
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
      title="Foydalanuvchini bloklash"
      size="sm"
      onClose={busy ? () => {} : onClose}
      autoFocus={false}
      footer={
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} disabled={busy} className={cx(btn.ghost, 'h-12 flex-1')}>
            Bekor qilish
          </button>
          <button type="button" onClick={run} disabled={busy} className={cx(btn.danger, 'h-12 flex-1')} data-testid="block-confirm">
            {busy ? <Spinner /> : <BanIcon className="h-5 w-5" />} Bloklash
          </button>
        </div>
      }
    >
      <p className="text-[15px] leading-relaxed text-ink-2">
        <b className="text-ink">{person.name || 'Foydalanuvchi'}</b> bloklansinmi? Uning izohlari va hasharlari sizga ko'rinmaydi. Blokdan chiqarishni istalgan payt Profil → Sozlamalar bo'limida qilishingiz mumkin.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
    </Modal>
  );
}

/**
 * [askBlock(person, onDone?), element] — kirishni talab qiladi, tasdiqlaydi, bloklaydi va keshlarni yangilaydi.
 * person: { id, name }.
 */
export function useBlockUser() {
  const { requireAuth } = useActions();
  const toast = useToast();
  const [ask, setAsk] = useState(null); // { person, onDone }
  const askBlock = useCallback(
    async (person, onDone) => {
      if (await requireAuth('block')) setAsk({ person, onDone });
    },
    [requireAuth],
  );
  const element = ask ? (
    <ConfirmBlock
      person={ask.person}
      onClose={() => setAsk(null)}
      onConfirm={async () => {
        await api.blockUser(ask.person.id);
        haptic('success');
        toast('Foydalanuvchi bloklandi', 'info');
        invalidateBlocked();
        ask.onDone?.();
      }}
    />
  ) : null;
  return [askBlock, element];
}

/** Blokdan chiqarish (tasdiqsiz) — muvaffaqiyatda true. */
export async function unblockUser(person, toast) {
  try {
    await api.unblockUser(person.id);
    haptic('light');
    toast(`${person.name || 'Foydalanuvchi'} blokdan chiqarildi`, 'info');
    invalidateBlocked();
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

/** Profil → Sozlamalar → "Bloklangan foydalanuvchilar" oynasi. */
export function BlockedUsersModal({ onClose }) {
  const toast = useToast();
  const list = useApi(...Q.myBlocks);
  const [busyId, setBusyId] = useState(null);
  const items = Array.isArray(list.data) ? list.data : [];

  const remove = async (p) => {
    setBusyId(p.id);
    const ok = await unblockUser(p, toast);
    if (ok) list.mutate((l) => (Array.isArray(l) ? l.filter((x) => x.id !== p.id) : l));
    setBusyId(null);
  };

  return (
    <Modal title="Bloklangan foydalanuvchilar" subtitle="Ularning izohlari va hasharlari sizga ko'rinmaydi" onClose={onClose} autoFocus={false}>
      {list.loading && !list.data ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-14 rounded-2xl" />
        </div>
      ) : list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={list.reload} compact />
      ) : items.length === 0 ? (
        <EmptyState icon={BanIcon} title="Bloklanganlar yo'q" text="Hech kimni bloklamagansiz." />
      ) : (
        <ul className="space-y-2" data-testid="blocked-list">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5 ring-1 ring-line">
              <Avatar name={p.name} src={p.avatar_url} size="md" className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{p.name}</p>
                <p className="text-xs text-ink-3">{timeAgo(p.blocked_at)} bloklangan</p>
              </div>
              <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} className={cx(btn.outline, 'h-10 shrink-0 px-3.5 text-sm')}>
                {busyId === p.id && <Spinner />} Blokdan chiqarish
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
