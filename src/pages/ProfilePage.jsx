// O'z profilim: sarlavha (avatar, bio, tuman, statistika, daraja), mening hasharlarim, nishonlar, sozlamalar.
import { useEffect, useState } from 'react';
import { appDownloadUrl } from '../components/AppBanner.jsx';
import AuthForm from '../components/AuthForm.jsx';
import { EmailVerifyFlow } from '../components/EmailOtp.jsx';
import { HasharRow, isUnpaid } from '../components/HasharCard.jsx';
import {
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  EditIcon,
  FlagIcon,
  HandIcon,
  InfoIcon,
  LogOutIcon,
  BellIcon,
  BookmarkIcon,
  MailIcon,
  MedalIcon,
  PaletteIcon,
  WalletIcon,
  PlusIcon,
  SettingsIcon,
  ShareIcon,
  ShieldIcon,
  TrophyIcon,
  UserIcon,
} from '../components/icons.jsx';
import { BadgesGrid, ChangePasswordForm, EditProfileModal, ProfileHero } from '../components/ProfileParts.jsx';
import { AccentPicker, ThemePicker, ThemePreview } from '../components/AppearancePicker.jsx';
import LockSettings from '../lock/LockSettings.jsx';
import { remindersSupported, setRemindersEnabled, useRemindersEnabled } from '../lib/reminders.js';
import { useToast } from '../components/Toast.jsx';
import { btn, CardSkeleton, EmptyState, ErrorState, Link, Segmented, Spinner } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { IS_NATIVE, SITE_URL } from '../lib/config.js';
import { haptic, onRestoredPhoto, peekRestoredPhoto, shareLink } from '../lib/native.js';
import { navigate } from '../lib/router.js';
import { useServerConfig } from '../lib/serverConfig.js';
import { Q } from '../lib/queries.js';
import { clearCache, useApi } from '../lib/store.js';
import { useUnread } from '../lib/notifications.js';
import { cx } from '../lib/utils.js';

function MyHashars() {
  const [tab, setTab] = useState('created');
  const created = useApi(...Q.myCreated);
  const joined = useApi(...Q.myJoined);
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
          <ul className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((h) => (
              <li key={h.id}>
                <HasharRow hashar={h} action={isUnpaid(h)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Saqlangan hasharlar (xatcho'plar). */
function SavedHashars() {
  const saves = useApi(...Q.mySaves);
  const list = Array.isArray(saves.data) ? saves.data : [];
  if (saves.loading) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <CardSkeleton key={i} horizontal />
        ))}
      </div>
    );
  }
  if (saves.error && !list.length) {
    return saves.error.status === 404 ? (
      <EmptyState icon={BookmarkIcon} title="Saqlanganlar hali ishga tushmagan" text="Server yangilangach bu yerda saqlab qo'ygan hasharlaringiz ko'rinadi." />
    ) : (
      <ErrorState message={saves.error.message} onRetry={saves.reload} compact />
    );
  }
  if (!list.length) {
    return (
      <EmptyState
        icon={BookmarkIcon}
        title="Hali hech narsa saqlanmagan"
        text="Hashar kartasidagi xatcho'p belgisini bosing — keyinroq shu yerdan tez topasiz."
        action={
          <button type="button" onClick={() => navigate('/hasharlar')} className={cx(btn.primary, 'h-11 px-5')}>
            Hasharlarni ko'rish
          </button>
        }
      />
    );
  }
  return (
    <ul className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="saved-list">
      {list.map((h) => (
        <li key={h.id}>
          <HasharRow hashar={h} />
        </li>
      ))}
    </ul>
  );
}

