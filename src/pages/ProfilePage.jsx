// O'z profilim: sarlavha (avatar, bio, tuman, statistika, daraja), mening hasharlarim, nishonlar, sozlamalar.
import { useState } from 'react';
import { appDownloadUrl } from '../components/AppBanner.jsx';
import AuthForm from '../components/AuthForm.jsx';
import { HasharRow } from '../components/HasharCard.jsx';
import {
  ChevronRightIcon,
  DownloadIcon,
  EditIcon,
  FlagIcon,
  HandIcon,
  InfoIcon,
  LogOutIcon,
  MedalIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  ShieldIcon,
  TrophyIcon,
  UserIcon,
} from '../components/icons.jsx';
import { BadgesGrid, ChangePasswordForm, EditProfileModal, ProfileHero } from '../components/ProfileParts.jsx';
import { ThemePicker } from '../components/ThemeToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, CardSkeleton, EmptyState, ErrorState, Link, Segmented, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { IS_NATIVE, SITE_URL } from '../lib/config.js';
import { haptic, shareLink } from '../lib/native.js';
import { navigate } from '../lib/router.js';
import { clearCache, useApi } from '../lib/store.js';
import { cx } from '../lib/utils.js';

function MyHashars() {
  const [tab, setTab] = useState('created');
  const created = useApi('me:created', () => api.listHashars({ mine: 'created' }));
  const joined = useApi('me:joined', () => api.listHashars({ mine: 'joined' }));
  const cur = tab === 'created' ? created : joined;
  const list = Array.isArray(cur.data) ? cur.data : [];
  return (
    <div>
      <Segmented
        value={tab}
        onChange={setTab}
        label="Mening hasharlarim"
        className="w-full sm:w-auto"
        options={[
          { value: 'created', label: 'Yaratganlarim', icon: FlagIcon, count: Array.isArray(created.data) ? created.data.length : null },
          { value: 'joined', label: "Qo'shilganlarim", icon: HandIcon, count: Array.isArray(joined.data) ? joined.data.length : null },
        ]}
      />
      <div className="mt-4">
        {cur.loading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <CardSkeleton key={i} horizontal />
            ))}
          </div>
        ) : cur.error ? (
          <ErrorState message={cur.error.message} onRetry={cur.reload} compact />
        ) : list.length === 0 ? (
          <EmptyState
            title={tab === 'created' ? "Siz hali hashar e'lon qilmagansiz" : "Siz hali hasharga qo'shilmagansiz"}
            text={tab === 'created' ? "Mahallangizdagi muammoni hal qilish uchun qo'shnilaringizni yig'ing." : 'Yaqin atrofdagi hasharlarni toping va birinchi qadamni qo\'ying.'}
            action={
              tab === 'created' ? (
                <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-11 px-5')}>
                  <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
                </button>
              ) : (
                <button type="button" onClick={() => navigate('/xarita')} className={cx(btn.primary, 'h-11 px-5')}>
                  Xaritada topish
                </button>
              )
            }
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((h) => (
              <li key={h.id}>
                <HasharRow hashar={h} action={false} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SettingsRow({ icon: Icon, title, text, onClick, href, danger, children, download }) {
  const inner = (
    <>
      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', danger ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-surface-2 text-brand ring-1 ring-line')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cx('block font-bold', danger ? 'text-red-600 dark:text-red-400' : 'text-ink')}>{title}</span>
        {text && <span className="block truncate text-sm text-ink-3">{text}</span>}
      </span>
      {children || <ChevronRightIcon className="h-5 w-5 text-ink-3" />}
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2';
  if (href)
    return (
      <a href={href} className={cls} download={download}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function Settings({ onEdit, appInfo }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const doLogout = async () => {
    setBusy(true);
    await logout();
    clearCache();
    haptic('medium');
    toast('Tizimdan chiqdingiz', 'info');
    navigate('/', { replace: true });
  };
  const shareApp = async () => {
    const r = await shareLink({ title: 'hasharchilar.uz', text: "Mahallamizni birga obod qilamiz — qo'shiling!", url: `${SITE_URL}/` });
    if (r === 'copied') toast('Havola nusxalandi');
  };
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <h3 className="text-base font-extrabold text-ink">Ko'rinish</h3>
        <p className="mb-3 text-sm text-ink-3">Tungi rejim ko'zni charchatmaydi va batareyani tejaydi.</p>
        <ThemePicker />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <h3 className="text-base font-extrabold text-ink">Parolni o'zgartirish</h3>
        <p className="mb-4 text-sm text-ink-3">Joriy sessiyangiz saqlanib qoladi.</p>
        <ChangePasswordForm />
      </section>

      <section className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
        <SettingsRow icon={EditIcon} title="Profilni tahrirlash" text="Ism, rasm, tuman, o'zim haqimda" onClick={onEdit} />
        <SettingsRow icon={UserIcon} title="Ommaviy profilim" text="Boshqalar sizni qanday ko'radi" onClick={() => navigate(`/u/${user.id}`)} />
        <SettingsRow icon={TrophyIcon} title="Reyting" text="Ko'ngillilar orasidagi o'rningiz" onClick={() => navigate('/reyting')} />
        {user.is_admin && <SettingsRow icon={ShieldIcon} title="Admin panel" text="Foydalanuvchilar va hasharlarni boshqarish" onClick={() => navigate('/admin')} />}
        <SettingsRow icon={ShareIcon} title="Do'stlarga ulashish" text="hasharchilar.uz havolasini yuboring" onClick={shareApp} />
        {!IS_NATIVE && <SettingsRow icon={DownloadIcon} title="Android ilova" text="APK yuklab olish" href={appDownloadUrl(appInfo)} download="hasharchilar.apk" />}
        <SettingsRow icon={InfoIcon} title="Loyiha haqida" text="Qanday ishlaydi, savollar" onClick={() => navigate('/haqida')} />
        <SettingsRow icon={LogOutIcon} title="Chiqish" danger onClick={doLogout}>
          {busy ? <Spinner className="text-red-600" /> : null}
        </SettingsRow>
      </section>
    </div>
  );
}

export default function ProfilePage({ route, appInfo }) {
  const { user, stats, ready } = useAuth();
  const [tab, setTab] = useState(route.query.tab === 'sozlamalar' ? 'settings' : route.query.tab === 'nishonlar' ? 'badges' : 'hashars');
  const [editing, setEditing] = useState(false);

  if (!ready) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 lg:px-6" aria-hidden="true">
        <div className="skeleton h-72 rounded-[32px]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-soft sm:p-8">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line">
            <UserIcon className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">Profilingiz</h1>
          <p className="mb-5 mt-1 text-sm text-ink-3">Kiring — hasharlaringiz, nishonlar va reytingdagi o'rningiz shu yerda.</p>
          <AuthForm />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link to="/reyting" className={cx(btn.outline, 'h-12')}>
            <TrophyIcon className="h-5 w-5" /> Reyting
          </Link>
          <Link to="/haqida" className={cx(btn.outline, 'h-12')}>
            <InfoIcon className="h-5 w-5" /> Loyiha haqida
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-4 lg:px-6 lg:pt-8">
      <ProfileHero
        person={user}
        stats={stats}
        editable
        onEditAvatar={() => setEditing(true)}
        action={
          <button type="button" onClick={() => setEditing(true)} className={cx(btn.glass, 'h-10 px-4 text-sm')}>
            <EditIcon className="h-4 w-4" /> Profilni tahrirlash
          </button>
        }
      />

      <div className="mt-6">
        <Segmented
          value={tab}
          onChange={setTab}
          label="Profil bo'limlari"
          className="w-full"
          options={[
            { value: 'hashars', label: 'Hasharlarim', icon: FlagIcon },
            { value: 'badges', label: 'Nishonlar', icon: MedalIcon },
            { value: 'settings', label: 'Sozlamalar', icon: SettingsIcon },
          ]}
        />
        <div key={tab} className="page-enter mt-5">
          {tab === 'hashars' && <MyHashars />}
          {tab === 'badges' && <BadgesGrid stats={stats} />}
          {tab === 'settings' && <Settings onEdit={() => setEditing(true)} appInfo={appInfo} />}
        </div>
      </div>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
    </div>
  );
}
