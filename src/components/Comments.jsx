// Izohlar: ro'yxat (eski → yangi), yozish (kirish talab qilinadi), o'z izohini / admin — istalganini o'chirish.
import { useEffect, useState } from 'react';
import { useActions } from '../lib/actions.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { haptic } from '../lib/native.js';
import { useApi } from '../lib/store.js';
import { cx, timeAgo } from '../lib/utils.js';
import { useBlockUser } from './BlockParts.jsx';
import { BanIcon, FlagIcon, MessageIcon, MoreIcon, SendIcon, TrashIcon } from './icons.jsx';
import { useReport } from './ReportSheet.jsx';
import { useToast } from './Toast.jsx';
import { Avatar, Link, Spinner } from './ui.jsx';

const MAX = 500;

export default function Comments({ hasharId, onCount }) {
  const { user } = useAuth();
  const { requireVerified } = useActions();
  const toast = useToast();
  const c = useApi(`comments:${hasharId}`, () => api.comments(hasharId));
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [menuId, setMenuId] = useState(null); // ochiq "⋯" menyusi (izoh id)
  const [report, reportSheet] = useReport();
  const [askBlock, blockModal] = useBlockUser();
  const list = Array.isArray(c.data) ? c.data : [];
  const unavailable = c.error && c.error.status === 404;

  // "⋯" menyusi: tashqariga bosilsa yoki Esc bilan yopiladi
  useEffect(() => {
    if (menuId == null) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest('[data-cmenu]')) setMenuId(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuId]);

  const blockAuthor = (cm) => {
    setMenuId(null);
    askBlock(cm.user, () => {
      // Bloklangan foydalanuvchining izohlari darhol yashiriladi
      c.mutate((l) => (Array.isArray(l) ? l.filter((x) => x.user?.id !== cm.user.id) : l));
      onCount?.(list.filter((x) => x.user?.id !== cm.user.id).length);
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    if (!(await requireVerified('comment'))) return;
    setBusy(true);
    try {
      const created = await api.addComment(hasharId, text);
      haptic('light');
      setBody('');
      c.mutate((l) => [...(Array.isArray(l) ? l : []), { ...created, is_mine: true }]);
      onCount?.(list.length + 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setDeleting(id);
    try {
      await api.deleteComment(id);
      c.mutate((l) => (Array.isArray(l) ? l.filter((x) => x.id !== id) : l));
      onCount?.(list.length - 1);
      toast("Izoh o'chirildi", 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section aria-labelledby="comments-title" className="rounded-3xl border border-line bg-surface p-5 shadow-soft sm:p-6">
      <h2 id="comments-title" className="flex items-center gap-2 text-lg font-extrabold text-ink">
        <MessageIcon className="h-5 w-5 text-brand" /> Izohlar
        {list.length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-ink-3 ring-1 ring-line">{list.length}</span>}
      </h2>

      {c.loading ? (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <span className="skeleton h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <span className="skeleton block h-3 w-28 rounded-full" />
                <span className="skeleton block h-3 w-4/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : unavailable ? (
        <p className="mt-3 text-sm text-ink-3">Izohlar bo'limi tez orada ishga tushadi.</p>
      ) : c.error ? (
        <p className="mt-3 text-sm text-ink-3">
          Izohlarni yuklab bo'lmadi.{' '}
          <button type="button" onClick={c.reload} className="font-bold text-brand hover:underline">
            Qayta urinish
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-4 text-sm text-ink-3">Hali izoh yo'q. Savolingiz bormi yoki nima olib kelishni bilmoqchimisiz? Birinchi bo'lib yozing!</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {list.map((cm) => (
            <li key={cm.id} className="flex gap-3">
              <Link to={`/u/${cm.user?.id}`} aria-label={cm.user?.name} className="shrink-0 rounded-full">
                <Avatar name={cm.user?.name} src={cm.user?.avatar_url} size="md" className="h-9 w-9" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="rounded-2xl rounded-tl-md bg-surface-2 px-4 py-2.5 ring-1 ring-line">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link to={`/u/${cm.user?.id}`} className="truncate text-sm font-bold text-ink hover:underline">
                      {cm.user?.name || 'Foydalanuvchi'}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="text-xs text-ink-3">{timeAgo(cm.created_at)}</span>
                      {!cm.is_mine && cm.user && (
                        <span className="relative" data-cmenu>
                          <button
                            type="button"
                            onClick={() => setMenuId(menuId === cm.id ? null : cm.id)}
                            aria-label="Izoh amallari"
                            aria-haspopup="menu"
                            aria-expanded={menuId === cm.id}
                            data-testid="comment-menu"
                            className="-mr-2 grid h-8 w-8 place-items-center rounded-full text-ink-3 transition hover:bg-surface-3 hover:text-ink"
                          >
                            <MoreIcon className="h-5 w-5" />
                          </button>
                          {menuId === cm.id && (
                            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-2xl">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMenuId(null);
                                  report({ type: 'comment', id: cm.id, label: cm.user.name });
                                }}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-ink-2 hover:bg-surface-2"
                              >
                                <FlagIcon className="h-4 w-4" /> Shikoyat qilish
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => blockAuthor(cm)}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                              >
                                <BanIcon className="h-4 w-4" /> Foydalanuvchini bloklash
                              </button>
                            </div>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-2">{cm.body}</p>
                </div>
                {(cm.is_mine || (user && user.is_admin)) && (
                  <button
                    type="button"
                    onClick={() => remove(cm.id)}
                    disabled={deleting === cm.id}
                    className="ml-2 mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-red-600 disabled:opacity-50"
                  >
                    {deleting === cm.id ? <Spinner className="h-3 w-3" /> : <TrashIcon className="h-3.5 w-3.5" />} O'chirish
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!unavailable && (
        <form onSubmit={submit} className="mt-5 flex items-end gap-2">
          {user && <Avatar name={user.name} src={user.avatar_url} size="md" className="mb-1 h-9 w-9 max-sm:hidden" />}
          <div className="relative flex-1">
            <label htmlFor="comment-body" className="sr-only">
              Izoh yozing
            </label>
            <textarea
              id="comment-body"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
              }}
              rows={1}
              placeholder={user ? 'Izoh yozing…' : 'Izoh uchun kiring'}
              className={cx(
                'block max-h-40 min-h-12 w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15',
                body.length > MAX * 0.8 && 'pb-6',
              )}
            />
            {body.length > MAX * 0.8 && <span className="pointer-events-none absolute bottom-1.5 right-3 text-[11px] text-ink-3 tabular">{body.length}/{MAX}</span>}
          </div>
          <button
            type="submit"
            disabled={busy || !body.trim()}
            aria-label="Izohni yuborish"
            className={cx(
              'grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white transition hover:bg-brand-700 active:scale-95 disabled:opacity-40 dark:bg-primary dark:text-brand-950',
            )}
          >
            {busy ? <Spinner /> : <SendIcon className="h-5 w-5" />}
          </button>
        </form>
      )}
      {reportSheet}
      {blockModal}
    </section>
  );
}
