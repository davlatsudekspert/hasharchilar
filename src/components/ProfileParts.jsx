// Profil bo'laklari: sarlavha kartasi, statistika, nishonlar, profilni tahrirlash, parolni o'zgartirish.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { compressImage } from '../lib/image.js';
import { computeBadges, levelOf, scoreOf } from '../lib/meta.js';
import { haptic, HAS_NATIVE_CAMERA, takeNativePhoto } from '../lib/native.js';
import { invalidate } from '../lib/store.js';
import { cx, formatMonth } from '../lib/utils.js';
import { BADGE_ICONS, CalendarIcon, CameraIcon, CheckIcon, EditIcon, ImageIcon, PinIcon, ShieldIcon, TrashIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { Avatar, btn, inputCls, labelCls, Progress, Spinner } from './ui.jsx';

export const DISTRICTS = [
  'Bektemir tumani',
  'Chilonzor tumani',
  'Mirobod tumani',
  "Mirzo Ulug'bek tumani",
  'Olmazor tumani',
  'Sergeli tumani',
  'Shayxontohur tumani',
  'Uchtepa tumani',
  'Yakkasaroy tumani',
  'Yangihayot tumani',
  'Yashnobod tumani',
  'Yunusobod tumani',
];

/** Profil sarlavhasi (o'z profili va ommaviy profil uchun). */
export function ProfileHero({ person, stats, action, editable, onEditAvatar }) {
  const score = scoreOf(stats);
  const lv = levelOf(score);
  return (
    <section className="overflow-hidden rounded-[32px] border border-line bg-surface shadow-soft">
      <div className="hero-bg relative h-32 sm:h-40">
        <div className="grid-pattern absolute inset-0" />
        {action && <div className="absolute right-4 top-4">{action}</div>}
      </div>
      <div className="px-5 pb-6 sm:px-8">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
          <div className="relative w-fit">
            <Avatar name={person.name} src={person.avatar_url} size="2xl" className="ring-[5px] ring-surface" />
            {editable && (
              <button
                type="button"
                onClick={onEditAvatar}
                aria-label="Rasmni o'zgartirish"
                className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-white shadow-lg ring-4 ring-surface transition hover:bg-emerald-700"
              >
                <CameraIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold text-ink sm:text-3xl">{person.name}</h1>
              {person.is_admin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-white dark:text-slate-900">
                  <ShieldIcon className="h-3.5 w-3.5" /> Admin
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
              {person.district && (
                <span className="inline-flex items-center gap-1.5">
                  <PinIcon className="h-4 w-4" /> {person.district}
                </span>
              )}
              {person.created_at && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="h-4 w-4" /> {formatMonth(person.created_at)} dan beri a'zo
                </span>
              )}
            </p>
          </div>
        </div>
        {person.bio ? (
          <p className="mt-4 max-w-2xl whitespace-pre-line break-words text-[15px] leading-relaxed text-ink-2">{person.bio}</p>
        ) : editable ? (
          <p className="mt-4 text-sm italic text-ink-3">O'zingiz haqingizda qisqacha yozing — "Profilni tahrirlash" tugmasini bosing.</p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Qatnashgan', stats?.joined],
            ['Tashkil qilgan', stats?.created],
            ['Yakunlangan', stats?.completed],
            ['Ball', stats ? score : null],
          ].map(([label, v]) => (
            <div key={label} className="rounded-2xl bg-surface-2 p-3.5 ring-1 ring-line">
              <p className="font-display text-2xl font-extrabold text-ink tabular">{v ?? '—'}</p>
              <p className="text-xs font-semibold text-ink-3">{label}</p>
            </div>
          ))}
        </div>
        {stats && (
          <div className="mt-4 rounded-2xl bg-brand-soft p-4 ring-1 ring-brand-line">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-extrabold text-brand">{lv.level}-daraja</span>
              <span className="font-semibold text-ink-3 tabular">
                {lv.into}/{lv.need} ball → {lv.level + 1}-daraja
              </span>
            </div>
            <Progress value={lv.into} max={lv.need} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Nishonlar setkasi. */
export function BadgesGrid({ stats }) {
  const badges = computeBadges(stats);
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-ink-3">
        {earned} / {badges.length} nishon olingan
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {badges.map((b) => {
          const Icon = BADGE_ICONS[b.icon];
          return (
            <li
              key={b.id}
              className={cx(
                'relative flex flex-col items-center rounded-3xl p-4 text-center ring-1 transition',
                b.earned ? 'bg-surface shadow-soft ring-line' : 'bg-surface-2 ring-line',
              )}
            >
              <span
                className={cx(
                  'grid h-16 w-16 place-items-center rounded-full',
                  b.earned ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 shadow-cta' : 'bg-surface-3 text-ink-3 grayscale',
                )}
              >
                <Icon className="h-8 w-8" />
              </span>
              <p className={cx('mt-3 text-sm font-extrabold', b.earned ? 'text-ink' : 'text-ink-3')}>{b.title}</p>
              <p className="mt-0.5 text-xs leading-snug text-ink-3">{b.text}</p>
              {!b.earned && b.need > 1 && (
                <div className="mt-2 w-full">
                  <Progress value={b.have} max={b.need} className="h-1.5" />
                  <p className="mt-1 text-[11px] font-semibold text-ink-3 tabular">
                    {b.have}/{b.need}
                  </p>
                </div>
              )}
              {b.earned && (
                <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                  <CheckIcon className="h-3 w-3" strokeWidth={3.5} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Profilni tahrirlash oynasi (POST /api/me/profile multipart). */
export function EditProfileModal({ onClose }) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [district, setDistrict] = useState(user.district || '');
  const [avatar, setAvatar] = useState(null); // File
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!avatar) {
      setPreview(null);
      return undefined;
    }
    const u = URL.createObjectURL(avatar);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [avatar]);

  const accept = async (file) => {
    if (!file) return;
    setImgBusy(true);
    setError('');
    try {
      setAvatar(await compressImage(file, { maxSide: 512, quality: 0.85 }));
      setRemoveAvatar(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setImgBusy(false);
    }
  };

  const camera = async () => {
    try {
      accept(await takeNativePhoto());
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Ism kamida 2 harf bo\'lsin');
    const fd = new FormData();
    if (name.trim() !== user.name) fd.set('name', name.trim());
    if (bio.trim() !== (user.bio || '')) fd.set('bio', bio.trim());
    if (district.trim() !== (user.district || '')) fd.set('district', district.trim());
    if (avatar) fd.set('avatar', avatar, 'avatar.jpg');
    if (removeAvatar && !avatar) fd.set('remove_avatar', '1');
    if ([...fd.keys()].length === 0) return onClose();
    setBusy(true);
    try {
      const r = await api.updateProfile(fd);
      if (r && r.user) setUser({ ...user, ...r.user });
      haptic('success');
      toast('Profil yangilandi');
      invalidate('user:', 'leaderboard', 'comments:', 'hashar');
      onClose();
    } catch (err) {
      setError(err.status === 404 ? "Profilni tahrirlash hozircha mavjud emas" : err.message);
      setBusy(false);
    }
  };

  const shownSrc = preview || (removeAvatar ? null : user.avatar_url);

  return (
    <Modal
      title="Profilni tahrirlash"
      onClose={busy ? () => {} : onClose}
      autoFocus={false}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className={cx(btn.ghost, 'h-12 px-5')}>
            Bekor
          </button>
          <button type="submit" form="profile-form" disabled={busy || imgBusy} className={cx(btn.primary, 'h-12 flex-1')}>
            {busy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} Saqlash
          </button>
        </div>
      }
    >
      <form id="profile-form" onSubmit={save} className="space-y-5" noValidate>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar name={name || user.name} src={shownSrc} size="xl" />
            {imgBusy && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white">
                <Spinner />
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {HAS_NATIVE_CAMERA && (
              <button type="button" onClick={camera} className={cx(btn.soft, 'h-10 px-3.5 text-sm')}>
                <CameraIcon className="h-4 w-4" /> Kamera
              </button>
            )}
            <label className={cx(btn.soft, 'h-10 cursor-pointer px-3.5 text-sm has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-emerald-500')}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Profil rasmini tanlash"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  e.target.value = '';
                  accept(f);
                }}
              />
              <ImageIcon className="h-4 w-4" /> Rasm tanlash
            </label>
            {(shownSrc || avatar) && (
              <button
                type="button"
                onClick={() => {
                  setAvatar(null);
                  setRemoveAvatar(true);
                }}
                className={cx(btn.dangerSoft, 'h-10 px-3.5 text-sm')}
              >
                <TrashIcon className="h-4 w-4" /> O'chirish
              </button>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="p-name" className={labelCls}>
            Ism familiya
          </label>
          <input id="p-name" className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="p-district" className={labelCls}>
            Tuman / mahalla
          </label>
          <input
            id="p-district"
            className={inputCls}
            value={district}
            maxLength={60}
            list="districts"
            placeholder="Masalan: Chilonzor tumani"
            onChange={(e) => setDistrict(e.target.value)}
          />
          <datalist id="districts">
            {DISTRICTS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div>
          <div className="flex items-end justify-between">
            <label htmlFor="p-bio" className={labelCls}>
              O'zim haqimda
            </label>
            <span className="mb-1.5 text-xs text-ink-3 tabular">{bio.length}/300</span>
          </div>
          <textarea
            id="p-bio"
            rows={4}
            className={cx(inputCls, 'resize-y')}
            value={bio}
            maxLength={300}
            placeholder="Masalan: Daraxt ekishni yaxshi ko'raman, har shanba hasharga chiqaman 🌳"
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function PasswordField({ id, label, value, onChange, error, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className={cx(inputCls, 'pr-28', error && 'border-red-400 focus:border-red-500 focus:ring-red-500/15')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-sm font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label={show ? `${label}: yashirish` : `${label}: ko'rsatish`}
          aria-pressed={show}
        >
          {show ? 'Yashirish' : "Ko'rsatish"}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** Parolni o'zgartirish (POST /api/me/password). 401 — sessiya saqlanadi, "Joriy parol noto'g'ri". */
export function ChangePasswordForm() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (cur.length < 6) er.cur = "Joriy parol kamida 6 ta belgidan iborat";
    if (next.length < 6) er.next = "Yangi parol kamida 6 ta belgidan iborat bo'lsin";
    if (!er.next && rep !== next) er.rep = 'Parollar mos kelmadi';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      haptic('success');
      toast("Parol o'zgartirildi");
      setCur('');
      setNext('');
      setRep('');
      setErrors({});
    } catch (err) {
      if (err.status === 401) setErrors({ cur: "Joriy parol noto'g'ri" });
      else setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Parolni o'zgartirish">
      <PasswordField id="pw-cur" label="Joriy parol" value={cur} onChange={setCur} error={errors.cur} autoComplete="current-password" />
      <PasswordField id="pw-new" label="Yangi parol" value={next} onChange={setNext} error={errors.next} autoComplete="new-password" />
      <PasswordField id="pw-rep" label="Yangi parolni takrorlang" value={rep} onChange={setRep} error={errors.rep} autoComplete="new-password" />
      {errors.form && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={busy} className={cx(btn.primary, 'h-12 px-6')}>
        {busy ? <Spinner /> : <ShieldIcon className="h-5 w-5" />} Parolni o'zgartirish
      </button>
    </form>
  );
}

export { EditIcon };
