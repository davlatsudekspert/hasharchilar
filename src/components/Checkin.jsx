// QR davomat: tashkilotchi uchun "Davomat QR" oynasi (server imzolagan kod, muddati tugashidan oldin avtomatik
// yangilanadi, kelganlar ro'yxati) va ko'ngilli uchun "Davomatni tasdiqlash" (APK — skaner, saytda — kodni kiritish).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActions } from '../lib/actions.jsx';
import { api } from '../lib/api.js';
import { haptic } from '../lib/native.js';
import { invalidate } from '../lib/store.js';
import { cx, timeAgo } from '../lib/utils.js';
import { scannerSupported, scanQr } from '../native/scanner.js';
import { AlertIcon, CheckIcon, ClockIcon, QrIcon, RefreshIcon, ScanIcon, UsersIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import SuccessBurst from './SuccessBurst.jsx';
import { Avatar, btn, Spinner } from './ui.jsx';

const TASHKENT_MS = 5 * 3600e3;
const OPEN_MS = 12 * 3600e3;

/** Davomat oynasi ochiqmi (server bilan bir xil: boshlanishdan 12 soat oldin — 12 soat keyin). */
export function checkinOpen(h, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(h?.date_time || ''));
  if (!m) return false;
  const start = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - TASHKENT_MS;
  return now >= start - OPEN_MS && now <= start + OPEN_MS;
}

/** Skaner/havola matnidan 6 xonali kod: "...?checkin=123456" yoki "123 456". */
export function parseCheckinCode(raw) {
  const s = String(raw || '').trim();
  const m = /[?&]checkin=(\d{6})\b/.exec(s);
  if (m) return m[1];
  const d = s.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(d) ? d : null;
}

const fmtCode = (c) => `${c.slice(0, 3)} ${c.slice(3)}`;

