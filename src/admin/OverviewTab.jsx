// "Umumiy": statistik kartalar + oxirgi hasharlar va foydalanuvchilar.
import { useCallback, useEffect, useState } from 'react';
import { Thumb } from '../components/HasharCard.jsx';
import { BanIcon, CheckIcon, ClockIcon, ImageIcon, LeafIcon, ShieldIcon, UserIcon, UsersIcon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, ErrorState, StatusBadge } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { cx, formatDay, formatPhone, volunteersLabel } from '../lib/utils.js';
import { AdminHasharPreview, deleteHasharText } from './HasharsTab.jsx';
import { ConfirmDialog } from './shared.jsx';
import { UserBadges } from './UsersTab.jsx';

function StatCard({ icon: Icon, label, value, hint, tone = 'emerald' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-700',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      {/* Nom kartaning to'liq kengligida (ikonka qiymat qatorida) — "Foydalanuvchilar" telefonda ham sig'adi */}
      <p className="truncate text-sm font-semibold text-slate-500">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-3xl font-black tracking-tight text-slate-900">{value ?? '—'}</p>
        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', tones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      {hint && <p className="mt-0.5 text-xs font-semibold text-emerald-700">{hint}</p>}
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function OverviewTab({ meId, onShowUser, onShowAll }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    setError('');
    api.admin
      .overview()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <div aria-hidden="true">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton h-[112px] rounded-2xl" />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const week = (n) => (n ? `+${n} so'nggi 7 kunda` : "7 kunda yangi yo'q");
  const link = (label, onClick) => (
    <button type="button" onClick={onClick} className="text-sm font-bold text-emerald-700 hover:underline">
      {label}
    </button>
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={UsersIcon} label="Foydalanuvchilar" value={data.users} hint={week(data.signups_7d)} />
        <StatCard icon={LeafIcon} label="Hasharlar" value={data.hashars} hint={week(data.hashars_7d)} />
        <StatCard icon={ClockIcon} label="Kutilmoqda" value={data.pending} tone="amber" />
        <StatCard icon={CheckIcon} label="Bajarildi" value={data.completed} />
        <StatCard icon={UserIcon} label="Ko'ngillilar" value={data.volunteers} tone="sky" />
        <StatCard icon={ImageIcon} label="Rasmlar" value={data.media} tone="slate" />
        <StatCard icon={ShieldIcon} label="Adminlar" value={data.admins} tone="emerald" />
        <StatCard icon={BanIcon} label="Bloklangan" value={data.blocked} tone="red" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Oxirgi hasharlar" action={link('Barchasi', () => onShowAll('hashars'))}>
          {data.recent_hashars.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recent_hashars.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => setPreview(h)} className="flex w-full items-center gap-3 rounded-xl py-2.5 text-left hover:bg-slate-50">
                    <Thumb hashar={h} className="h-12 w-12 shrink-0 rounded-xl" iconClass="h-6 w-6" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 font-bold text-slate-900">{h.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {h.creator?.name} · {formatDay(h.created_at)} · {volunteersLabel(h.volunteer_count)}
                      </p>
                    </div>
                    <StatusBadge status={h.status} className="shrink-0 !px-2 !py-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">Hozircha hashar yo'q</p>
          )}
        </Panel>

        <Panel title="Yangi foydalanuvchilar" action={link('Barchasi', () => onShowAll('users'))}>
          <ul className="divide-y divide-slate-100">
            {data.recent_users.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onShowUser(u)} className="flex w-full items-center gap-3 rounded-xl py-2.5 text-left hover:bg-slate-50">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <p className="truncate font-bold text-slate-900">{u.name}</p>
                      <UserBadges u={u} me={u.id === meId} />
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {formatPhone(u.phone)} · {formatDay(u.created_at)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {preview && (
        <AdminHasharPreview
          hashar={preview}
          onClose={() => setPreview(null)}
          onDelete={() =>
            setConfirm({
              hashar: preview,
              run: async () => {
                await api.admin.deleteHashar(preview.id);
                setPreview(null);
                toast("Hashar o'chirildi");
                load();
              },
            })
          }
        />
      )}
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
    </div>
  );
}
