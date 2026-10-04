// Hashar e'lon qilish (sahifa, 4 qadam): (1) kategoriya + nom + tavsif (2) xaritada joy + manzil
// (3) sana, vaqt, ko'ngillilar soni, narsalar (4) "Oldin" rasmi + ko'rib chiqish. Qoralama saqlanadi.
import { useEffect, useRef, useState } from 'react';
import AuthForm from '../components/AuthForm.jsx';
import { Thumb } from '../components/HasharCard.jsx';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CATEGORY_ICONS,
  CheckIcon,
  ClockIcon,
  MinusIcon,
  PinIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from '../components/icons.jsx';
import { LocationPicker } from '../components/map/index.jsx';
import PhotoInput from '../components/PhotoInput.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, CategoryChip, inputCls, labelCls, Spinner } from '../components/ui.jsx';
import { needsEmailVerify, useActions } from '../lib/actions.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES } from '../lib/meta.js';
import { registerBackHandler } from '../lib/modals.js';
import { haptic, onRestoredPhoto, peekRestoredPhoto } from '../lib/native.js';
import { goBack, navigate } from '../lib/router.js';
import { storage } from '../lib/storage.js';
import { invalidate, prime } from '../lib/store.js';
import { cx, formatDateLong, TASHKENT, tashkentNow, tashkentTomorrow } from '../lib/utils.js';

const SUGGESTED_ITEMS = ["Qo'lqop", 'Belkurak', 'Axlat qoplari', 'Supurgi', "Ko'chat", 'Chelak', "Bo'yoq", "Cho'tka", 'Suv', 'Tirma', 'Etik'];
const STEPS = [
  { title: 'Nima?', text: 'Kategoriya va nom' },
  { title: 'Qayerda?', text: 'Xaritada joy' },
  { title: 'Qachon?', text: 'Sana va tafsilotlar' },
  { title: 'Rasm', text: 'Oldin rasmi' },
];
const LIMITS = { title: 120, description: 1000, address: 200, items: 12, item: 40 };
const DRAFT_KEY = 'hashar_create_draft';
const PHOTO_TAG = 'create';
const TIMES = ['07:00', '08:00', '09:00', '10:00', '15:00', '16:00', '17:00'];

function Counter({ value, max }) {
  return <span className={cx('mb-1.5 text-xs tabular', value > max * 0.9 ? 'text-amber-600' : 'text-ink-3')}>{value}/{max}</span>;
}
function FieldError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm font-medium text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

// Eski qoralamalarda xarita tegilmasa ham Toshkent markazi (va uning avtomatik manzili) saqlanib qolardi
const isDefaultCentre = (l) => !!l && l.lat === TASHKENT.lat && l.lng === TASHKENT.lng;

const initial = () => {
  const d = storage.getJSON(DRAFT_KEY, null) || {};
  const legacy = isDefaultCentre(d.location);
  const location = !legacy && d.location && Number.isFinite(d.location.lat) && Number.isFinite(d.location.lng) ? d.location : null;
  return {
    category: d.category || 'cleaning',
    title: d.title || '',
    description: d.description || '',
    address: legacy ? '' : d.address || '',
    location,
    date: d.date && d.date >= tashkentNow().slice(0, 10) ? d.date : tashkentTomorrow(),
    time: d.time || '09:00',
    max: d.max ?? null,
    items: Array.isArray(d.items) ? d.items : ["Qo'lqop", 'Axlat qoplari'],
    photo: null,
  };
};

