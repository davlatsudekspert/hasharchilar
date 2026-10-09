// Hashar sahifasi: rasm / Oldin-Keyin slayder, tafsilotlar, mini xarita, progress, ko'ngillilar, izohlar,
// ulashish, kalendar, yo'l ko'rsatish; egasi uchun yakunlash / o'chirish.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';
import { checkinOpen, CheckinSheet, OwnerQrSheet } from '../components/Checkin.jsx';
import Comments from '../components/Comments.jsx';
import { isUnpaid, JoinButton, Thumb, UnpaidBadge } from '../components/HasharCard.jsx';
import SaveButton from '../components/SaveButton.jsx';
import {
  AlertIcon,
  ArrowLeftIcon,
  AwardIcon,
  QrIcon,
  ScanIcon,
  WalletIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CheckIcon,
  ClockIcon,
  ExternalIcon,
  LogOutIcon,
  NavigationIcon,
  PackageIcon,
  PhoneIcon,
  PinIcon,
  ShareIcon,
  TrashIcon,
  UsersIcon,
} from '../components/icons.jsx';
import { MiniMap } from '../components/map/index.jsx';
import Modal from '../components/Modal.jsx';
import PhotoInput from '../components/PhotoInput.jsx';
import { useToast } from '../components/Toast.jsx';
import { Avatar, AvatarStack, btn, CategoryChip, EmptyState, ErrorState, ItemChips, Link, Progress, Spinner, StatusBadge } from '../components/ui.jsx';
import { useActions } from '../lib/actions.jsx';
import { useAuth } from '../lib/auth.jsx';
import { formatSom } from '../lib/payments.js';
import { useServerConfig } from '../lib/serverConfig.js';
import { useInView } from '../lib/useInView.js';
import { api } from '../lib/api.js';
import { IS_NATIVE, mediaUrl } from '../lib/config.js';
import { downloadIcs, googleCalendarUrl, googleDirections, yandexDirections } from '../lib/meta.js';
import { haptic, hideSplash, markExternal, onRestoredPhoto, peekRestoredPhoto } from '../lib/native.js';
import { goBack, navigate } from '../lib/router.js';
import { Q } from '../lib/queries.js';
import { invalidate, peek, useApi } from '../lib/store.js';
import { countdown, cx, formatDateLong, formatDay, formatPhone, isOverdue, osmLink, statusOf, timeAgo } from '../lib/utils.js';

const ShareCardModal = lazy(() => import('../components/ShareCard.jsx'));

function Info({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-2 p-3.5 ring-1 ring-line">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-brand shadow-sm ring-1 ring-line">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{label}</p>
        <div className="mt-0.5 text-[15px] font-semibold text-ink">{children}</div>
      </div>
    </div>
  );
}

// lg (1024px) dan kengmi — mini xarita faqat bitta joyda yaratiladi (yashirin ikkinchi WebGL konteksti ochilmaydi)
const LG = '(min-width: 1024px)';
function useIsDesktop() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(LG).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(LG);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, []);
  return m;
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 lg:px-6" aria-hidden="true">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="skeleton aspect-[16/9] rounded-3xl" />
          <div className="skeleton h-8 w-3/4 rounded-full" />
          <div className="skeleton h-4 w-1/2 rounded-full" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="skeleton h-20 rounded-2xl" />
            <div className="skeleton h-20 rounded-2xl" />
          </div>
        </div>
        <div className="skeleton h-80 rounded-3xl" />
      </div>
    </div>
  );
}

