// 4 bosqichli e'lon formasi: (1) nom+tavsif (2) joy+manzil (3) sana+vaqt+narsalar (4) "Oldin" rasmi.
import { useRef, useState } from 'react';
import { cx, formatDateLong, tashkentNow, tashkentTomorrow } from '../lib/utils.js';
import { CalendarIcon, CheckIcon, ChevronLeftIcon, PinIcon, PlusIcon, XIcon } from './icons.jsx';
import LocationPicker from './LocationPicker.jsx';
import Modal from './Modal.jsx';
import PhotoInput from './PhotoInput.jsx';
import { btn, inputCls, labelCls, Spinner } from './ui.jsx';

const SUGGESTED_ITEMS = ["Qo'lqop", 'Belkurak', 'Axlat qoplari', 'Supurgi', "Ko'chat", 'Chelak', "Bo'yoq", "Cho'tka", 'Suv'];
const STEPS = ['Nima?', 'Qayerda?', 'Qachon?', 'Rasm'];
const LIMITS = { title: 120, description: 1000, address: 200, items: 12, item: 40 };

function Counter({ value, max }) {
  return (
    <span className={cx('mb-1.5 text-xs tabular-nums', value > max * 0.9 ? 'text-amber-700' : 'text-slate-400')}>
      {value}/{max}
    </span>
  );
}

function FieldError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm font-medium text-red-600">
      {children}
    </p>
  );
}