export default function CreatePage() {
  const { user, ready } = useAuth();
  const { requireVerified } = useActions();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [customItem, setCustomItem] = useState('');
  const autoAddress = useRef(!f.address);
  const topRef = useRef(null);

  // Emaili tasdiqlanmagan foydalanuvchi — sahifaga kirganda (forma to'ldirilishidan oldin) "Emailni tasdiqlang"
  const uid = user?.id;
  useEffect(() => {
    if (ready && uid && needsEmailVerify(user)) requireVerified('create');
    // faqat foydalanuvchi o'zgarganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid]);

  // Qoralama (rasmsiz)
  useEffect(() => {
    const { photo, ...rest } = f;
    storage.setJSON(DRAFT_KEY, rest);
  }, [f]);

  const [photoUrl, setPhotoUrl] = useState(null);
  useEffect(() => {
    if (!f.photo) {
      setPhotoUrl(null);
      return undefined;
    }
    const u = URL.createObjectURL(f.photo);
    setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [f.photo]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }, [step]);

  // Android "orqaga": sahifadan chiqmasdan oldingi qadamga (ekrandagi "Orqaga" kabi)
  useEffect(() => {
    if (step === 0) return undefined;
    return registerBackHandler(() => (setStep((s) => Math.max(0, s - 1)), true));
  }, [step]);

  // APK: OS kamera paytida ilovani o'ldirgan bo'lsa — rasm qadamiga qaytamiz (PhotoInput suratni oladi)
  useEffect(() => {
    const check = () => peekRestoredPhoto(PHOTO_TAG) && setStep(STEPS.length - 1);
    check();
    return onRestoredPhoto(check);
  }, []);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggleItem = (it) =>
    setF((s) => {
      const has = s.items.includes(it);
      if (!has && s.items.length >= LIMITS.items) return s;
      haptic('select');
      return { ...s, items: has ? s.items.filter((x) => x !== it) : [...s.items, it] };
    });
  const addCustom = () => {
    const v = customItem.trim().slice(0, LIMITS.item);
    if (!v) return;
    setF((s) => (s.items.includes(v) || s.items.length >= LIMITS.items ? s : { ...s, items: [...s.items, v] }));
    setCustomItem('');
  };

  const validate = (i) => {
    const e = {};
    if (i === 0) {
      if (f.title.trim().length < 3) e.title = 'Nomi kamida 3 ta belgi bo\'lsin';
      if (f.title.length > LIMITS.title) e.title = `Nomi ${LIMITS.title} belgidan oshmasin`;
      if (f.description.length > LIMITS.description) e.description = 'Tavsif juda uzun';
    }
    if (i === 1) {
      if (!f.location) e.location = "Joy tanlanmagan: xaritani surib pinni joyga keltiring yoki manzilni qidiring";
      if (f.address.length > LIMITS.address) e.address = 'Manzil juda uzun';
    }
    if (i === 2) {
      if (!f.date || !f.time) e.date = 'Sana va vaqtni tanlang';
      else if (`${f.date}T${f.time}` < tashkentNow(-60)) e.date = "Sana o'tmishda bo'lmasin";
      if (f.max != null && (f.max < 2 || f.max > 1000)) e.max = "Ko'ngillilar soni 2 dan 1000 gacha";
    }
    setErrors(e);
    if (Object.keys(e).length) haptic('error');
    return !Object.keys(e).length;
  };

  const next = () => {
    if (!validate(step)) return;
    haptic('light');
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => (step === 0 ? goBack('/') : setStep((s) => s - 1));

  const submit = async () => {
    for (let i = 0; i < 3; i++) {
      if (!validate(i)) {
        setStep(i);
        return;
      }
    }
    if (!(await requireVerified('create'))) return;
    setBusy(true);
    setSubmitError('');
    try {
      const fd = new FormData();
      fd.set('title', f.title.trim());
      fd.set('description', f.description.trim());
      fd.set('address', f.address.trim());
      fd.set('lat', String(f.location.lat));
      fd.set('lng', String(f.location.lng));
      fd.set('date_time', `${f.date}T${f.time}`);
      fd.set('items', JSON.stringify(f.items));
      fd.set('category', f.category);
      if (f.max) fd.set('max_volunteers', String(f.max));
      if (f.photo) fd.set('photo', f.photo, f.photo.name || 'oldin.jpg');
      const created = await api.createHashar(fd);
      storage.remove(DRAFT_KEY);
      haptic('success');
      toast("Hashar e'lon qilindi! 🎉");
      invalidate('hashars', 'stats', 'me:', 'user:', 'leaderboard');
      prime(`hashar:${created.id}`, created);
      navigate(`/hashar/${created.id}`, { replace: true });
    } catch (e) {
      setSubmitError(e.message);
      haptic('error');
      setBusy(false);
    }
  };

  // ---- Kirish talab qilinadi ----
  if (ready && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-soft sm:p-8">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 shadow-cta">
            <PlusIcon className="h-7 w-7" strokeWidth={2.6} />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">Hashar e'lon qilish</h1>
          <p className="mt-1 mb-5 text-sm text-ink-3">Avval tizimga kiring — bu bor-yo'g'i bir daqiqa.</p>
          <AuthForm />
        </div>
      </div>
    );
  }

  const cat = CATEGORIES.find((c) => c.id === f.category) || CATEGORIES[0];
  const preview = {
    id: 0,
    title: f.title || 'Hashar nomi',
    category: f.category,
    status: 'PENDING',
    before_url: null,
    after_url: null,
  };

  return (
    <div ref={topRef} className="mx-auto max-w-6xl px-4 pb-36 pt-4 lg:px-6 lg:pb-16 lg:pt-8">
      {/* Sarlavha + qadamlar */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label="Orqaga" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-ink-2 shadow-sm active:scale-95">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">
            {step + 1}-qadam / {STEPS.length}
          </p>
          <h1 className="truncate text-2xl font-extrabold text-ink sm:text-3xl">Hashar e'lon qilish</h1>
        </div>
        <button type="button" onClick={() => goBack('/')} aria-label="Bekor qilish" className="grid h-11 w-11 place-items-center rounded-2xl text-ink-3 hover:bg-surface-2">
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Qadamlar">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className="w-full text-left disabled:cursor-default"
              aria-current={i === step ? 'step' : undefined}
            >
              <span className={cx('block h-1.5 rounded-full transition-colors', i <= step ? 'bg-emerald-500' : 'bg-surface-3')} />
              <span className={cx('mt-2 flex items-center gap-1.5 text-xs font-bold sm:text-sm', i === step ? 'text-ink' : i < step ? 'text-brand' : 'text-ink-3')}>
                {i < step && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
                {s.title}
              </span>
              <span className="hidden text-xs text-ink-3 sm:block">{s.text}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div key={step} className="page-enter rounded-[28px] border border-line bg-surface p-5 shadow-soft sm:p-7">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <p className={labelCls}>Kategoriya</p>
                <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Kategoriya">
                  {CATEGORIES.map((c) => {
                    const Icon = CATEGORY_ICONS[c.id];
                    const active = f.category === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          haptic('select');
                          setF((s) => ({ ...s, category: c.id }));
                        }}
                        className={cx(
                          // Telefonda: ikonka tepada, nom pastda (tor ustunda so'z bo'linmasin); sm+ — yonma-yon + tavsif
                          'relative flex flex-col items-start gap-2.5 rounded-2xl p-3.5 text-left transition active:scale-[0.98] sm:flex-row sm:gap-3',
                          active ? 'bg-brand-soft ring-2 ring-emerald-500' : 'bg-surface-2 ring-1 ring-line hover:ring-line-strong',
                        )}
                      >
                        <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', c.tint)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 sm:pr-6">
                          {/* Faqat yumshoq tire (&shy;) joyida bo'linadi — harf o'rtasida emas */}
                          <span className="block text-sm font-extrabold leading-tight text-ink [hyphens:manual]">{c.label}</span>
                          <span className="mt-0.5 hidden text-xs leading-snug text-ink-3 sm:block">{c.text}</span>
                        </span>
                        {active && (
                          <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white shadow-sm">
                            <CheckIcon className="h-3 w-3" strokeWidth={3.5} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-end justify-between">
                  <label htmlFor="h-title" className={labelCls}>
                    Hashar nomi
                  </label>
                  <Counter value={f.title.length} max={LIMITS.title} />
                </div>
                <input
                  id="h-title"
                  className={inputCls}
                  placeholder="Masalan: Mahalla bog'ini tozalash"
                  value={f.title}
                  maxLength={LIMITS.title}
                  onChange={set('title')}
                  aria-invalid={!!errors.title}
                />
                <FieldError>{errors.title}</FieldError>
              </div>
              <div>
                <div className="flex items-end justify-between">
                  <label htmlFor="h-desc" className={labelCls}>
                    Tavsif <span className="font-normal text-ink-3">(ixtiyoriy)</span>
                  </label>
                  <Counter value={f.description.length} max={LIMITS.description} />
                </div>
                <textarea
                  id="h-desc"
                  rows={5}
                  className={cx(inputCls, 'resize-y')}
                  placeholder="Nima qilamiz? Kimlar kerak? Qayerda yig'ilamiz?"
                  value={f.description}
                  maxLength={LIMITS.description}
                  onChange={set('description')}
                />
                <FieldError>{errors.description}</FieldError>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className={labelCls}>Xaritada joyni belgilang</p>
                <LocationPicker
                  value={f.location}
                  onChange={(p) => {
                    setF((s) => ({ ...s, location: p }));
                    // joy tanlandi — eski "Joy tanlanmagan" xatosi qolib ketmasin
                    if (p) setErrors((er) => (er.location ? { ...er, location: undefined } : er));
                  }}
                  onReverse={(r) => {
                    if (r && r.display && autoAddress.current) setF((s) => ({ ...s, address: String(r.display).slice(0, LIMITS.address) }));
                  }}
                  wantAddress={() => autoAddress.current}
                />
                <FieldError>{errors.location}</FieldError>
              </div>
              <div>
                <div className="flex items-end justify-between">
                  <label htmlFor="h-addr" className={labelCls}>
                    Manzil <span className="font-normal text-ink-3">(avtomatik aniqlanadi, tahrirlash mumkin)</span>
                  </label>
                  <Counter value={f.address.length} max={LIMITS.address} />
                </div>
                <div className="relative">
                  <PinIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
                  <input
                    id="h-addr"
                    className={cx(inputCls, 'pl-12')}
                    placeholder="Masalan: Chilonzor tumani, 9-kvartal, 12-uy oldi"
                    value={f.address}
                    maxLength={LIMITS.address}
                    onChange={(e) => {
                      autoAddress.current = !e.target.value;
                      setF((s) => ({ ...s, address: e.target.value }));
                    }}
                  />
                </div>
                <FieldError>{errors.address}</FieldError>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="h-date" className={labelCls}>
                    Sana
                  </label>
                  <input id="h-date" type="date" className={inputCls} value={f.date} min={tashkentNow().slice(0, 10)} onChange={set('date')} />
                </div>
                <div>
                  <label htmlFor="h-time" className={labelCls}>
                    Vaqt
                  </label>
                  <input id="h-time" type="time" className={inputCls} value={f.time} onChange={set('time')} />
                </div>
              </div>
              <div className="no-scrollbar -mt-3 flex gap-1.5 overflow-x-auto">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setF((s) => ({ ...s, time: t }))}
                    className={cx('shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold tabular transition', f.time === t ? 'bg-emerald-600 text-white' : 'bg-surface-2 text-ink-2 ring-1 ring-line')}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {f.date && <p className="-mt-2 flex items-center gap-2 text-sm font-semibold text-brand"><CalendarIcon className="h-4 w-4" /> {formatDateLong(`${f.date}T${f.time}`)}</p>}
              <FieldError>{errors.date}</FieldError>

              <div>
                <p className={labelCls}>Ko'ngillilar soni</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setF((s) => ({ ...s, max: null }))}
                    className={cx('rounded-2xl px-4 py-2.5 text-sm font-bold transition', f.max == null ? 'bg-brand-soft text-brand ring-2 ring-emerald-500' : 'bg-surface-2 text-ink-2 ring-1 ring-line')}
                  >
                    Cheklanmagan
                  </button>
                  <div className={cx('flex items-center gap-1 rounded-2xl p-1 ring-1', f.max != null ? 'bg-brand-soft ring-2 ring-emerald-500' : 'bg-surface-2 ring-line')}>
                    <button type="button" aria-label="Kamaytirish" onClick={() => setF((s) => ({ ...s, max: Math.max(2, (s.max ?? 12) - 1) }))} className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-ink shadow-sm">
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <label htmlFor="h-max" className="sr-only">
                      Maksimal ko'ngillilar soni
                    </label>
                    <input
                      id="h-max"
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={1000}
                      placeholder="—"
                      value={f.max ?? ''}
                      onChange={(e) => setF((s) => ({ ...s, max: e.target.value === '' ? null : Math.max(0, Math.min(1000, Number(e.target.value) || 0)) }))}
                      className="w-16 bg-transparent text-center font-display text-lg font-extrabold text-ink tabular outline-none"
                    />
                    <button type="button" aria-label="Ko'paytirish" onClick={() => setF((s) => ({ ...s, max: Math.min(1000, (s.max ?? 9) + 1) }))} className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-ink shadow-sm">
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-sm text-ink-3 max-sm:hidden">kishi</span>
                </div>
                <FieldError>{errors.max}</FieldError>
              </div>

              <div>
                <div className="flex items-end justify-between">
                  <p className={labelCls}>Kerakli narsalar</p>
                  <Counter value={f.items.length} max={LIMITS.items} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...SUGGESTED_ITEMS, ...f.items])].map((it) => {
                    const on = f.items.includes(it);
                    return (
                      <button
                        key={it}
                        type="button"
                        onClick={() => toggleItem(it)}
                        aria-pressed={on}
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95',
                          on ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950' : 'bg-surface-2 text-ink-2 ring-1 ring-line hover:text-ink',
                        )}
                      >
                        {on ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /> : <PlusIcon className="h-3.5 w-3.5" />} {it}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <label htmlFor="h-item" className="sr-only">
                    Boshqa narsa qo'shish
                  </label>
                  <input
                    id="h-item"
                    className={cx(inputCls, 'py-2.5')}
                    placeholder="Boshqa narsa…"
                    value={customItem}
                    maxLength={LIMITS.item}
                    onChange={(e) => setCustomItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                  />
                  <button type="button" onClick={addCustom} className={cx(btn.soft, 'px-4')}>
                    Qo'shish
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className={labelCls}>
                  "Oldin" rasmi <span className="font-normal text-ink-3">(tavsiya etiladi)</span>
                </p>
                <PhotoInput
                  value={f.photo}
                  onChange={(p) => setF((s) => ({ ...s, photo: p }))}
                  onBusyChange={setPhotoBusy}
                  restoreTag={PHOTO_TAG}
                  title="Joyning hozirgi holatini suratga oling"
                  hint="Hashar yakunlangach 'Keyin' rasmi bilan solishtiriladi"
                />
              </div>
              <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
                  <SparklesIcon className="h-4 w-4 text-brand" /> Tekshirib chiqing
                </p>
                <dl className="mt-3 grid gap-2 text-sm">
                  {[
                    ['Kategoriya', cat.label],
                    ['Nomi', f.title],
                    ['Manzil', f.address || (f.location ? `${f.location.lat.toFixed(4)}, ${f.location.lng.toFixed(4)}` : '—')],
                    ['Vaqt', formatDateLong(`${f.date}T${f.time}`)],
                    ["Ko'ngillilar", f.max ? `${f.max} kishigacha` : 'Cheklanmagan'],
                    ['Narsalar', f.items.join(', ') || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="break-words font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {submitError && (
                <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {submitError}
                </p>
              )}
            </div>
          )}

          {/* Desktop tugmalar */}
          <div className="mt-8 hidden items-center justify-between gap-3 lg:flex">
            <button type="button" onClick={back} className={cx(btn.ghost, 'h-12 px-5')}>
              <ArrowLeftIcon className="h-4 w-4" /> {step === 0 ? 'Bekor qilish' : 'Orqaga'}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className={cx(btn.primary, 'h-12 px-7')}>
                Davom etish <ArrowRightIcon className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={busy || photoBusy} className={cx(btn.cta, 'h-12 px-7')}>
                {busy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} E'lon qilish
              </button>
            )}
          </div>
        </div>

        {/* Jonli ko'rinish (desktop) */}
        <aside className="hidden lg:sticky lg:top-[96px] lg:block">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">Jonli ko'rinish</p>
          <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lift">
            <div className="relative aspect-[16/10]">
              {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <Thumb hashar={preview} className="h-full w-full" iconClass="h-14 w-14" />}
              <div className="absolute left-3 top-3">
                <CategoryChip category={f.category} short className="bg-white/95 text-slate-800 shadow-sm dark:bg-slate-950/80 dark:text-white" />
              </div>
            </div>
            <div className="p-4">
              <p className="line-clamp-2 font-display text-[17px] font-extrabold leading-snug text-ink [overflow-wrap:anywhere]">{f.title || 'Hashar nomi'}</p>
              <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-ink-3">
                <PinIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{f.address || 'Manzil'}</span>
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-3">
                <ClockIcon className="h-4 w-4" /> {formatDateLong(`${f.date}T${f.time}`)}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                  <UsersIcon className="h-4 w-4 text-brand" /> 1{f.max ? `/${f.max}` : ''}
                </span>
                <span className={cx(btn.cta, 'h-9 px-3.5 text-sm')}>Qatnashish</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">Siz tashkilotchi sifatida avtomatik qatnashuvchi bo'lasiz. Qoralama avtomatik saqlanadi.</p>
        </aside>
      </div>

      {/* Mobil: pastki tugmalar */}
      <div className="glass fixed inset-x-0 bottom-0 z-[1200] border-t border-line px-4 pb-[calc(12px+var(--sab))] pt-3 lg:hidden">
        <div className="mx-auto flex max-w-md gap-3">
          <button type="button" onClick={back} className={cx(btn.ghost, 'h-13 px-5 py-3.5')}>
            {step === 0 ? 'Bekor' : 'Orqaga'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className={cx(btn.primary, 'h-13 flex-1 py-3.5 text-base')}>
              Davom etish <ArrowRightIcon className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={busy || photoBusy} className={cx(btn.cta, 'h-13 flex-1 py-3.5 text-base')}>
              {busy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} E'lon qilish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
