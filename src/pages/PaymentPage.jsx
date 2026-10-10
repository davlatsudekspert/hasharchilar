// To'lov sahifasi (#/tolov/:id): hashar e'loni narxi, Payme / Click (tashqi brauzerda), qo'lda to'lov izohi,
// holatni avtomatik tekshirish (polling + ilova qaytishi) va to'langanda muvaffaqiyat animatsiyasi.
import { useEffect, useRef, useState } from 'react';
import { Thumb } from '../components/HasharCard.jsx';
import {
  AlertIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  ExternalIcon,
  HourglassIcon,
  InfoIcon,
  RefreshIcon,
  ShareIcon,
  ShieldIcon,
  WalletIcon,
} from '../components/icons.jsx';
import SuccessBurst from '../components/SuccessBurst.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, EmptyState, ErrorState, Link, Spinner } from '../components/ui.jsx';
import { useActions } from '../lib/actions.jsx';
import { useAuth } from '../lib/auth.jsx';
import { copyText, haptic, hideSplash } from '../lib/native.js';
import { refreshUnread } from '../lib/notifications.js';
import { formatSom, PROVIDER_LABEL, TX_STATUS, usePaymentStatus } from '../lib/payments.js';
import { Q } from '../lib/queries.js';
import { goBack, navigate } from '../lib/router.js';
import { invalidate, useApi } from '../lib/store.js';
import { cx, formatDateLong, timeAgo } from '../lib/utils.js';
import { openApp, openExternal } from '../native/browser.js';

/** Izohdagi karta raqami (16 raqam) — alohida nusxalash uchun. */
const cardNumberIn = (s) => {
  const m = String(s || '').match(/(?:\d[ -]?){15}\d/);
  return m ? m[0].replace(/[ -]/g, '').replace(/(\d{4})(?=\d)/g, '$1 ') : null;
};

function ProviderButton({ provider, url, onOpen }) {
  const look =
    provider === 'payme'
      ? { name: 'Payme', cls: 'bg-[#00b4b9] hover:bg-[#00a3a8] text-white', mark: 'pay', markCls: 'text-white' }
      : { name: 'Click', cls: 'bg-[#0060f0] hover:bg-[#0054d6] text-white', mark: 'click', markCls: 'text-white' };
  return (
    <button
      type="button"
      onClick={() => onOpen(provider, url)}
      className={cx('press flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-left font-bold shadow-sm transition', look.cls)}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20 font-display text-[13px] font-black lowercase tracking-tight">{look.mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-tight">{look.name} orqali to'lash</span>
        <span className="block text-xs font-medium opacity-80">Karta: Uzcard, Humo · xavfsiz sahifada</span>
      </span>
      <ExternalIcon className="h-5 w-5 shrink-0 opacity-80" />
    </button>
  );
}

/**
 * Haqiqatan to'langan summa (so'm): tarixdagi oxirgi muvaffaqiyatli to'lov — joriy narx EMAS (narx keyin
 * o'zgargan bo'lishi mumkin). To'lov yozuvi yo'q (v4 dan oldingi / narx 0 paytida yaratilgan hashar) — null.
 */
const paidAmountOf = (info) => {
  const tx = (Array.isArray(info.history) ? info.history : []).find((p) => p.status === 'paid');
  return tx && tx.amount > 0 ? tx.amount : null;
};