// ---------------- Tashkilotchi: Davomat QR ----------------
export function OwnerQrSheet({ hashar: h, onClose }) {
  const [code, setCode] = useState(null); // {code, url, expires_at, window_seconds}
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);
  const [left, setLeft] = useState(0);
  const [att, setAtt] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const r = await api.checkinCode(h.id);
      setCode(r);
      setError(null);
      const QRCode = (await import('qrcode')).default;
      setQr(await QRCode.toDataURL(r.url || r.code, { margin: 1, width: 600, errorCorrectionLevel: 'M', color: { dark: '#0b1f17', light: '#ffffff' } }));
      // Muddati tugagach (+1 s) yangi kod — eskisi ham yana 10 daqiqa qabul qilinadi
      const ms = Math.max(5, Number(r.refresh_in) || 60) * 1000 + 1000;
      timer.current = setTimeout(load, ms);
    } catch (e) {
      setError(e);
      if (e.status !== 409 && e.status !== 403 && e.status !== 404) timer.current = setTimeout(load, 15000);
    }
  }, [h.id]);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);

  // Qolgan vaqt (soniya)
  useEffect(() => {
    if (!code) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(code.expires_at) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [code]);

  // Kelganlar ro'yxati — 15 s da
  useEffect(() => {
    let alive = true;
    const get = () =>
      api
        .attendance(h.id)
        .then((r) => alive && setAtt(r))
        .catch(() => {});
    get();
    const t = setInterval(() => document.visibilityState === 'visible' && get(), 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [h.id]);

  const windowSec = (code && code.window_seconds) || 600;
  const pct = Math.min(100, (left / windowSec) * 100);
  const items = (att && Array.isArray(att.items) && att.items) || [];

  return (
    <Modal title="Davomat QR" subtitle="Ko'ngillilar shu kodni skanerlaydi yoki raqamlarni kiritadi" onClose={onClose} size="md" autoFocus={false}>
      {error && !code ? (
        <div className="rounded-3xl bg-surface-2 p-6 text-center ring-1 ring-line" role="alert" data-testid="qr-error">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            {error.code === 'checkin_closed' ? <ClockIcon className="h-7 w-7" /> : <AlertIcon className="h-7 w-7" />}
          </span>
          <p className="mt-3 font-bold text-ink">{error.code === 'checkin_closed' ? 'Davomat hali ochilmagan' : "Kodni olib bo'lmadi"}</p>
          <p className="mt-1 text-sm text-ink-3">{error.message}</p>
          {error.code !== 'checkin_closed' && (
            <button type="button" onClick={load} className={cx(btn.primary, 'mt-4 h-11 px-5 text-sm')}>
              <RefreshIcon className="h-4 w-4" /> Qayta urinish
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative rounded-[28px] bg-white p-4 shadow-lift ring-1 ring-black/5">
            {qr ? (
              <img src={qr} alt={`Davomat QR kodi: ${code ? fmtCode(code.code) : ''}`} width={260} height={260} className="block h-[260px] w-[260px] [image-rendering:pixelated]" data-testid="qr-image" />
            ) : (
              <div className="skeleton h-[260px] w-[260px] rounded-2xl" />
            )}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-ink-3">Yoki kodni kiriting</p>
          <p className="mt-1 font-display text-[40px] font-extrabold tracking-[0.12em] text-ink tabular" data-testid="qr-code">
            {code ? fmtCode(code.code) : '••• •••'}
          </p>
          <div className="mt-2 w-full max-w-[300px]">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-center text-xs font-semibold text-ink-3">
              Kod {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} dan keyin avtomatik yangilanadi
            </p>
          </div>
        </div>
      )}

      <section className="mt-6 rounded-3xl border border-line bg-surface-2/60 p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <UsersIcon className="h-4 w-4 text-brand" /> Kelganlar
          </h3>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-extrabold text-brand tabular" data-testid="attendance-count">
            {att ? `${att.checked_in || 0} / ${att.total || 0}` : '…'}
          </span>
        </div>
        {att && items.length === 0 && <p className="mt-3 text-sm text-ink-3">Hali hech kim qo'shilmagan.</p>}
        {items.length > 0 && (
          <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {items.map((it) => (
              <li key={it.user.id} className="flex items-center gap-2.5 rounded-xl bg-surface px-2.5 py-2 ring-1 ring-line">
                <Avatar name={it.user.name} src={it.user.avatar_url} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{it.user.name}</span>
                {it.checked_in_at ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-800 dark:bg-brand-400/15 dark:text-brand-300">
                    <CheckIcon className="h-3 w-3" strokeWidth={3} /> {timeAgo(it.checked_in_at)}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-ink-3">kutilmoqda</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}

// ---------------- Ko'ngilli: davomatni tasdiqlash ----------------
export function CheckinSheet({ hashar: h, initialCode = '', onClose, onDone }) {
  const { requireVerified } = useActions();
  const [code, setCode] = useState(() => parseCheckinCode(initialCode) || '');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState(null);
  const canScan = scannerSupported();
  const autoTried = useRef(false);
  const inputRef = useRef(null);

  // Xato: maydon qayta yaratilmaydi (fokus va telefon klaviaturasi saqlanadi) — silkinish animatsiyasi
  // qayta boshlanadi, kod belgilanadi: bitta raqamni tuzatish uchun qayta bosish shart emas
  useEffect(() => {
    const el = inputRef.current;
    if (!shake || !el) return;
    el.classList.remove('shake');
    void el.offsetWidth; // reflow — animatsiya boshidan
    el.classList.add('shake');
    try {
      el.focus({ preventScroll: true });
      el.select();
    } catch {
      /* e'tiborsiz */
    }
  }, [shake]);

  const submit = useCallback(
    async (value) => {
      const c = parseCheckinCode(value);
      if (!c) {
        setError('Kod 6 ta raqamdan iborat');
        setShake((n) => n + 1);
        haptic('error');
        return;
      }
      if (!(await requireVerified('checkin'))) return;
      setBusy(true);
      setError('');
      try {
        const r = await api.checkin(h.id, c);
        haptic('success');
        setDone(r);
        invalidate(`hashar:${h.id}`, 'leaderboard', 'me:', 'user:');
        onDone?.(r);
      } catch (e) {
        setError(e.message);
        setShake((n) => n + 1);
        haptic('error');
      } finally {
        setBusy(false);
      }
    },
    [h.id, requireVerified, onDone],
  );

  // QR havolasi orqali ochilgan (?checkin=kod) — avtomatik yuboriladi
  useEffect(() => {
    if (autoTried.current || !parseCheckinCode(initialCode)) return;
    autoTried.current = true;
    submit(initialCode);
  }, [initialCode, submit]);

  const scan = async () => {
    setScanning(true);
    setError('');
    try {
      const raw = await scanQr();
      if (!raw) return;
      const c = parseCheckinCode(raw);
      if (!c) {
        setError("Bu QR kod davomat kodi emas");
        haptic('error');
        return;
      }
      setCode(c);
      await submit(c);
    } catch (e) {
      setError((e && e.message) || "Skanerni ochib bo'lmadi");
    } finally {
      setScanning(false);
    }
  };

  return (
    <Modal title={done ? 'Davomat tasdiqlandi' : 'Davomatni tasdiqlash'} subtitle={done ? undefined : h.title} onClose={onClose} size="sm" autoFocus={!canScan && !done}>
      {done ? (
        <div className="py-4 text-center" data-testid="checkin-done">
          <SuccessBurst size={96} />
          <p className="mt-5 text-xl font-extrabold text-ink">{done.already ? 'Siz allaqachon belgilangansiz' : 'Rahmat, siz shu yerdasiz!'}</p>
          <p className="mt-1 text-sm text-ink-3">Davomat uchun reytingda +5 ball. Hasharingiz xayrli o'tsin!</p>
          <button type="button" onClick={onClose} className={cx(btn.primary, 'mt-6 h-12 w-full')}>
            Ajoyib
          </button>
        </div>
      ) : (
        <div>
          {canScan && (
            <>
              <button type="button" onClick={scan} disabled={scanning || busy} className={cx(btn.primary, 'h-14 w-full text-base')} data-testid="scan-button">
                {scanning ? <Spinner /> : <ScanIcon className="h-6 w-6" />} QR kodni skanerlash
              </button>
              <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-ink-3">
                <span className="h-px flex-1 bg-line" /> yoki kodni kiriting <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          {!canScan && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5 text-sm text-ink-2 ring-1 ring-line">
              <QrIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              Tashkilotchi ekranidagi 6 xonali kodni kiriting. Ilovada QR kodni to'g'ridan-to'g'ri skanerlash mumkin.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(code);
            }}
          >
            <label htmlFor="checkin-code" className="sr-only">
              Davomat kodi
            </label>
            <input
              id="checkin-code"
              ref={inputRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setError('');
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              }}
              className={cx(
                'w-full rounded-2xl border bg-surface px-4 py-4 text-center font-display text-3xl font-extrabold tracking-[0.3em] text-ink tabular outline-none transition placeholder:text-ink-3/40 focus:ring-4',
                error ? 'border-red-400 focus:ring-red-500/15' : 'border-line focus:border-brand-500 focus:ring-brand-500/15',
              )}
              aria-invalid={!!error}
              data-testid="checkin-input"
            />
            {error && (
              <p role="alert" className="mt-2.5 text-center text-sm font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || code.length !== 6} className={cx(btn.cta, 'mt-4 h-12 w-full')} data-testid="checkin-submit">
              {busy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} Tasdiqlash
            </button>
          </form>
        </div>
      )}
    </Modal>
  );
}
