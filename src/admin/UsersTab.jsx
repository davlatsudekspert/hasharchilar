// "Foydalanuvchilar": qidiruv, ro'yxat (mobil — karta, desktop — qator), bloklash / rol / o'chirish.
import { useState } from 'react';
import { BanIcon, CheckIcon, ShieldIcon, TrashIcon, UserIcon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, btn, EmptyState, ErrorState } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { cx, formatDay, formatPhone } from '../lib/utils.js';
import { Badge, ConfirmDialog, LoadMore, RowsSkeleton, SearchField, useDebounced, usePagedList } from './shared.jsx';

/** Rol / holat badge'lari. */
export function UserBadges({ u, me }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {u.is_admin && (
        <Badge tone="emerald" title={u.env_admin ? 'ADMIN_PHONES sozlamasi orqali tayinlangan' : undefined}>
          <ShieldIcon className="h-3 w-3" strokeWidth={2.6} /> {u.env_admin ? 'Asosiy admin' : 'Admin'}
        </Badge>
      )}
      {u.blocked_at && (
        <Badge tone="red">
          <BanIcon className="h-3 w-3" strokeWidth={2.6} /> Bloklangan
        </Badge>
      )}
      {me && <Badge tone="sky">Siz</Badge>}
    </span>
  );
}

const ACTION_BTN = 'h-9 px-3 text-[13px]';