export default function HasharPage({ route }) {
  const id = route.params.id;
  const toast = useToast();
  const actions = useActions();
  const seed = (peek('hashars:all') || []).find((x) => x.id === id) || null;
  const d = useApi(...Q.hashar(id));
  const [mode, setMode] = useState(null); // null | 'complete' | 'delete'
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [showAllVolunteers, setShowAllVolunteers] = useState(false);
  const [sheet, setSheet] = useState(null); // null | 'qr' | 'checkin' | 'card'
  const isDesktop = useIsDesktop();
  const { user } = useAuth();
  const { hashar_fee: fee, loaded: cfgLoaded } = useServerConfig();
  // Narx 0 ga tushgan (admin sozlamasi): to'lanmagan hashar egasi uni bepul e'lon qiladi (to'lov sahifasi ochilganda
  // server 'waived' qiladi) — "0 so'm to'lang" ko'rsatilmaydi
  const freeNow = cfgLoaded && !(fee > 0);
  // Mini xarita (MapLibre ~280 KB gzip) — faqat ekranga yaqinlashganda yuklanadi
  const [mapBoxRef, mapNear] = useInView({ margin: '250px' });
  const [asideMapRef, asideMapNear] = useInView({ margin: '100px' });
  const checkinParam = route.query.checkin || '';

  useEffect(() => {
    if (!d.loading) hideSplash();
  }, [d.loading]);

  // APK: OS kamera paytida ilovani o'ldirgan bo'lsa — "Keyin" surati bilan yakunlash oynasini qayta ochamiz
  const afterTag = `after-${id}`;
  useEffect(() => {
    const check = () => peekRestoredPhoto(afterTag) && setMode('complete');
    check();
    return onRestoredPhoto(check);
  }, [afterTag]);

  // Server 404 qaytarsa (o'chirilgan) — ro'yxat keshidagi eski nusxa "jonli" sahifa bo'lib ko'rinmasin
  const gone = !!(d.error && d.error.status === 404);
  useEffect(() => {
    if (gone) invalidate('hashars', 'stats', 'me:', 'user:', 'leaderboard');
  }, [gone]);

  const h = gone ? null : d.data || seed;

  // To'lovdan qaytish (?tolov=1) — egasi to'lov holati sahifasiga
  const ownerUnpaid = !!h && h.is_owner && isUnpaid(h);
  useEffect(() => {
    if (route.query.tolov && h && h.is_owner) navigate(`/tolov/${id}`, { replace: true });
  }, [route.query.tolov, h, id]);
  // QR havolasi (?checkin=kod): qo'shilgan ko'ngilli uchun tasdiqlash oynasi
  const autoCheckin = useRef(false);
  useEffect(() => {
    if (autoCheckin.current || !checkinParam || !h || h.is_owner || h.status === 'COMPLETED') return;
    autoCheckin.current = true;
    setSheet('checkin');
  }, [checkinParam, h]);

  if (!h && d.loading) return <Skeleton />;
  if (!h) {
    const notFound = gone;
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        {notFound ? (
          <EmptyState
            icon={AlertIcon}
            title="Hashar topilmadi"
            text="Bu hashar o'chirilgan yoki havola noto'g'ri bo'lishi mumkin."
            action={
              <Link to="/hasharlar" className={cx(btn.primary, 'h-11 px-5')}>
                Barcha hasharlar
              </Link>
            }
          />
        ) : (
          <ErrorState message={d.error?.message} onRetry={d.reload} />
        )}
      </div>
    );
  }

  const done = h.status === 'COMPLETED';
  const past = isOverdue(h); // sanasi o'tgan, yakunlanmagan
  const before = mediaUrl(h.before_url);
  const after = mediaUrl(h.after_url);
  const phone = (h.joined || h.is_owner) && h.creator ? h.creator.phone : null;
  const volunteers = Array.isArray(h.volunteers) ? h.volunteers : null;
  const left = !done ? countdown(h.date_time) : null;
  const spots = h.max_volunteers ? Math.max(0, h.max_volunteers - (h.volunteer_count || 0)) : null;

  const applyJoin = (r) => r && d.mutate((x) => (x ? { ...x, joined: r.joined, volunteer_count: r.volunteer_count } : x));

  const doLeave = async () => {
    const r = await actions.leave(h.id);
    applyJoin(r);
  };

  const complete = async () => {
    if (!(await actions.requireVerified('manage'))) return;
    setBusy(true);
    setActionError('');
    try {
      const fd = new FormData();
      fd.set('photo', afterPhoto, afterPhoto.name || 'keyin.jpg');
      const dto = await api.complete(h.id, fd);
      d.mutate((x) => ({ ...(x || {}), ...dto }));
      haptic('success');
      toast("Hashar yakunlandi! Natija galereyaga qo'shildi ✨");
      setMode(null);
      setAfterPhoto(null);
      actions.refreshAfterChange(h.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await actions.requireVerified('manage'))) return;
    setBusy(true);
    setActionError('');
    try {
      await api.remove(h.id);
      haptic('warning');
      toast("Hashar o'chirildi", 'info');
      invalidate('hashars', 'stats', 'me:', 'user:', 'leaderboard');
      setMode(null);
      navigate('/hasharlar', { replace: true });
    } catch (e) {
      setActionError(e.message);
      setBusy(false);
    }
  };

  const addToCalendar = () => {
    haptic('light');
    if (IS_NATIVE) {
      markExternal();
      window.open(googleCalendarUrl(h), '_blank', 'noopener');
    }
    else {
      downloadIcs(h);
      toast('Kalendar fayli (.ics) yuklab olindi');
    }
  };

  const canQr = h.is_owner && !done && !ownerUnpaid;
  const canCheckin = !h.is_owner && h.joined && !done && !h.checked_in_at && checkinOpen(h);
  const canCard = done && (h.joined || h.is_owner);

  const qrButton = canQr && (
    <button type="button" onClick={() => setSheet('qr')} className={cx(btn.soft, 'h-11 w-full text-sm')} data-testid="open-qr">
      <QrIcon className="h-5 w-5" /> Davomat QR
    </button>
  );
  const checkinButton = canCheckin && (
    <button type="button" onClick={() => setSheet('checkin')} className={cx(btn.soft, 'h-11 w-full text-sm')} data-testid="open-checkin">
      <ScanIcon className="h-5 w-5" /> Davomatni tasdiqlash
    </button>
  );
  const checkedBadge = h.checked_in_at && !h.is_owner && (
    <p className="flex items-center justify-center gap-2 rounded-2xl bg-brand-soft px-3 py-2.5 text-sm font-bold text-brand ring-1 ring-brand-line" data-testid="checked-in">
      <CheckIcon className="h-4 w-4" strokeWidth={3} /> Davomat tasdiqlangan
    </p>
  );
  const cardButton = canCard && (
    <button type="button" onClick={() => setSheet('card')} className={cx(btn.cta, 'h-12 w-full')} data-testid="open-share-card">
      <AwardIcon className="h-5 w-5" /> {h.is_owner ? 'Tashkilotchi kartasi' : 'Sertifikatni olish'}
    </button>
  );

  // ---- Asosiy harakat paneli ----
  const primaryActions = (
    <div className="space-y-2.5">
      {ownerUnpaid ? (
        <>
          <button type="button" onClick={() => navigate(`/tolov/${h.id}`)} className={cx(btn.cta, 'h-12 w-full')} data-testid="pay-button">
            <WalletIcon className="h-5 w-5" /> {freeNow ? "Bepul e'lon qilish" : "To'lash va e'lon qilish"}
          </button>
          <button type="button" onClick={() => setMode('delete')} className={cx(btn.dangerSoft, 'h-11 w-full text-sm')}>
            <TrashIcon className="h-4 w-4" /> Hasharni o'chirish
          </button>
        </>
      ) : h.is_owner && !done ? (
        <>
          <button type="button" onClick={() => setMode('complete')} className={cx(btn.primary, 'h-12 w-full')}>
            <CheckIcon className="h-5 w-5" strokeWidth={2.6} /> Yakunlash ("Keyin" rasmi)
          </button>
          {qrButton}
          <button type="button" onClick={() => setMode('delete')} className={cx(btn.dangerSoft, 'h-11 w-full text-sm')}>
            <TrashIcon className="h-4 w-4" /> Hasharni o'chirish
          </button>
        </>
      ) : h.joined && !done && !past ? (
        <>
          <div className="flex gap-2">
            <JoinButton hashar={h} size="lg" className="flex-1" />
            <button type="button" disabled={actions.busyId === h.id} onClick={doLeave} className={cx(btn.outline, 'h-12 px-4')}>
              {actions.busyId === h.id ? <Spinner /> : <LogOutIcon className="h-5 w-5" />} Chiqish
            </button>
          </div>
          {checkinButton}
          {checkedBadge}
        </>
      ) : (
        <>
          <JoinButton hashar={h} size="lg" className="w-full" onJoined={applyJoin} />
          {checkinButton}
          {checkedBadge}
          {cardButton}
        </>
      )}
    </div>
  );

  // Mobil pastki panel uchun ixcham variant
  const mobileActions = ownerUnpaid ? (
    <button type="button" onClick={() => navigate(`/tolov/${h.id}`)} className={cx(btn.cta, 'h-12 w-full')}>
      <WalletIcon className="h-5 w-5" /> {freeNow ? "Bepul e'lon qilish" : fee > 0 ? `To'lash · ${formatSom(fee)}` : "To'lash"}
    </button>
  ) : h.is_owner && !done ? (
    <div className="flex gap-2">
      <button type="button" onClick={() => setMode('complete')} className={cx(btn.primary, 'h-12 flex-1')}>
        <CheckIcon className="h-5 w-5" strokeWidth={2.6} /> Yakunlash
      </button>
      {canQr && (
        <button type="button" onClick={() => setSheet('qr')} aria-label="Davomat QR" className={cx(btn.soft, 'h-12 w-12 p-0')}>
          <QrIcon className="h-5 w-5" />
        </button>
      )}
      <button type="button" onClick={() => setMode('delete')} aria-label="Hasharni o'chirish" className={cx(btn.dangerSoft, 'h-12 w-12 p-0')}>
        <TrashIcon className="h-5 w-5" />
      </button>
    </div>
  ) : h.joined && !done && !past ? (
    <div className="flex gap-2">
      {canCheckin ? (
        <button type="button" onClick={() => setSheet('checkin')} className={cx(btn.cta, 'h-12 flex-1 px-3')}>
          <ScanIcon className="h-5 w-5" /> Davomat
        </button>
      ) : checkedBadge ? (
        // Mobil: davomatdan o'tgani pastki panelda ham ko'rinsin
        <p className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-soft px-3 text-sm font-bold text-brand ring-1 ring-brand-line" data-testid="checked-in-mobile">
          <CheckIcon className="h-4 w-4" strokeWidth={3} /> Davomat tasdiqlangan
        </p>
      ) : (
        <JoinButton hashar={h} size="lg" className="flex-1" />
      )}
      <button type="button" disabled={actions.busyId === h.id} onClick={doLeave} aria-label="Hashardan chiqish" className={cx(btn.outline, 'h-12 w-12 p-0')}>
        {actions.busyId === h.id ? <Spinner /> : <LogOutIcon className="h-5 w-5" />}
      </button>
    </div>
  ) : canCheckin ? (
    <button type="button" onClick={() => setSheet('checkin')} className={cx(btn.cta, 'h-12 w-full')}>
      <ScanIcon className="h-5 w-5" /> Davomatni tasdiqlash
    </button>
  ) : canCard ? (
    <button type="button" onClick={() => setSheet('card')} className={cx(btn.cta, 'h-12 w-full')}>
      <AwardIcon className="h-5 w-5" /> {h.is_owner ? 'Tashkilotchi kartasi' : 'Sertifikatni olish'}
    </button>
  ) : (
    <JoinButton hashar={h} size="lg" className="w-full" onJoined={applyJoin} />
  );

  const quickLinks = (
    <div className="grid grid-cols-4 gap-2">
      <button type="button" onClick={() => actions.share(h)} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-xs font-bold text-ink-2 ring-1 ring-line transition hover:text-brand active:scale-95">
        <ShareIcon className="h-5 w-5" /> Ulashish
      </button>
      <SaveButton hashar={h} variant="button" />
      <button
        type="button"
        onClick={addToCalendar}
        disabled={done || past}
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-xs font-bold text-ink-2 ring-1 ring-line transition hover:text-brand active:scale-95 disabled:opacity-40"
      >
        <CalendarPlusIcon className="h-5 w-5" /> Kalendar
      </button>
      <a
        href={googleDirections(h.lat, h.lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-xs font-bold text-ink-2 ring-1 ring-line transition hover:text-brand active:scale-95"
      >
        <NavigationIcon className="h-5 w-5" /> Yo'l
      </a>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-28 pt-4 lg:px-6 lg:pb-16 lg:pt-8">
      {/* Navigatsiya */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => goBack('/hasharlar')} className={cx(btn.outline, 'h-10 px-3.5 text-sm')}>
          <ArrowLeftIcon className="h-4 w-4" /> Orqaga
        </button>
        <nav aria-label="Yo'l" className="hidden text-sm text-ink-3 sm:block">
          <Link to="/" className="hover:text-brand">
            Bosh sahifa
          </Link>{' '}
          /{' '}
          <Link to="/hasharlar" className="hover:text-brand">
            Hasharlar
          </Link>{' '}
          / <span className="text-ink-2">#{h.id}</span>
        </nav>
        <button type="button" onClick={() => actions.share(h)} aria-label="Ulashish" className={cx(btn.outline, 'h-10 w-10 p-0 sm:hidden')}>
          <ShareIcon className="h-4 w-4" />
        </button>
      </div>

      {ownerUnpaid && (
        <div className="fade-up mb-5 flex flex-col gap-3 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:p-5 dark:from-amber-400/10 dark:to-orange-400/5 dark:ring-amber-400/25" data-testid="unpaid-banner">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400 text-amber-950 shadow-cta">
            <WalletIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-amber-950 dark:text-amber-100">Hasharingiz hali e'lon qilinmagan</p>
            <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-200/80">
              {freeNow
                ? "E'lon endi bepul — bir bosishda uni xaritada va ro'yxatda hammaga ko'rinadigan qiling."
                : `To'lovdan so'ng${fee > 0 ? ` (${formatSom(fee)})` : ''} u xaritada va ro'yxatda hammaga ko'rinadi. Hozircha uni faqat siz ko'rasiz.`}
            </p>
          </div>
          <button type="button" onClick={() => navigate(`/tolov/${h.id}`)} className={cx(btn.cta, 'h-11 shrink-0 px-5')}>
            <WalletIcon className="h-4 w-4" /> {freeNow ? "Bepul e'lon qilish" : "To'lash"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* ---------- Asosiy ustun ---------- */}
        <div className="min-w-0 space-y-6">
          {/* Media */}
          <div className="relative">
            <div className="absolute bottom-3 right-3 z-[3]">
              <SaveButton hashar={h} variant="overlay" className="h-11 w-11 shadow-lg" />
            </div>
            {done && before && after ? (
              <BeforeAfterSlider before={before} after={after} alt={h.title} aspect="aspect-[16/10] sm:aspect-[16/9]" />
            ) : (
              <div className="relative overflow-hidden rounded-3xl">
                <Thumb hashar={h} prefer="after" className="aspect-[16/10] w-full sm:aspect-[16/9]" iconClass="h-20 w-20" />
                {(before || after) && (
                  <span className="absolute left-3 top-3 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur">
                    {after ? 'Keyin' : 'Oldin'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sarlavha */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={statusOf(h)} />
              <CategoryChip category={h.category} />
              {left && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800 dark:bg-sky-400/15 dark:text-sky-300">
                  <ClockIcon className="h-3.5 w-3.5" /> {left}
                </span>
              )}
              {ownerUnpaid && <UnpaidBadge />}
              {h.is_owner && h.payment_status === 'paid' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800 dark:bg-brand-400/15 dark:text-brand-300">
                  <WalletIcon className="h-3.5 w-3.5" /> To'langan
                </span>
              )}
              {h.is_owner && h.payment_status === 'waived' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800 dark:bg-sky-400/15 dark:text-sky-300">Bepul e'lon</span>
              )}
              {h.is_owner ? (
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-ink-2 ring-1 ring-line">Siz tashkilotchisiz</span>
              ) : (
                h.joined &&
                !done &&
                !past && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">
                    <CheckIcon className="h-3 w-3" strokeWidth={3} /> Siz qatnashasiz
                  </span>
                )
              )}
            </div>
            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-ink [overflow-wrap:anywhere] sm:text-4xl">{h.title}</h1>
            <p className="mt-2 text-sm text-ink-3">
              E'lon qilindi {timeAgo(h.created_at)} ·{' '}
              <Link to={`/u/${h.creator?.id}`} className="font-semibold text-ink-2 hover:text-brand">
                {h.creator?.name}
              </Link>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info icon={CalendarIcon} label={done || past ? "Bo'lib o'tdi" : 'Qachon'}>
              {formatDateLong(h.date_time)}
              {done && h.completed_at && <p className="text-sm font-medium text-brand">Yakunlandi: {formatDay(h.completed_at)}</p>}
              {past && <p className="text-sm font-medium text-ink-3">Tashkilotchi hali yakunlamagan</p>}
            </Info>
            <Info icon={UsersIcon} label="Ko'ngillilar">
              {h.volunteer_count || 0} kishi{h.max_volunteers ? ` / ${h.max_volunteers} joy` : ''}
            </Info>
            <div className="sm:col-span-2">
              <Info icon={PinIcon} label="Manzil">
                <span className="break-words">{h.address || 'Xaritada belgilangan joy'}</span>
                <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
                  <a href={googleDirections(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                    Google Maps <ExternalIcon className="h-3.5 w-3.5" />
                  </a>
                  <a href={yandexDirections(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                    Yandex Xaritalar <ExternalIcon className="h-3.5 w-3.5" />
                  </a>
                  <a href={osmLink(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-3 hover:underline">
                    OSM <ExternalIcon className="h-3.5 w-3.5" />
                  </a>
                </span>
              </Info>
            </div>
          </div>

          {h.description && (
            <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft sm:p-6">
              <h2 className="text-lg font-extrabold text-ink">Tavsif</h2>
              <p className="mt-2 whitespace-pre-line break-words text-[15.5px] leading-relaxed text-ink-2">{h.description}</p>
            </section>
          )}

          {h.items && h.items.length > 0 && (
            <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
                <PackageIcon className="h-5 w-5 text-brand" /> Kerakli narsalar
              </h2>
              <ItemChips items={h.items} className="mt-3" />
            </section>
          )}

          {/* Mobil: xarita */}
          <section ref={mapBoxRef} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft lg:hidden">
            {!isDesktop && mapNear ? <MiniMap lat={h.lat} lng={h.lng} status={statusOf(h)} className="h-52" /> : <div className="skeleton h-52" />}
            <div className="flex gap-2 p-3">
              <a href={googleDirections(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className={cx(btn.soft, 'h-11 flex-1 text-sm')}>
                <NavigationIcon className="h-4 w-4" /> Google
              </a>
              <a href={yandexDirections(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className={cx(btn.soft, 'h-11 flex-1 text-sm')}>
                <NavigationIcon className="h-4 w-4" /> Yandex
              </a>
            </div>
          </section>

          <Comments hasharId={h.id} />
        </div>

        {/* ---------- Yon panel ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-[96px]">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
            {h.max_volunteers ? (
              <div className="mb-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="font-display text-2xl font-extrabold text-ink tabular">
                    {h.volunteer_count}
                    <span className="text-base font-bold text-ink-3">/{h.max_volunteers}</span>
                  </span>
                  <span className={cx('text-sm font-bold', past ? 'text-ink-3' : done || spots ? 'text-brand' : 'text-red-600')}>
                    {done ? "ko'ngilli qatnashdi" : past ? "ko'ngilli yozilgan" : spots ? `${spots} joy qoldi` : 'Joy qolmadi'}
                  </span>
                </div>
                <Progress value={h.volunteer_count} max={h.max_volunteers} />
              </div>
            ) : (
              <p className="mb-4 flex items-baseline gap-2">
                <span className="font-display text-2xl font-extrabold text-ink tabular">{h.volunteer_count || 0}</span>
                <span className="text-sm font-semibold text-ink-3">{done ? "ko'ngilli qatnashdi" : past ? "ko'ngilli yozilgan" : "ko'ngilli qo'shildi · joy cheklanmagan"}</span>
              </p>
            )}
            {past && h.is_owner && (
              <p className="mb-3 flex gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20">
                <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" /> Hashar sanasi o'tdi. "Keyin" rasmini yuklab yakunlang — natija galereyaga qo'shiladi.
              </p>
            )}
            <div className="hidden lg:block">{primaryActions}</div>
            <div className="lg:mt-4">{quickLinks}</div>
            {actionError && !mode && (
              <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {actionError}
              </p>
            )}
          </div>

          <div ref={asideMapRef} className="hidden overflow-hidden rounded-3xl border border-line bg-surface shadow-soft lg:block">
            {isDesktop && asideMapNear ? <MiniMap lat={h.lat} lng={h.lng} status={statusOf(h)} className="h-56" /> : <div className="skeleton h-56" />}
          </div>

          {/* Tashkilotchi */}
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Tashkilotchi</p>
            <div className="mt-3 flex items-center gap-3">
              <Link to={`/u/${h.creator?.id}`} className="rounded-full" aria-label={h.creator?.name}>
                <Avatar name={h.creator?.name} src={h.creator?.avatar_url} size="lg" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/u/${h.creator?.id}`} className="block truncate font-bold text-ink hover:text-brand">
                  {h.creator?.name || "Noma'lum"}
                </Link>
                <p className="text-sm text-ink-3">
                  {phone ? formatPhone(phone) : h.joined || h.is_owner ? (d.loading ? 'Yuklanmoqda…' : '—') : "Telefon qo'shilganingizdan keyin ko'rinadi"}
                </p>
              </div>
              {phone && !h.is_owner && (
                <a href={`tel:${phone}`} className={cx(btn.soft, 'h-11 w-11 p-0')} aria-label={`Qo'ng'iroq qilish: ${formatPhone(phone)}`}>
                  <PhoneIcon className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {/* Ko'ngillilar */}
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                Ko'ngillilar{volunteers ? ` · ${volunteers.length}` : ''}
                {h.is_owner && h.checked_in_count > 0 ? ` · ${h.checked_in_count} keldi` : ''}
              </p>
              {volunteers && volunteers.length > 6 && (
                <button type="button" onClick={() => setShowAllVolunteers((v) => !v)} className="text-xs font-bold text-brand hover:underline">
                  {showAllVolunteers ? 'Yig\'ish' : 'Barchasi'}
                </button>
              )}
            </div>
            {!volunteers ? (
              <div className="mt-3 flex gap-2" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="skeleton h-9 w-9 rounded-full" />
                ))}
              </div>
            ) : volunteers.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">Hali hech kim qo'shilmagan — birinchi bo'ling!</p>
            ) : showAllVolunteers ? (
              <ul className="mt-3 space-y-2">
                {volunteers.map((v) => (
                  <li key={v.id}>
                    <Link to={`/u/${v.id}`} className="flex items-center gap-2.5 rounded-xl p-1 hover:bg-surface-2">
                      <Avatar name={v.name} src={v.avatar_url} size="sm" />
                      <span className="truncate text-sm font-semibold text-ink">{v.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <AvatarStack people={volunteers} max={6} />
                <p className="min-w-0 truncate text-sm text-ink-3">
                  {volunteers
                    .slice(0, 2)
                    .map((v) => v.name.split(' ')[0])
                    .join(', ')}
                  {volunteers.length > 2 ? ` va yana ${volunteers.length - 2} kishi` : ''}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Mobil: pastki harakat paneli */}
      <div className="above-tabbar fixed inset-x-0 z-[1100] px-3 lg:hidden">
        <div className="glass mx-auto flex max-w-md items-center gap-2 rounded-3xl border border-line p-2 shadow-lift">
          <div className="min-w-0 flex-1">{mobileActions}</div>
          <button type="button" onClick={() => actions.share(h)} aria-label="Ulashish" className={cx(btn.ghost, 'h-12 w-12 shrink-0 p-0')}>
            <ShareIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {sheet === 'qr' && <OwnerQrSheet hashar={h} onClose={() => setSheet(null)} />}
      {sheet === 'checkin' && (
        <CheckinSheet
          hashar={h}
          initialCode={h.joined ? checkinParam : ''}
          onClose={() => {
            setSheet(null);
            if (checkinParam) navigate(`/hashar/${h.id}`, { replace: true });
          }}
          onDone={(r) => d.mutate((x) => (x ? { ...x, checked_in_at: r.checked_in_at } : x))}
        />
      )}
      {sheet === 'card' && (
        <Suspense fallback={null}>
          <ShareCardModal hashar={h} user={user} onClose={() => setSheet(null)} />
        </Suspense>
      )}

      {/* Yakunlash */}
      {mode === 'complete' && (
        <Modal
          title="Hasharni yakunlash"
          subtitle={'"Keyin" rasmini yuklang — natija Oldin/Keyin galereyasida ko\'rinadi'}
          onClose={busy ? () => {} : () => setMode(null)}
          autoFocus={false}
          footer={
            <div>
              {actionError && (
                <p role="alert" className="mb-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {actionError}
                </p>
              )}
              <div className="flex gap-3">
                <button type="button" disabled={busy} onClick={() => setMode(null)} className={cx(btn.ghost, 'h-12 px-5')}>
                  Bekor
                </button>
                <button type="button" disabled={busy || photoBusy || !afterPhoto} onClick={complete} className={cx(btn.primary, 'h-12 flex-1')}>
                  {busy || photoBusy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} Yakunlashni tasdiqlash
                </button>
              </div>
            </div>
          }
        >
          {before && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
              <img src={before} alt="Oldin" className="h-14 w-14 rounded-xl object-cover" />
              <p className="text-sm text-ink-3">"Oldin" rasmi bilan solishtiriladi. Iloji boricha xuddi shu burchakdan suratga oling.</p>
            </div>
          )}
          <PhotoInput value={afterPhoto} onChange={setAfterPhoto} onBusyChange={setPhotoBusy} restoreTag={afterTag} title={'"Keyin" rasmini yuklang'} hint="Majburiy · JPG, PNG yoki WebP" />
        </Modal>
      )}

      {/* O'chirish */}
      {mode === 'delete' && (
        <Modal
          title="Hasharni o'chirasizmi?"
          onClose={busy ? () => {} : () => setMode(null)}
          size="sm"
          footer={
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => setMode(null)} className={cx(btn.ghost, 'h-12 flex-1')}>
                Bekor
              </button>
              <button type="button" disabled={busy} onClick={remove} className={cx(btn.danger, 'h-12 flex-1')}>
                {busy ? <Spinner /> : <TrashIcon className="h-5 w-5" />} Ha, o'chirish
              </button>
            </div>
          }
        >
          <p className="flex items-start gap-2 text-[15px] text-ink-2">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> "{h.title}" o'chiriladi. Ko'ngillilar ro'yxati va izohlar ham o'chadi. Bu amalni qaytarib bo'lmaydi.
          </p>
          {actionError && (
            <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {actionError}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
