// Ommaviy profil (#/u/:id): avatar, bio, tuman, statistika, nishonlar, e'lon qilgan hasharlari. Telefon ko'rsatilmaydi.
import { useEffect } from 'react';
import { HasharRow } from '../components/HasharCard.jsx';
import { AlertIcon, ArrowLeftIcon, FlagIcon, MedalIcon } from '../components/icons.jsx';
import { BadgesGrid, ProfileHero } from '../components/ProfileParts.jsx';
import { btn, EmptyState, ErrorState, Link } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { hideSplash } from '../lib/native.js';
import { goBack, navigate } from '../lib/router.js';
import { useApi } from '../lib/store.js';
import { cx } from '../lib/utils.js';

export default function UserPage({ route }) {
  const id = route.params.id;
  const { user } = useAuth();
  const u = useApi(`user:${id}`, () => api.user(id));

  useEffect(() => {
    if (!u.loading) hideSplash();
  }, [u.loading]);

  if (u.loading && !u.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 lg:px-6" aria-hidden="true">
        <div className="skeleton h-80 rounded-[32px]" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-28 rounded-3xl" />
          <div className="skeleton h-28 rounded-3xl" />
        </div>
      </div>
    );
  }
  if (!u.data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        {u.error && u.error.status === 404 ? (
          <EmptyState icon={AlertIcon} title="Foydalanuvchi topilmadi" text="Bu profil mavjud emas yoki o'chirilgan." action={<Link to="/reyting" className={cx(btn.primary, 'h-11 px-5')}>Reytingga qaytish</Link>} />
        ) : (
          <ErrorState message={u.error?.message} onRetry={u.reload} />
        )}
      </div>
    );
  }

  const p = u.data;
  const hashars = Array.isArray(p.hashars) ? p.hashars : [];
  const isMe = user && user.id === p.id;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-4 lg:px-6 lg:pt-8">
      <button type="button" onClick={() => goBack('/reyting')} className={cx(btn.outline, 'mb-4 h-10 px-3.5 text-sm')}>
        <ArrowLeftIcon className="h-4 w-4" /> Orqaga
      </button>
      <ProfileHero
        person={p}
        stats={p.stats}
        action={
          isMe ? (
            <button type="button" onClick={() => navigate('/profil')} className={cx(btn.glass, 'h-10 px-4 text-sm')}>
              Mening profilim
            </button>
          ) : null
        }
      />

      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-ink">
          <MedalIcon className="h-5 w-5 text-brand" /> Nishonlar
        </h2>
        <BadgesGrid stats={p.stats} />
      </section>

      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-ink">
          <FlagIcon className="h-5 w-5 text-brand" /> E'lon qilgan hasharlari
        </h2>
        {hashars.length === 0 ? (
          <EmptyState title="Hali hashar e'lon qilmagan" text={`${p.name.split(' ')[0]} hozircha faqat qatnashuvchi sifatida faol.`} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {hashars.map((h) => (
              <li key={h.id}>
                <HasharRow hashar={h} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