export default function CreateHasharModal({ onSubmit, onClose, center }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false); // rasm hali siqilmoqda — yuborish kutadi
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [f, setF] = useState({
    title: '',
    description: '',
    address: '',
    location: null,
    date: tashkentTomorrow(),
    time: '09:00',
    items: ["Qo'lqop", 'Axlat qoplari'],
    photo: null,
  });
  const [customItem, setCustomItem] = useState('');
  const bodyRef = useRef(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggleItem = (it) =>
    setF((s) => {
      if (s.items.includes(it)) return { ...s, items: s.items.filter((x) => x !== it) };
      if (s.items.length >= LIMITS.items) return s;
      return { ...s, items: [...s.items, it] };
    });
  const addCustom = () => {
    const v = customItem.trim().replace(/\s+/g, ' ').slice(0, LIMITS.item);
    if (!v) return;
    if (f.items.length >= LIMITS.items) {
      setErrors({ items: `Ko'pi bilan ${LIMITS.items} ta narsa` });
      return;
    }
    if (!f.items.some((x) => x.toLowerCase() === v.toLowerCase())) setF((s) => ({ ...s, items: [...s.items, v] }));
    setCustomItem('');
    setErrors({});
  };

  // Bosqich tekshiruvi — xatolar obyekti (bo'sh bo'lsa o'tish mumkin)
  const validate = (i) => {
    const e = {};
    if (i === 0) {
      // Belgilar (code point) bo'yicha — server va DB bilan bir xil (emoji = 1 belgi)
      const t = [...f.title.trim()].length;
      if (t < 3) e.title = "Nom kamida 3 ta belgidan iborat bo'lsin";
      else if (t > LIMITS.title) e.title = `Nom ${LIMITS.title} belgidan oshmasin`;
      if (f.description.length > LIMITS.description) e.description = `Tavsif ${LIMITS.description} belgidan oshmasin`;
    }
    if (i === 1) {
      if (!f.location) e.location = 'Xaritada hashar joyini belgilang';
      if (f.address.length > LIMITS.address) e.address = `Manzil ${LIMITS.address} belgidan oshmasin`;
    }
    if (i === 2) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.date = 'Sanani tanlang';
      else if (!/^\d{2}:\d{2}$/.test(f.time)) e.date = 'Vaqtni tanlang';
      else if (`${f.date}T${f.time}` < tashkentNow()) e.date = "Sana va vaqt o'tmishda bo'lmasligi kerak";
      if (f.items.length > LIMITS.items) e.items = `Ko'pi bilan ${LIMITS.items} ta narsa`;
    }
    return e;
  };

  const goTo = (next) => {
    setStep(next);
    setErrors({});
    setSubmitError('');
    bodyRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 });
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) goTo(step + 1);
  };

  const submit = async () => {
    if (photoBusy) return; // tanlangan rasm siqilib bo'lmaguncha yubormaymiz
    // Barcha bosqichlarni qayta tekshiramiz
    for (let i = 0; i < 3; i++) {
      const e = validate(i);
      if (Object.keys(e).length) {
        setStep(i);
        setErrors(e);
        return;
      }
    }
    setBusy(true);
    setSubmitError('');
    const fd = new FormData();
    fd.set('title', f.title.trim());
    fd.set('description', f.description.trim());
    fd.set('address', f.address.trim());
    fd.set('lat', String(f.location.lat));
    fd.set('lng', String(f.location.lng));
    fd.set('date_time', `${f.date}T${f.time}`);
    fd.set('items', JSON.stringify(f.items));
    if (f.photo) fd.set('photo', f.photo, f.photo.name || 'oldin.jpg');
    try {
      await onSubmit(fd);
    } catch (err) {
      setSubmitError(err.message);
      setBusy(false);
    }
  };

  const footer = (
    <div className="flex gap-3">
      {step > 0 && (
        <button type="button" onClick={() => goTo(step - 1)} disabled={busy} className={cx(btn.ghost, 'h-12 px-4')}>
          <ChevronLeftIcon className="h-5 w-5" /> Orqaga
        </button>
      )}
      {step < 3 ? (
        <button type="button" onClick={next} className={cx(btn.primary, 'h-12 flex-1 text-base')}>
          Keyingi
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={busy || photoBusy} className={cx(btn.cta, 'h-12 flex-1 text-base')}>
          {busy || photoBusy ? (
            <>
              <Spinner /> {busy ? 'Yuborilmoqda…' : 'Rasm tayyorlanmoqda…'}
            </>
          ) : (
            "E'lon qilish"
          )}
        </button>
      )}
    </div>
  );

  return (
    <Modal
      title="Yangi hashar e'lon qilish"
      subtitle={`${step + 1}-bosqich / 4`}
      onClose={busy ? () => {} : onClose}
      footer={footer}
      size="md"
    >
      <div ref={bodyRef}>
        {/* Bosqich ko'rsatkichi */}
        <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Bosqichlar">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined}>
              <div className={cx('h-1.5 rounded-full transition-colors', i <= step ? 'bg-emerald-600' : 'bg-slate-200')} />
              <span
                className={cx(
                  'mt-1.5 flex items-center gap-1 text-xs font-bold',
                  i === step ? 'text-emerald-700' : i < step ? 'text-slate-600' : 'text-slate-400',
                )}
              >
                {i < step && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
                {s}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-4">
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
                placeholder="Masalan: Bog'ni tozalash"
                value={f.title}
                onChange={set('title')}
                maxLength={LIMITS.title}
                aria-invalid={!!errors.title}
              />
              <FieldError>{errors.title}</FieldError>
            </div>
            <div>
              <div className="flex items-end justify-between">
                <label htmlFor="h-desc" className={labelCls}>
                  Tavsif <span className="font-normal text-slate-400">(ixtiyoriy)</span>
                </label>
                <Counter value={f.description.length} max={LIMITS.description} />
              </div>
              <textarea
                id="h-desc"
                className={cx(inputCls, 'min-h-[120px] resize-y')}
                rows={4}
                placeholder="Nima qilamiz? Kimlar kerak? Qayerda yig'ilamiz?"
                value={f.description}
                onChange={set('description')}
                maxLength={LIMITS.description}
              />
              <FieldError>{errors.description}</FieldError>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <LocationPicker value={f.location} center={center} onChange={(location) => {
                  setF((s) => ({ ...s, location }));
                  setErrors((e) => ({ ...e, location: undefined }));
                }}
              />
              <FieldError>{errors.location}</FieldError>
            </div>
            <div>
              <div className="flex items-end justify-between">
                <label htmlFor="h-addr" className={labelCls}>
                  Manzil <span className="font-normal text-slate-400">(mahalla, ko'cha, mo'ljal)</span>
                </label>
                <Counter value={f.address.length} max={LIMITS.address} />
              </div>
              <input
                id="h-addr"
                className={inputCls}
                placeholder="Masalan: Chilonzor 9-kvartal, 12-uy oldi"
                value={f.address}
                onChange={set('address')}
                maxLength={LIMITS.address}
              />
              <FieldError>{errors.address}</FieldError>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
              <div>
                <label htmlFor="h-date" className={labelCls}>
                  Sana
                </label>
                <input
                  id="h-date"
                  type="date"
                  className={inputCls}
                  value={f.date}
                  min={tashkentNow().slice(0, 10)}
                  onChange={set('date')}
                />
              </div>
              <div>
                <label htmlFor="h-time" className={labelCls}>
                  Vaqt
                </label>
                <input id="h-time" type="time" className={inputCls} value={f.time} onChange={set('time')} />
              </div>
            </div>
            {errors.date ? (
              <FieldError>{errors.date}</FieldError>
            ) : (
              f.date &&
              f.time && (
                <p className="-mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CalendarIcon className="h-4 w-4" /> {formatDateLong(`${f.date}T${f.time}`)} (Toshkent vaqti)
                </p>
              )
            )}

            <div>
              <div className="flex items-end justify-between">
                <span className={labelCls}>Kerakli narsalar</span>
                <span className="mb-1.5 text-xs text-slate-400">
                  {f.items.length}/{LIMITS.items}
                </span>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Kerakli narsalar">
                {[...new Set([...SUGGESTED_ITEMS, ...f.items])].map((it) => {
                  const on = f.items.includes(it);
                  return (
                    <button
                      type="button"
                      key={it}
                      aria-pressed={on}
                      onClick={() => toggleItem(it)}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                        on
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-800',
                      )}
                    >
                      {on ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /> : <PlusIcon className="h-3.5 w-3.5" />}
                      {it}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  className={inputCls}
                  placeholder="Boshqa narsa qo'shish…"
                  aria-label="Boshqa narsa"
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
                <button type="button" onClick={addCustom} aria-label="Qo'shish" className={cx(btn.soft, 'w-12 shrink-0')}>
                  <PlusIcon className="h-5 w-5" strokeWidth={2.6} />
                </button>
              </div>
              <FieldError>{errors.items}</FieldError>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <PhotoInput
              value={f.photo}
              onChange={(photo) => setF((s) => ({ ...s, photo }))}
              onBusyChange={setPhotoBusy}
              title={'"Oldin" rasmini yuklang'}
              hint="Hozirgi holatni suratga oling — hashardan keyin natijani solishtiramiz. Ixtiyoriy."
            />
            {/* Qisqa xulosa */}
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tekshirib oling</p>
              <p className="mt-1.5 font-bold text-slate-900">{f.title.trim()}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <CalendarIcon className="h-4 w-4 text-slate-400" /> {formatDateLong(`${f.date}T${f.time}`)}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                <PinIcon className="h-4 w-4 text-slate-400" /> {f.address.trim() || 'Xaritada belgilangan joy'}
              </p>
              {f.items.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {f.items.map((it) => (
                    <li key={it} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                      {it}
                      <button type="button" aria-label={`${it} — olib tashlash`} onClick={() => toggleItem(it)} className="text-slate-400 hover:text-red-600">
                        <XIcon className="h-3 w-3" strokeWidth={3} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {submitError && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