/** Profil tepasida: to'lov kutayotgan hasharlar haqida eslatma. */
function UnpaidNotice() {
  const created = useApi(...Q.myCreated);
  const { hashar_fee: fee, loaded } = useServerConfig();
  const unpaid = (Array.isArray(created.data) ? created.data : []).filter(isUnpaid);
  if (!unpaid.length) return null;
  const free = loaded && !(fee > 0); // narx 0 — to'lov shart emas, bosilsa bepul e'lon qilinadi
  const first = unpaid[0];
  return (
    <button
      type="button"
      onClick={() => navigate(`/tolov/${first.id}`)}
      className="fade-up mb-4 flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-left ring-1 ring-amber-200 transition hover:ring-amber-300 active:scale-[.99] dark:from-amber-400/10 dark:to-orange-400/5 dark:ring-amber-400/25"
      data-testid="unpaid-notice"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950">
        <WalletIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-amber-950 dark:text-amber-100">
          {free ? `${unpaid.length} ta hasharingiz e'lon qilinmagan` : `${unpaid.length} ta hasharingiz to'lovni kutmoqda`}
        </span>
        <span className="block truncate text-sm text-amber-900/80 dark:text-amber-200/80">
          "{first.title}" — {free ? "endi bepul e'lon qilish mumkin" : "to'lovdan so'ng e'lon qilinadi"}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
    </button>
  );
}