function PaidView({ hashar, amount, celebrate, waived, onShare }) {
  // To'lov yozuvi yo'q bo'lsa "to'landi" deyilmaydi — hashar shunchaki e'lon qilingan
  const title = waived ? "Hashar bepul e'lon qilindi" : !amount ? "Hashar e'lon qilingan" : celebrate ? "To'lov qabul qilindi!" : "To'lov amalga oshirilgan";
  return (
    <div className="fade-up rounded-[28px] border border-line bg-surface p-6 text-center shadow-soft sm:p-8" data-testid="payment-paid">
      {celebrate ? (
        <SuccessBurst size={108} />
      ) : (
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow">
          <CheckIcon className="h-10 w-10" strokeWidth={3} />
        </span>
      )}
      <h2 className="mt-5 text-2xl font-extrabold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-3">
        {amount ? (
          <>
            <b className="whitespace-nowrap font-bold text-ink-2" data-testid="paid-amount">
              {formatSom(amount)}
            </b>{' '}
            to'landi. Hasharingiz e'lon qilindi — endi u xaritada va ro'yxatda hammaga ko'rinadi.
          </>
        ) : waived ? (
          "Hasharingiz e'lon qilindi — endi u xaritada va ro'yxatda hammaga ko'rinadi."
        ) : (
          "U xaritada va ro'yxatda hammaga ko'rinadi — bu hashar uchun to'lov talab qilinmagan."
        )}
      </p>
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <Link to={`/hashar/${hashar.id}`} className={cx(btn.primary, 'h-12 px-6')}>
          Hasharni ko'rish
        </Link>
        <button type="button" onClick={onShare} className={cx(btn.outline, 'h-12 px-6')}>
          <ShareIcon className="h-4 w-4" /> Do'stlarga ulashish
        </button>
      </div>
    </div>
  );
}

/** Telegram admin bilan suhbat havolasi (tayyor xabar bilan; eski Telegram ilovalari matnni e'tiborsiz qoldiradi). */
function telegramUrl(username, id, hashar, amount) {
  const title = hashar && hashar.title ? ` "${hashar.title}"` : '';
  const text = `Assalomu alaykum! Hasharchilar: #${id}${title} hasharini e'lon qilish uchun ${formatSom(amount)} to'lamoqchiman.`;
  return `https://t.me/${encodeURIComponent(username)}?text=${encodeURIComponent(text)}`;
}

/** Telegram belgisi (qog'oz samolyot). */
function TelegramMark({ className, white = false }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {!white && <circle cx="12" cy="12" r="12" fill="#229ED9" />}
      <path
        fill="#fff"
        d="M5.5 11.7l10.9-4.2c.5-.2 1 .1.8.9l-1.9 8.8c-.1.6-.5.8-1 .5l-2.8-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.3-.1l-6.5 4.1-2.8-.9c-.6-.2-.6-.6.1-.9z"
      />
    </svg>
  );
}

