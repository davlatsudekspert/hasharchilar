// Rasm tanlash: native ilovada Capacitor Camera (kamera) + galereya, web'da fayl input (capture) + drag&drop.
// Tanlangan rasm avtomatik siqiladi (≤1600px JPEG).
import { useEffect, useRef, useState } from 'react';
import { IS_NATIVE } from '../lib/config.js';
import { compressImage } from '../lib/image.js';
import { haptic, HAS_NATIVE_CAMERA, onRestoredPhoto, takeNativePhoto, takeRestoredPhoto } from '../lib/native.js';
import { cx } from '../lib/utils.js';
import { CameraIcon, ImageIcon, RefreshIcon, TrashIcon } from './icons.jsx';
import { Spinner } from './ui.jsx';

const isTouch = () =>
  IS_NATIVE || (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

const focusRing = 'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-emerald-500 has-[input:focus-visible]:ring-offset-2';

function FilePick({ capture, onPick, disabled, label, className, children }) {
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
 * @param {File|null} value
 * @param {(f: File|null) => void} onChange
 * @param {(busy: boolean) => void} [onBusyChange]
 * @param {string} [restoreTag] — APK: OS kamera paytida ilovani o'ldirsa, surat shu belgi bo'yicha qaytariladi
 */
export default function PhotoInput({ value, onChange, onBusyChange, title, hint, aspect = 'aspect-[4/3]', maxSide, restoreTag }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [touch] = useState(isTouch);
  const fallbackRef = useRef(null);

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

  const accept = async (file) => {
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      onChange(await compressImage(file, maxSide ? { maxSide } : undefined));
      haptic('light');
    } catch (err) {
      setError(err.message || "Rasmni qayta ishlab bo'lmadi");
    } finally {
      setWorking(false);
    }
  };

  const pick = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    accept(file);
  };

  const nativeCamera = async () => {
    setError('');
    try {
      const f = await takeNativePhoto(restoreTag);
      if (f) accept(f);
    } catch (err) {
      // Ruxsat berilmagan — xabar; fayl tanlagichga o'tilmaydi (WebView yana ruxsat so'rab, jim rad etadi)
      if (err.kind === 'denied' || !fallbackRef.current) setError(err.message);
      // Plagin ishlamasa — tizim fayl tanlagichi (kamera bilan)
      else fallbackRef.current.click();
    }
  };

  // Ilova qayta tiklangach (appRestoredResult) — kutilayotgan surat
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (!restoreTag) return undefined;
    const check = () => {
      const f = takeRestoredPhoto(restoreTag);
      if (f) acceptRef.current(f);
    };
    check();
    return onRestoredPhoto(check);
  }, [restoreTag]);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    accept(e.dataTransfer.files && e.dataTransfer.files[0]);
  };

  const cameraBtn = (className, children) =>
    HAS_NATIVE_CAMERA ? (
      <button type="button" onClick={nativeCamera} disabled={busy} className={className}>
        {children}
      </button>
    ) : (
      <FilePick capture onPick={pick} disabled={busy} label={`${title} — kamera`} className={className}>
        {children}
      </FilePick>
    );

  const chip = 'inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-sm font-bold text-slate-800 shadow hover:bg-white';
  const pickBtn =
    'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface px-3 text-sm font-bold text-brand shadow-sm ring-1 ring-line transition hover:bg-brand-soft active:scale-[.97]';

  return (
    <div>
      {HAS_NATIVE_CAMERA && (
        <input ref={fallbackRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} tabIndex={-1} aria-hidden="true" />
      )}
      {preview ? (
        <div className="relative overflow-hidden rounded-3xl bg-surface-3 ring-1 ring-line">
          <img src={preview} alt="Tanlangan rasm" className={cx('w-full object-cover', aspect)} />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-black/65 to-transparent p-3 pt-12">
            {touch && (
              cameraBtn(
                chip,
                <>
                  <CameraIcon className="h-4 w-4" /> Kamera
                </>,
              )
            )}
            <FilePick onPick={pick} disabled={busy} label={`${title} — ${touch ? 'galereya' : 'almashtirish'}`} className={chip}>
              {touch ? <ImageIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />} {touch ? 'Galereya' : 'Almashtirish'}
            </FilePick>
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
          <span className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {Math.max(1, Math.round(value.size / 1024))} KB
          </span>
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-white/70 dark:bg-black/50" role="status">
              <span className="inline-flex items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-sm font-bold text-ink shadow">
                <Spinner /> Rasm tayyorlanmoqda…
              </span>
            </div>
          )}
        </div>
      ) : touch ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-brand-line bg-brand-soft/60 px-4 py-7 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-surface text-brand shadow-sm ring-1 ring-line">
            {busy ? <Spinner className="h-6 w-6" /> : <CameraIcon className="h-8 w-8" />}
          </span>
          <span className="mt-1 text-base font-extrabold text-ink">{busy ? 'Rasm tayyorlanmoqda…' : title}</span>
          {hint && <span className="max-w-xs text-sm text-ink-3">{hint}</span>}
          <div className="mt-3 flex w-full max-w-xs gap-2">
            {cameraBtn(
              pickBtn,
              <>
                <CameraIcon className="h-5 w-5" /> Kamera
              </>,
            )}
            <FilePick onPick={pick} disabled={busy} label={`${title} — galereya`} className={pickBtn}>
              <ImageIcon className="h-5 w-5" /> Galereya
            </FilePick>
          </div>
        </div>
      ) : (
        <FilePick
          onPick={pick}
          disabled={busy}
          label={title}
          className={cx(
            'flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition',
            drag ? 'border-emerald-500 bg-brand-soft' : 'border-brand-line bg-brand-soft/50 hover:bg-brand-soft',
          )}
        >
          <div
            className="flex w-full flex-col items-center gap-2"
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-surface text-brand shadow-sm ring-1 ring-line">
              {busy ? <Spinner className="h-6 w-6" /> : <ImageIcon className="h-8 w-8" />}
            </span>
            <span className="mt-1 text-base font-extrabold text-ink">{busy ? 'Rasm tayyorlanmoqda…' : title}</span>
            {hint && <span className="max-w-xs text-sm text-ink-3">{hint}</span>}
            <span className="mt-2 rounded-xl bg-surface px-4 py-2 text-sm font-bold text-brand ring-1 ring-line">Faylni tanlang yoki shu yerga tashlang</span>
          </div>
        </FilePick>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
