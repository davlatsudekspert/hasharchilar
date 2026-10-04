// Rasm tanlash (kamera yoki galereya) + ko'rinish + avtomatik siqish (≤1600px JPEG).
import { useEffect, useState } from 'react';
import { IS_NATIVE } from '../lib/config.js';
import { compressImage } from '../lib/image.js';
import { cx } from '../lib/utils.js';
import { CameraIcon, ImageIcon, RefreshIcon, TrashIcon } from './icons.jsx';
import { Spinner } from './ui.jsx';

// Sensorli qurilma (telefon/planshet) yoki APK — "Kamera" va "Galereya" alohida tugma.
// capture="environment" bo'lsa Android WebView kamerani ochadi; bo'lmasa faqat galereya/fayllar.
const isTouch = () =>
  IS_NATIVE || (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// Klaviatura fokusi ko'rinsin: input sr-only, halqa uni o'rab turgan label'da chiziladi
const focusRing = 'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-emerald-500 has-[input:focus-visible]:ring-offset-2';

/** Yashirin file input'ni o'rab turgan label-tugma. */
function PickButton({ capture, onPick, disabled, label, className, children }) {
  return (
    <label className={cx('cursor-pointer', focusRing, disabled && 'pointer-events-none opacity-60', className)}>
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="sr-only"
        onChange={onPick}
        disabled={disabled}
        aria-label={label}
      />
      {children}
    </label>
  );
}

/**
 * @param {File|null} value      tanlangan (siqilgan) rasm
 * @param {(f: File|null) => void} onChange
 * @param {(busy: boolean) => void} [onBusyChange]  siqish davom etayotganini ota-komponentga bildiradi
 */
export default function PhotoInput({ value, onChange, onBusyChange, title, hint, tone = 'emerald' }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touch] = useState(isTouch);

  // Object URL ni boshqarish (xotira oqmasligi uchun)
  useEffect(() => {
    if (!value) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const setWorking = (b) => {
    setBusy(b);
    onBusyChange?.(b);
  };

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // bir xil faylni qayta tanlash mumkin bo'lsin
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      onChange(await compressImage(file));
    } catch (err) {
      setError(err.message || "Rasmni qayta ishlab bo'lmadi");
    } finally {
      setWorking(false);
    }
  };

  const ring = tone === 'amber' ? 'border-amber-300 bg-amber-50/60 hover:bg-amber-50' : 'border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50';
  const chip = 'inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-white';
  const pickBtn = 'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-bold text-emerald-800 shadow-sm ring-1 ring-slate-200 hover:bg-emerald-50';

  return (
    <div>
      {preview ? (
        <div className="relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
          <img src={preview} alt="Tanlangan rasm" className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 pt-10">
            {touch && (
              <PickButton capture onPick={pick} disabled={busy} label={`${title} — kamera`} className={chip}>
                <CameraIcon className="h-4 w-4" /> Kamera
              </PickButton>
            )}
            <PickButton onPick={pick} disabled={busy} label={`${title} — ${touch ? 'galereya' : 'almashtirish'}`} className={chip}>
              {touch ? <ImageIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />} {touch ? 'Galereya' : 'Almashtirish'}
            </PickButton>
            {/* Telefonda uchta tugma bir qatorga sig'sin: o'chirish — faqat ikonka */}
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={busy}
              aria-label="Rasmni o'chirish"
              title="Rasmni o'chirish"
              className={cx(chip, 'text-red-700 disabled:opacity-60', touch && 'px-2.5')}
            >
              <TrashIcon className="h-4 w-4" />
              {!touch && " O'chirish"}
            </button>
          </div>
          <span className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-semibold text-white">
            {Math.max(1, Math.round(value.size / 1024))} KB
          </span>
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-white/70" role="status">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow">
                <Spinner /> Rasm tayyorlanmoqda…
              </span>
            </div>
          )}
        </div>
      ) : touch ? (
        // Telefon/APK: kamera yoki galereya
        <div className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center ${ring}`}>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm">
            {busy ? <Spinner className="h-6 w-6" /> : <CameraIcon className="h-7 w-7" />}
          </span>
          <span className="mt-1 text-base font-bold text-slate-900">{busy ? 'Rasm tayyorlanmoqda…' : title}</span>
          {hint && <span className="max-w-xs text-sm text-slate-600">{hint}</span>}
          <div className="mt-2 flex w-full max-w-xs gap-2">
            <PickButton capture onPick={pick} disabled={busy} label={`${title} — kamera`} className={pickBtn}>
              <CameraIcon className="h-5 w-5" /> Kamera
            </PickButton>
            <PickButton onPick={pick} disabled={busy} label={`${title} — galereya`} className={pickBtn}>
              <ImageIcon className="h-5 w-5" /> Galereya
            </PickButton>
          </div>
        </div>
      ) : (
        // Kompyuter: butun maydon — fayl tanlash
        <PickButton
          onPick={pick}
          disabled={busy}
          label={title}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${ring}`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm">
            {busy ? <Spinner className="h-6 w-6" /> : <CameraIcon className="h-7 w-7" />}
          </span>
          <span className="mt-1 text-base font-bold text-slate-900">{busy ? 'Rasm tayyorlanmoqda…' : title}</span>
          {hint && <span className="max-w-xs text-sm text-slate-600">{hint}</span>}
        </PickButton>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