export default function PaymentPage({ route }) {
  const id = route.params.id;
  const { user, ready } = useAuth();
  const toast = useToast();
  const actions = useActions();
  const h = useApi(...(user ? Q.hashar(id) : [null, null]));
  const pay = usePaymentStatus(id, { enabled: !!user });
  const [checking, setChecking] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const prevStatus = useRef(null);
  const status = pay.data && pay.data.status;

  useEffect(() => {
    if (!pay.loading) hideSplash();
  }, [pay.loading]);

  // unpaid → paid: animatsiya, haptika, keshlar yangilanadi
  useEffect(() => {
    if (!status) return;
    if (prevStatus.current === 'unpaid' && status !== 'unpaid') {
      setCelebrate(true);
      haptic('success');
      invalidate('hashars', `hashar:${id}`, 'me:', 'stats', 'user:', 'leaderboard');
      refreshUnread();
    }
    prevStatus.current = status;
  }, [status, id]);

  // Keshdagi hashar hali 'unpaid', server esa e'lon qilingan deydi (masalan, narx 0 — shu so'rovda bepul e'lon
  // qilindi): birinchi ko'rishda tabrik, hashar/ro'yxat keshlari yangilanadi
  const staleUnpaid = !!(status && status !== 'unpaid' && h.data && h.data.payment_status === 'unpaid');
  useEffect(() => {
    if (!staleUnpaid) return;
    setCelebrate(true);
    invalidate('hashars', `hashar:${id}`, 'me:', 'stats', 'user:', 'leaderboard');
    refreshUnread();
  }, [staleUnpaid, id]);

  if (ready && !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <EmptyState icon={WalletIcon} title="To'lov uchun kiring" text="Hasharingiz to'lovini ko'rish uchun hisobingizga kiring." action={<Link to="/kirish" className={cx(btn.primary, 'h-11 px-5')}>Kirish</Link>} />
      </div>
    );
  }

  const hashar = h.data;
  const info = pay.data;

  const check = async () => {
    setChecking(true);
    haptic('light');
    const r = await pay.reload();
    setChecking(false);
    if (r && r.status === 'unpaid') toast(Number(r.amount) > 0 ? "To'lov hali kelib tushmagan. Biroz kuting." : "Hashar hali administrator tasdig'ini kutmoqda.", 'info');
  };
  const openProvider = async (provider, url) => {
    haptic('medium');
    try {
      await (provider === 'telegram' ? openApp(url) : openExternal(url));
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    toast(
      provider === 'telegram'
        ? "Telegram ochildi. Administrator tasdiqlagach hashar o'zi e'lon qilinadi."
        : `${PROVIDER_LABEL[provider]} sahifasi ochildi. To'lovdan so'ng shu yerga qayting.`,
      'info',
    );
  };
  const copy = async (text, what) => {
    if (await copyText(text)) {
      haptic('select');
      toast(`${what} nusxalandi`);
    }
  };

  let body;
  if ((pay.loading && !info) || (h.loading && !hashar)) {
    body = (
      <div className="space-y-4" aria-hidden="true">
        <div className="skeleton h-40 rounded-[28px]" />
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-14 rounded-2xl" />
      </div>
    );
  } else if (pay.error && !info) {
    body =
      pay.error.status === 404 || pay.error.status === 403 ? (
        <EmptyState icon={AlertIcon} title="To'lov topilmadi" text="Bu hashar sizga tegishli emas yoki o'chirilgan." action={<Link to="/profil" className={cx(btn.primary, 'h-11 px-5')}>Profilga</Link>} />
      ) : (
        <ErrorState message={pay.error.message} onRetry={pay.reload} />
      );
  } else if (info && info.status !== 'unpaid') {
    body = <PaidView hashar={hashar || { id }} amount={info.status === 'paid' ? paidAmountOf(info) : null} celebrate={celebrate} waived={info.status === 'waived'} onShare={() => hashar && actions.share(hashar)} />;
  } else if (info) {
    const note = info.manual_note || '';
    const tg = info.telegram || '';
    const card = cardNumberIn(note);
    const providers = [info.payme_url && ['payme', info.payme_url], info.click_url && ['click', info.click_url]].filter(Boolean);
    const history = Array.isArray(info.history) ? info.history : [];
    // Narx 0 (bepul): egasining hashari serverda o'zi e'lon qilinadi; bu holat — admin (yoki eski server) uchun
    const free = !(Number(info.amount) > 0);
    const isAdminView = !!(user && user.is_admin) && !(hashar && hashar.is_owner);
    body = (
      <div className="space-y-4">
        {/* Summa va holat */}
        <section className="relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-soft">
          <div className="hero-bg relative px-5 pb-6 pt-5 text-white sm:px-7">
            <div className="grid-pattern absolute inset-0 opacity-60" />
            <div className="relative flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">E'lon narxi</p>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-300 px-3 py-1.5 text-xs font-extrabold text-amber-950 shadow-sm">
                <HourglassIcon className="h-3.5 w-3.5" /> {free ? 'Tasdiq kutilmoqda' : "To'lov kutilmoqda"}
              </span>
            </div>
            {free ? (
              // Narx 0 ga tushgan: "0 so'm to'lang" ko'rsatilmaydi — to'lov shart emas, faqat tasdiq
              <p className="relative mt-1 font-display text-[44px] font-extrabold leading-tight" data-testid="payment-free">
                Bepul
              </p>
            ) : (
              <p className="relative mt-1 whitespace-nowrap font-display text-[44px] font-extrabold leading-tight tabular" data-testid="payment-amount">
                {formatSom(info.amount).replace(" so'm", '')}
                <span className="ml-2 text-2xl font-bold text-white/75">so'm</span>
              </p>
            )}
            <p className="relative mt-3 max-w-md text-sm text-white/80">
              {free
                ? "To'lov shart emas. Hashar administrator tasdig'idan so'ng xaritada va ro'yxatda hammaga ko'rinadi."
                : "To'lovdan so'ng hasharingiz xaritada va ro'yxatda hammaga ko'rinadi. Hozircha uni faqat siz ko'rasiz."}
            </p>
          </div>
          {hashar && (
            <Link to={`/hashar/${hashar.id}`} className="flex items-center gap-3 p-4 transition hover:bg-surface-2">
              <Thumb hashar={hashar} className="h-14 w-14 shrink-0 rounded-2xl" iconClass="h-6 w-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{hashar.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-3">
                  <CalendarIcon className="h-4 w-4" /> {formatDateLong(hashar.date_time)}
                </span>
              </span>
            </Link>
          )}
        </section>

        {free && (
          <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft" data-testid="payment-wait-admin">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <ShieldIcon className="h-5 w-5 text-brand" /> Administrator tasdig'ini kuting
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              Hech narsa to'lash kerak emas. Administrator tasdiqlagach hashar avtomatik e'lon qilinadi va egasiga bildirishnoma keladi.
            </p>
            {isAdminView && (
              <button type="button" onClick={() => navigate('/admin/payments')} className={cx(btn.primary, 'mt-4 h-11 w-full px-5 sm:w-auto')}>
                <ShieldIcon className="h-4 w-4" /> Admin panelda e'lon qilish
              </button>
            )}
          </section>
        )}

        {/* To'lov usullari */}
        {!free && providers.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="px-1 text-sm font-extrabold uppercase tracking-wider text-ink-3">Onlayn to'lov</h2>
            {providers.map(([p, url]) => (
              <ProviderButton key={p} provider={p} url={url} onOpen={openProvider} />
            ))}
          </section>
        )}

        {!free && tg && (
          <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft" data-testid="telegram-payment">
            <div className="p-5">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
                <TelegramMark className="h-6 w-6" /> Telegram orqali to'lash
              </h2>
              <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-2">
                {[
                  <>
                    Administrator <b className="text-ink">@{tg}</b> ga Telegram'da yozing (xabar tayyor).
                  </>,
                  <>
                    U yuborgan karta raqamiga <b className="text-ink tabular">{formatSom(info.amount)}</b> o'tkazing va chekni yuboring.
                  </>,
                  <>Administrator tasdiqlagach hasharingiz avtomatik e'lon qilinadi — sizga bildirishnoma keladi.</>,
                ].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand">{i + 1}</span>
                    <span className="min-w-0">{t}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => openProvider('telegram', telegramUrl(tg, id, hashar, info.amount))}
                className="press mt-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#229ED9] px-5 text-base font-extrabold text-white shadow-lg shadow-sky-500/25 transition hover:bg-[#1c8fc5]"
                data-testid="telegram-pay"
              >
                <TelegramMark className="h-6 w-6" white /> @{tg} ga yozish
              </button>
              <p className="mt-3 flex gap-2 text-xs text-ink-3">
                <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Xabarda hashar raqami bo'ladi: <b className="text-ink">#{id}</b>. Telegram ochilmasa, @{tg} ni qidiruvdan toping.
                </span>
              </p>
            </div>
          </section>
        )}

        {!free && (note || !tg) && (
          <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft" data-testid="manual-payment">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <WalletIcon className="h-5 w-5 text-brand" /> {providers.length || tg ? "Qo'shimcha ma'lumot" : "To'lov usuli"}
            </h2>
            {note ? (
              <>
                <p className="mt-2 whitespace-pre-line break-words rounded-2xl bg-surface-2 p-4 text-[15px] font-medium leading-relaxed text-ink ring-1 ring-line">{note}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {card && (
                    <button type="button" onClick={() => copy(card.replace(/ /g, ''), 'Karta raqami')} className={cx(btn.soft, 'h-10 px-3.5 text-sm')}>
                      <CopyIcon className="h-4 w-4" /> {card}
                    </button>
                  )}
                  <button type="button" onClick={() => copy(note, "Ma'lumot")} className={cx(btn.ghost, 'h-10 px-3.5 text-sm')}>
                    <CopyIcon className="h-4 w-4" /> Nusxalash
                  </button>
                </div>
                <p className="mt-3 flex gap-2 text-sm text-ink-3">
                  <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    To'lov izohiga hashar raqamini yozing: <b className="text-ink">#{id}</b>. Administrator tasdiqlagach hashar avtomatik e'lon qilinadi.
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-3">
                {providers.length
                  ? "Qo'lda to'lov uchun administrator bilan bog'laning — tasdiqlangach hashar avtomatik e'lon qilinadi."
                  : "Onlayn to'lov hozircha sozlanmagan. Administrator to'lovni tasdiqlagach hasharingiz avtomatik e'lon qilinadi."}
              </p>
            )}
          </section>
        )}

        {history.length > 0 && (
          <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-3">To'lovlar tarixi</h2>
            <ul className="mt-3 divide-y divide-line">
              {history.map((p) => {
                const st = TX_STATUS[p.status] || TX_STATUS.unknown;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="font-bold text-ink">{PROVIDER_LABEL[p.provider] || p.provider}</span>
                    <span className="text-ink-3">{timeAgo(p.created_at)}</span>
                    <span className="ml-auto font-semibold tabular text-ink-2">{formatSom(p.amount)}</span>
                    <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', st.cls)}>{st.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="flex items-center justify-center gap-2 text-center text-xs font-semibold text-ink-3" role="status">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          Holat avtomatik tekshirilmoqda
        </p>
      </div>
    );
  }

  const unpaid = info && info.status === 'unpaid';
  const unpaidFree = unpaid && !(Number(info.amount) > 0);
  // To'lov bo'lmagan holatlar (bepul / narx 0 / v4 dan oldingi hashar) — "E'lon holati"
  const title = !info || (unpaid && !unpaidFree) ? "E'lon uchun to'lov" : info.status === 'paid' && paidAmountOf(info) ? "To'lov holati" : "E'lon holati";
  return (
    <div className="mx-auto max-w-xl px-4 pb-36 pt-4 lg:pb-16 lg:pt-8">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => goBack(`/hashar/${id}`)}
          aria-label="Orqaga"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface text-ink-2 shadow-sm active:scale-95"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Hashar #{id}</p>
          <h1 className="truncate text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-3 ring-1 ring-line sm:inline-flex">
          <ShieldIcon className="h-3.5 w-3.5" /> Xavfsiz
        </span>
      </div>
      {body}

      {unpaid && (
        <div className="glass fixed inset-x-0 bottom-0 z-[1200] border-t border-line px-4 pb-[calc(12px+var(--sab))] pt-3 lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-xl gap-3">
            <button type="button" onClick={() => navigate('/profil')} className={cx(btn.ghost, 'h-13 px-5 py-3.5')}>
              Keyinroq
            </button>
            <button type="button" onClick={check} disabled={checking} className={cx(btn.primary, 'h-13 flex-1 py-3.5 text-base')} data-testid="payment-check">
              {checking ? <Spinner /> : <RefreshIcon className="h-5 w-5" />} {unpaidFree ? 'Holatni tekshirish' : "To'lovni tekshirish"}
            </button>
          </div>
        </div>
      )}
      {!unpaid && info && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-ink-3">
          <CheckIcon className="h-4 w-4 text-brand" /> Hashar ommaga ko'rinadi
        </p>
      )}
    </div>
  );
}
