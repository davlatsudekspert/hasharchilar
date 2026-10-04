// Profil oynasi: ism, telefon, statistika, "Mening hasharlarim" (yaratganlarim / qo'shilganlarim), "Chiqish".
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { cx, formatDateTime, formatMonth, formatPhone, volunteersLabel } from '../lib/utils.js';
import { Thumb } from './HasharCard.jsx';
import { ChevronRightIcon, LeafIcon, LogOutIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import { Avatar, btn, EmptyState, ErrorState, Spinner, StatusBadge } from './ui.jsx';

const LISTS = [
  { id: 'created', label: 'Yaratganlarim' },
  { id: 'joined', label: "Qo'shilganlarim" },
];

function MiniStat({ value, label }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 text-center ring-1 ring-slate-200/70">
      <span className="block text-2xl font-black text-slate-900">{value ?? '—'}</span>
      <span className="mt-0.5 block text-xs font-semibold text-slate-500">{label}</span>
    </div>
  );
}

export default function ProfileModal({ onClose, onOpenHashar, onLoggedOut, refreshKey }) {
  const { user, stats, refresh, logout } = useAuth();
  const [tab, setTab] = useState('created');
  const [lists, setLists] = useState({}); // { created: [], joined: [] }
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh, refreshKey]);

  const loadList = (id) => {
    setError('');
    setLists((l) => ({ ...l, [id]: undefined }));
    api
      .listHashars({ mine: id })
      .then((data) => setLists((l) => ({ ...l, [id]: data })))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadList(tab);
  }, [tab, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const doLogout = async () => {
    setLoggingOut(true);
    await logout();
    onLoggedOut();
  };

  if (!user) return null;
  const list = lists[tab];

  return (
    <Modal
      title="Profil"
      onClose={onClose}
      size="md"
      footer={
        <button type="button" onClick={doLogout} disabled={loggingOut} className={cx(btn.outline, 'h-12 w-full text-red-700')}>
          {loggingOut ? <Spinner /> : <LogOutIcon className="h-5 w-5" />} Chiqish
        </button>
      }
    >
      <div className="flex items-center gap-4">
        <Avatar name={user.name} size="lg" className="bg-emerald-600 text-white" />
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold text-slate-900">{user.name}</p>
          <p className="text-[15px] font-medium text-slate-600">{formatPhone(user.phone)}</p>
          {user.created_at && <p className="mt-0.5 text-xs text-slate-500">A'zo: {formatMonth(user.created_at)}dan beri</p>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <MiniStat value={stats?.created} label="Yaratgan" />
        <MiniStat value={stats?.joined} label="Qatnashgan" />
        <MiniStat value={stats?.completed} label="Bajarilgan" />
      </div>

      <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Mening hasharlarim</h3>
      <div role="tablist" aria-label="Mening hasharlarim" className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {LISTS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'rounded-lg py-2 text-sm font-bold transition',
              tab === t.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {error ? (
          <ErrorState message={error} onRetry={() => loadList(tab)} compact />
        ) : !list ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-[76px] rounded-2xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={LeafIcon}
            title={tab === 'created' ? "Hali hashar e'lon qilmagansiz" : "Hali hech qaysi hasharga qo'shilmagansiz"}
            text={tab === 'created' ? 'Mahallangizda nima qilish kerak? Birinchi hasharni siz boshlang!' : "Xaritadan yaqin hasharni toping va qo'shiling."}
          />
        ) : (
          <ul className="space-y-2">
            {list.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onOpenHashar(h)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-slate-300"
                >
                  <Thumb hashar={h} className="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-bold text-slate-900">{h.title}</p>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <StatusBadge status={h.status} className="shrink-0 !px-2 !py-0.5" />
                      <span className="truncate text-sm text-slate-500">
                        {formatDateTime(h.date_time)} · {volunteersLabel(h.volunteer_count)}
                      </span>
                    </div>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