/** Sozlamalar → Eslatmalar (faqat APK: mahalliy bildirishnomalar). */
function RemindersCard() {
  const [supported, setSupported] = useState(false);
  const enabled = useRemindersEnabled();
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => remindersSupported())
      .then((v) => alive && setSupported(!!v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!supported) return null;
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand ring-1 ring-line">
          <BellIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-ink">Hashar eslatmalari</h3>
          <p className="text-sm text-ink-3">Qo'shilgan hasharingizdan 1 kun va 2 soat oldin eslatamiz.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Hashar eslatmalari"
          onClick={() => {
            haptic('select');
            setRemindersEnabled(!enabled);
          }}
          className={cx('relative h-7 w-12 shrink-0 rounded-full transition', enabled ? 'bg-brand-600' : 'bg-surface-3 ring-1 ring-line')}
        >
          <span className={cx('absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 [transition-timing-function:var(--ease-spring)]', enabled ? 'translate-x-[22px]' : 'translate-x-0.5')} />
        </button>
      </div>
    </section>
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

/** Sozlamalar → Email: tasdiqlangan email + belgi, yoki "Email qo'shish" (kod bilan tasdiqlash). */
function EmailCard() {
  const { user, setUser, refresh } = useAuth();
  const { email_enabled: emailOn } = useServerConfig();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  if (!emailOn && !user.email) return null;
  const verified = Boolean(user.email_verified && user.email);

  const done = (u) => {
    setUser(u);
    refresh().catch(() => {});
    setEditing(false);
    toast('Email tasdiqlandi');
  };

  return (
    <section aria-labelledby="email-card-title" className="rounded-3xl border border-line bg-surface p-5 shadow-soft" data-testid="email-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand ring-1 ring-line">
          <MailIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="email-card-title" className="text-base font-extrabold text-ink">
              Email
            </h3>
            {verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-400/15 dark:text-brand-300">
                <CheckIcon className="h-3 w-3" strokeWidth={3} /> Tasdiqlangan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-400/15 dark:text-amber-300">
                Tasdiqlanmagan
              </span>
            )}
          </div>
          {verified ? (
            <p className="mt-0.5 font-semibold break-all text-ink-2" data-testid="profile-email">
              {user.email}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-ink-3">Hashar e'lon qilish, qo'shilish, izoh yozish va parolni tiklash uchun kerak. Boshqalarga ko'rinmaydi.</p>
          )}
        </div>
        {verified && emailOn && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={cx(btn.outline, 'h-10 shrink-0 px-3.5 text-sm max-sm:hidden')}>
            O'zgartirish
          </button>
        )}
      </div>
      {verified && emailOn && !editing && (
        <button type="button" onClick={() => setEditing(true)} className={cx(btn.outline, 'mt-4 h-11 w-full text-sm sm:hidden')}>
          Emailni o'zgartirish
        </button>
      )}
      {emailOn && (!verified || editing) && (
        <div className="mt-4">
          {editing ? (
            <EmailVerifyFlow
              onVerified={done}
              footer={
                <button type="button" onClick={() => setEditing(false)} className={cx(btn.ghost, 'h-11 w-full')}>
                  Bekor qilish
                </button>
              }
            />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className={cx(btn.primary, 'h-12 w-full sm:w-auto sm:px-6')}>
              <MailIcon className="h-5 w-5" /> Email qo'shish
            </button>
          )}
        </div>
      )}
    </section>
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
      <EmailCard />

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft" data-testid="appearance-card">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-ink">
          <PaletteIcon className="h-5 w-5 text-brand" /> Ko'rinish
        </h3>
        <p className="mb-4 text-sm text-ink-3">Rejim va rang aksentini tanlang — butun ilova shu rangda bo'ladi.</p>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">Rejim</p>
              <ThemePicker />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">Rang aksenti</p>
              <AccentPicker />
            </div>
          </div>
          <ThemePreview />
        </div>
      </section>

      <LockSettings />
      <RemindersCard />

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
  const TABQ = { sozlamalar: 'settings', nishonlar: 'badges', saqlanganlar: 'saved' };
  const [tab, setTab] = useState(TABQ[route.query.tab] || 'hashars');
  // Xuddi shu sahifada ?tab= o'zgarsa (bildirishnoma / havola) — bo'lim almashadi
  const qTab = route.query.tab;
  useEffect(() => {
    if (qTab && TABQ[qTab]) setTab(TABQ[qTab]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTab]);
  const { count: unreadCount } = useUnread();
  const [editing, setEditing] = useState(false);

  // APK: OS kamera paytida ilovani o'ldirgan bo'lsa — profil tahriri suratni oladi
  useEffect(() => {
    const check = () => peekRestoredPhoto('avatar') && setEditing(true);
    check();
    return onRestoredPhoto(check);
  }, []);

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
      <UnpaidNotice />
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

      {/* Telefonda bildirishnomalarga tez yo'l (desktopda — header qo'ng'iroqchasi) */}
      <Link
        to="/bildirishnomalar"
        className="mt-4 flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft transition active:scale-[.99] lg:hidden"
      >
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 && <span className="badge-dot absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-surface" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Bildirishnomalar</span>
          <span className="block text-sm text-ink-3">{unreadCount ? `${unreadCount} ta yangi` : "Yangi bildirishnoma yo'q"}</span>
        </span>
        <ChevronRightIcon className="h-5 w-5 text-ink-3" />
      </Link>

      <div className="mt-6">
        <div role="tablist" aria-label="Profil bo'limlari" className="grid grid-cols-4 gap-1 rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
          {[
            { value: 'hashars', label: 'Hasharlarim', icon: FlagIcon },
            { value: 'saved', label: 'Saqlanganlar', icon: BookmarkIcon },
            { value: 'badges', label: 'Nishonlar', icon: MedalIcon },
            { value: 'settings', label: 'Sozlamalar', icon: SettingsIcon },
          ].map((o) => {
            const on = tab === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  haptic('select');
                  setTab(o.value);
                }}
                className={cx(
                  'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11.5px] font-bold transition sm:flex-row sm:justify-center sm:gap-2 sm:py-2.5 sm:text-sm',
                  on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink',
                )}
              >
                <o.icon className={cx('h-[18px] w-[18px] transition', on && 'text-brand')} {...(o.value === 'saved' ? { filled: on } : {})} />
                <span className="max-w-full truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
        <div key={tab} className="page-enter mt-5">
          {tab === 'hashars' && <MyHashars />}
          {tab === 'saved' && <SavedHashars />}
          {tab === 'badges' && <BadgesGrid stats={stats} />}
          {tab === 'settings' && <Settings onEdit={() => setEditing(true)} appInfo={appInfo} />}
        </div>
      </div>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
    </div>
  );
}