export default function UsersTab({ meId, initialQuery = '' }) {
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const q = useDebounced(query.trim());
  const list = usePagedList((p) => api.admin.users({ ...p, q }), [q]);
  const [confirm, setConfirm] = useState(null); // { title, text, confirmLabel, danger, run }
  const [busyId, setBusyId] = useState(null);

  const apply = async (u, call, message) => {
    const r = await call();
    list.patch(u.id, r.user);
    toast(message);
  };

  const unblock = async (u) => {
    setBusyId(u.id);
    try {
      await apply(u, () => api.admin.unblock(u.id), `${u.name} blokdan chiqarildi`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const ask = (u, kind) => {
    const name = u.name;
    const variants = {
      block: {
        title: 'Foydalanuvchini bloklash',
        text: `${name} tizimdan chiqariladi va qayta kira olmaydi. Hasharlari saytda qoladi. Keyinroq blokdan chiqarish mumkin.`,
        confirmLabel: 'Bloklash',
        danger: true,
        run: () => apply(u, () => api.admin.block(u.id), `${name} bloklandi`),
      },
      admin: {
        title: 'Admin qilish',
        text: `${name} admin panelga to'liq kirish huquqini oladi: foydalanuvchilarni bloklash, hasharlarni o'chirish va h.k.`,
        confirmLabel: 'Admin qilish',
        run: () => apply(u, () => api.admin.setRole(u.id, 'admin'), `${name} endi administrator`),
      },
      user: {
        title: 'Oddiy foydalanuvchi qilish',
        text: `${name} admin huquqlaridan mahrum bo'ladi.`,
        confirmLabel: 'Oddiy qilish',
        run: () => apply(u, () => api.admin.setRole(u.id, 'user'), `${name} endi oddiy foydalanuvchi`),
      },
      delete: {
        title: "Foydalanuvchini o'chirish",
        text: `${name} (${formatPhone(u.phone)}) butunlay o'chiriladi${
          u.created_count ? ` — u e'lon qilgan ${u.created_count} ta hashar rasmlari bilan birga` : ''
        }. Bu amalni qaytarib bo'lmaydi.`,
        confirmLabel: "O'chirish",
        danger: true,
        run: async () => {
          await api.admin.deleteUser(u.id);
          list.patch(u.id, null);
          toast(`${name} o'chirildi`);
        },
      },
    };
    setConfirm(variants[kind]);
  };

  const renderActions = (u) => {
    const me = u.id === meId;
    const locked = me || u.env_admin; // o'zi yoki ADMIN_PHONES admin'i
    if (locked) {
      return (
        <p className="text-xs font-medium text-slate-500">
          {me ? "O'z hisobingizni bu yerdan o'zgartirib bo'lmaydi" : 'ADMIN_PHONES orqali himoyalangan'}
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {u.blocked_at ? (
          <button type="button" onClick={() => unblock(u)} disabled={busyId === u.id} className={cx(btn.soft, ACTION_BTN)}>
            <CheckIcon className="h-4 w-4" strokeWidth={2.6} /> Blokdan chiqarish
          </button>
        ) : (
          <button type="button" onClick={() => ask(u, 'block')} className={cx(btn.outline, ACTION_BTN)}>
            <BanIcon className="h-4 w-4" /> Bloklash
          </button>
        )}
        {u.role === 'admin' ? (
          <button type="button" onClick={() => ask(u, 'user')} className={cx(btn.outline, ACTION_BTN)}>
            <UserIcon className="h-4 w-4" /> Oddiy qilish
          </button>
        ) : (
          <button type="button" onClick={() => ask(u, 'admin')} className={cx(btn.outline, ACTION_BTN)}>
            <ShieldIcon className="h-4 w-4" /> Admin qilish
          </button>
        )}
        <button type="button" onClick={() => ask(u, 'delete')} className={cx(btn.dangerSoft, ACTION_BTN)}>
          <TrashIcon className="h-4 w-4" /> O'chirish
        </button>
      </div>
    );
  };

  let body;
  if (list.loading) body = <RowsSkeleton />;
  else if (list.error && !list.items.length) body = <ErrorState message={list.error} onRetry={list.reload} />;
  else if (!list.items.length) {
    body = (
      <EmptyState
        icon={UserIcon}
        title={q ? 'Hech kim topilmadi' : "Foydalanuvchilar yo'q"}
        text={q ? `"${q}" bo'yicha ism yoki telefon topilmadi.` : undefined}
      />
    );
  } else {
    body = (
      <>
        <ul className="space-y-2.5">
          {list.items.map((u) => (
            <li
              key={u.id}
              data-testid="admin-user"
              className={cx(
                'rounded-2xl bg-white p-3.5 shadow-sm ring-1 sm:p-4',
                u.blocked_at ? 'ring-red-200' : 'ring-slate-200/70',
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={u.name} className={u.blocked_at ? 'bg-red-100 text-red-700' : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className={cx('truncate font-bold text-slate-900', u.blocked_at && 'line-through decoration-red-400')}>{u.name}</p>
                      <UserBadges u={u} me={u.id === meId} />
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      <a href={`tel:${u.phone}`} className="font-medium hover:text-emerald-700 hover:underline">
                        {formatPhone(u.phone)}
                      </a>
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center text-xs lg:w-72 lg:shrink-0">
                  <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <dt className="font-semibold text-slate-500">Yaratgan</dt>
                    <dd className="text-sm font-extrabold text-slate-900">{u.created_count}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <dt className="font-semibold text-slate-500">Qatnashgan</dt>
                    <dd className="text-sm font-extrabold text-slate-900">{u.joined_count}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <dt className="font-semibold text-slate-500">A'zo</dt>
                    <dd className="truncate text-sm font-extrabold text-slate-900">{formatDay(u.created_at)}</dd>
                  </div>
                </dl>
                <div className="lg:w-[360px] lg:shrink-0 lg:text-right lg:[&>div]:justify-end">{renderActions(u)}</div>
              </div>
            </li>
          ))}
        </ul>
        {list.error && <p className="mt-3 text-center text-sm font-medium text-red-700">{list.error}</p>}
        <LoadMore list={list} />
      </>
    );
  }

  return (
    <section aria-label="Foydalanuvchilar">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Ism yoki telefon raqam…" label="Foydalanuvchilarni qidirish" />
        {!list.loading && <span className="text-sm font-semibold text-slate-500">Jami: {list.total}</span>}
      </div>
      {body}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          text={confirm.text}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
