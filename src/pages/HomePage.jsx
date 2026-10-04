// Bosh sahifa: hero, jonli statistika, kategoriyalar, yaqinlashayotgan hasharlar, qanday ishlaydi,
// Oldin/Keyin vitrina, top ko'ngillilar, APK bloki.
import { useEffect, useMemo, useRef, useState } from 'react';
import { appDownloadUrl, formatSize } from '../components/AppBanner.jsx';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';
import HasharCard, { Thumb } from '../components/HasharCard.jsx';
import {
  ArrowRightIcon,
  CameraIcon,
  CATEGORY_ICONS,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  HandIcon,
  MapIcon,
  PinIcon,
  PlusIcon,
  ShieldIcon,
  SparklesIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from '../components/icons.jsx';
import { Avatar, btn, CardSkeleton, CategoryChip, EmptyState, Link, SectionHeader } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { IS_NATIVE, mediaUrl } from '../lib/config.js';
import { CATEGORIES } from '../lib/meta.js';
import { hideSplash } from '../lib/native.js';
import { navigate } from '../lib/router.js';
import { useApi } from '../lib/store.js';
import { cx, formatDay, sortHashars } from '../lib/utils.js';

function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) return undefined;
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function HeroStat({ value, label, icon: Icon }) {
  const n = useCountUp(value);
  return (
    <div className="rounded-2xl bg-white/[0.08] px-2 py-3 text-center ring-1 ring-white/15 backdrop-blur-sm sm:rounded-3xl sm:p-4 sm:text-left">
      <Icon className="hidden h-5 w-5 text-emerald-200 sm:block" />
      <p className="font-display text-2xl font-extrabold tabular text-white sm:mt-2 sm:text-3xl">{value == null ? '—' : n}</p>
      <p className="truncate text-[11px] font-medium text-emerald-100/80 sm:text-[13px]">{label}</p>
    </div>
  );
}

/** Hero o'ng tomonidagi "jonli" kompozitsiya (desktop). */
function HeroVisual({ next }) {
  const h = next || { id: 0, title: "Ko'cha bo'yiga 50 ta ko'chat ekish", category: 'greening', status: 'PENDING', address: 'Yunusobod tumani' };
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-[460px]" aria-hidden="true">
      <div className="absolute inset-6 rounded-[40px] bg-emerald-300/20 blur-3xl" />
      {/* Asosiy karta */}
      <div className="float-slow absolute left-6 top-4 w-[300px] overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900">
        <div className="relative h-40">
          <Thumb hashar={h} prefer="before" className="h-full w-full" iconClass="h-16 w-16" />
          <CategoryChip category={h.category} className="absolute left-3 top-3 bg-white/95 text-slate-800 shadow-sm" />
        </div>
      <div className="p-4">
          <p className="line-clamp-2 font-display text-[17px] font-extrabold leading-snug text-slate-900 dark:text-white">{h.title}</p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
            <PinIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{h.address || 'Toshkent'}</span>
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex -space-x-2">
              {['Aziz', 'Malika', 'Jasur', 'Dilnoza'].map((n) => (
                <Avatar key={n} name={n} size="sm" ring />
              ))}
            </div>
            <span className="rounded-2xl bg-gradient-to-b from-amber-300 to-amber-400 px-3.5 py-2 text-sm font-bold text-slate-950">Qatnashish</span>
          </div>
        </div>
      </div>
      {/* Suzuvchi chiplar */}
      <div className="absolute right-0 top-24 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-black/5 dark:bg-slate-900" style={{ animation: 'float 7s ease-in-out infinite 1s' }}>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <UsersIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">+3 ko'ngilli</p>
          <p className="text-xs text-slate-500">hozirgina qo'shildi</p>
        </div>
      </div>
      <div className="absolute bottom-10 right-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-black/5 dark:bg-slate-900" style={{ animation: 'float 8s ease-in-out infinite 2s' }}>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <TrophyIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">Mahalla qahramoni</p>
          <p className="text-xs text-slate-500">yangi nishon</p>
        </div>
      </div>
      <div className="absolute bottom-24 left-0 flex items-center gap-2 rounded-full bg-emerald-950/80 px-4 py-2 text-sm font-bold text-white shadow-xl ring-1 ring-white/10 backdrop-blur">
        <CheckCircleIcon className="h-4 w-4 text-emerald-300" /> Hashar yakunlandi
      </div>
    </div>
  );
}

/** Hero pastidagi dekorativ landshaft. */
const Hills = () => (
  <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-bg sm:h-32" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 110c120-30 240-46 360-30s220 50 360 44 260-60 400-62 200 30 320 40v58H0Z" fill="currentColor" opacity=".35" />
    <path d="M0 130c160-24 300-20 440 0s300 30 460 10 340-36 540-6v26H0Z" fill="currentColor" />
  </svg>
);

function Carousel({ children, label }) {
  const ref = useRef(null);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * Math.min(660, ref.current.clientWidth * 0.85), behavior: 'smooth' });
  return (
    <div className="relative">
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 pt-1" role="list" aria-label={label}>
        {children}
      </div>
      <div className="pointer-events-none absolute -top-16 right-0 hidden gap-2 sm:flex">
        <button type="button" onClick={() => scroll(-1)} aria-label="Oldingi" className={cx(btn.outline, 'pointer-events-auto h-11 w-11 rounded-full p-0')}>
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => scroll(1)} aria-label="Keyingi" className={cx(btn.outline, 'pointer-events-auto h-11 w-11 rounded-full p-0')}>
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: MapIcon, title: 'Toping', text: "Xaritada yoki ro'yxatda o'zingizga yaqin hasharni tanlang — sana, joy va kerakli narsalar ko'rsatilgan." },
  { icon: HandIcon, title: "Qo'shiling", text: "Bir bosishda qatnashing. Tashkilotchining telefoni ochiladi, kalendaringizga qo'shib qo'yasiz." },
  { icon: CameraIcon, title: 'Natijani ko\'ring', text: 'Hashar yakunida "Keyin" rasmi yuklanadi — Oldin/Keyin galereyada hamma ko\'radi.' },
];

export default function HomePage({ appInfo }) {
  const stats = useApi('stats', api.stats);
  const list = useApi('hashars:all', () => api.listHashars().then((l) => sortHashars(Array.isArray(l) ? l : [])));
  const top = useApi('leaderboard:all', () => api.leaderboard('all'));

  useEffect(() => {
    if (!list.loading) hideSplash();
  }, [list.loading]);

  const all = list.data || [];
  const upcoming = useMemo(() => all.filter((h) => h.status === 'PENDING').slice(0, 10), [all]);
  const completed = useMemo(() => all.filter((h) => h.status === 'COMPLETED' && h.before_url && h.after_url), [all]);
  const counts = useMemo(() => {
    const c = {};
    all.forEach((h) => (c[h.category || 'cleaning'] = (c[h.category || 'cleaning'] || 0) + 1));
    return c;
  }, [all]);
  const s = stats.data || {};
  const showcase = completed[0];
  const leaders = Array.isArray(top.data) ? top.data.slice(0, 5) : [];

  return (
    <div>
      {/* ---------------- HERO ---------------- */}
      <section className="hero-bg relative overflow-hidden text-white">
        <div className="grid-pattern absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-28 pt-10 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:px-6 lg:pb-36 lg:pt-20">
          <div className="fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-50 ring-1 ring-white/20 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
              </span>
              {s.upcoming != null ? `${s.upcoming} ta hashar sizni kutmoqda` : "Mahalla — bizning umumiy uyimiz"}
            </span>
            <h1 className="mt-5 text-[40px] font-extrabold leading-[1.05] sm:text-6xl lg:text-[68px]">
              Birgalikda <br className="hidden sm:block" />
              <span className="text-gradient">obod qilamiz</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-emerald-50/85 sm:text-lg">
              Mahallangizdagi tozalash, ko'kalamzorlashtirish va ta'mirlash hasharlarini xaritada toping, bir bosishda qo'shiling
              yoki o'zingiz e'lon qiling.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-14 px-7 text-base')}>
                <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
              </button>
              <button type="button" onClick={() => navigate('/xarita')} className={cx(btn.glass, 'h-14 px-7 text-base')}>
                <MapIcon className="h-5 w-5" /> Xaritada ko'rish
              </button>
            </div>
            <div className="mt-8 grid grid-cols-4 gap-2 sm:mt-10 sm:gap-3">
              <HeroStat value={stats.data ? s.hashars ?? 0 : null} label="Hasharlar" icon={SparklesIcon} />
              <HeroStat value={stats.data ? s.completed ?? 0 : null} label="Bajarildi" icon={CheckCircleIcon} />
              <HeroStat value={stats.data ? s.volunteers ?? 0 : null} label="Ko'ngillilar" icon={UsersIcon} />
              <HeroStat value={stats.data ? s.districts ?? s.upcoming ?? upcoming.length : null} label={s.districts != null ? 'Tumanlar' : 'Kutilmoqda'} icon={PinIcon} />
            </div>
          </div>
          <div className="hidden lg:block">
            <HeroVisual next={upcoming.find((h) => h.before_url) || upcoming[0]} />
          </div>
        </div>
        <Hills />
      </section>

      {/* ---------------- KATEGORIYALAR ---------------- */}
      <section className="relative z-[1] mx-auto -mt-16 max-w-7xl px-4 lg:-mt-20 lg:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c.id];
            return (
              <Link
                key={c.id}
                to={`/hasharlar?cat=${c.id}`}
                className="group relative overflow-hidden rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5"
              >
                <span className={cx('grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md', c.tint)}>
                  <Icon className="h-6 w-6" />
                </span>
                <p className="mt-3 font-display text-[15px] font-extrabold leading-tight text-ink sm:text-base">{c.label}</p>
                <p className="mt-1 hidden text-[13px] leading-snug text-ink-3 sm:block">{c.text}</p>
                <p className="mt-2 text-xs font-bold text-brand">{counts[c.id] || 0} ta hashar →</p>
                <Icon className="absolute -bottom-4 -right-4 h-20 w-20 text-ink opacity-[0.04] transition group-hover:scale-110" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ---------------- YAQINLASHAYOTGAN ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 lg:px-6 lg:pt-24">
        <SectionHeader
          eyebrow="Yaqinlashayotgan"
          title="Sizni kutayotgan hasharlar"
          text="Eng yaqin sanadagi hasharlar. Qo'shiling — qo'lingiz kerak!"
          action={
            <Link to="/hasharlar" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline sm:mr-28">
              Barchasi <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
        <div className="mt-6">
          {list.loading ? (
            <div className="no-scrollbar -mx-4 flex gap-4 overflow-hidden px-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="w-[290px] shrink-0 sm:w-[320px]">
                  <CardSkeleton />
                </div>
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyState
              title="Hozircha kutilayotgan hashar yo'q"
              text="Mahallangizda tozalash yoki daraxt ekish kerakmi? Birinchi bo'lib e'lon qiling — qo'shnilaringiz qo'shiladi."
              action={
                <button type="button" onClick={() => navigate('/yaratish')} className={cx(btn.cta, 'h-11 px-5')}>
                  <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
                </button>
              }
            />
          ) : (
            <Carousel label="Yaqinlashayotgan hasharlar">
              {upcoming.map((h) => (
                <div key={h.id} role="listitem" className="w-[290px] shrink-0 snap-start sm:w-[330px]">
                  <HasharCard hashar={h} className="h-full" />
                </div>
              ))}
            </Carousel>
          )}
        </div>
      </section>

      {/* ---------------- QANDAY ISHLAYDI ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 lg:px-6 lg:pt-24">
        <SectionHeader center eyebrow="Oddiy va tez" title="Qanday ishlaydi?" text="Uch qadam — va mahallangiz yanada go'zal." />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((st, i) => (
            <li key={st.title} className="relative rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <span className="absolute right-5 top-4 font-display text-6xl font-extrabold text-ink opacity-[0.06]">{i + 1}</span>
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line">
                <st.icon className="h-7 w-7" />
              </span>
              <h3 className="mt-5 text-xl font-extrabold text-ink">{st.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{st.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- OLDIN / KEYIN ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 lg:px-6 lg:pt-24">
        <div className="overflow-hidden rounded-[36px] border border-line bg-surface shadow-soft">
          <div className="grid items-center gap-8 p-5 sm:p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">Oldin / Keyin</p>
              <h2 className="mt-2 text-3xl font-extrabold text-ink sm:text-4xl">Natija — eng yaxshi motivatsiya</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
                Har bir yakunlangan hashar "oldin" va "keyin" rasmlari bilan saqlanadi. Slayderni suring va farqni o'zingiz ko'ring.
              </p>
              {showcase && (
                <div className="mt-5 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                  <p className="font-display font-extrabold text-ink">{showcase.title}</p>
                  <p className="mt-1 text-sm text-ink-3">
                    {showcase.address} · {formatDay(showcase.completed_at || showcase.date_time)} · {showcase.volunteer_count} ko'ngilli
                  </p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/natijalar" className={cx(btn.primary, 'h-12 px-6')}>
                  Galereyani ochish <ArrowRightIcon className="h-4 w-4" />
                </Link>
                {showcase && (
                  <Link to={`/hashar/${showcase.id}`} className={cx(btn.ghost, 'h-12 px-5')}>
                    Batafsil
                  </Link>
                )}
              </div>
            </div>
            {showcase ? (
              <BeforeAfterSlider before={mediaUrl(showcase.before_url)} after={mediaUrl(showcase.after_url)} alt={showcase.title} />
            ) : list.loading ? (
              <div className="skeleton aspect-[16/10] rounded-3xl" />
            ) : (
              <div className="grid aspect-[16/10] place-items-center rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 text-center dark:from-emerald-400/10 dark:to-emerald-400/5">
                <div className="px-6">
                  <CameraIcon className="mx-auto h-10 w-10 text-brand" />
                  <p className="mt-3 font-bold text-ink">Birinchi natija sizdan bo'lsin!</p>
                  <p className="mt-1 text-sm text-ink-3">Hasharni yakunlab "Keyin" rasmini yuklang.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- TOP KO'NGILLILAR ---------------- */}
      {leaders.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-16 lg:px-6 lg:pt-24">
          <SectionHeader
            eyebrow="Reyting"
            title="Top ko'ngillilar"
            text="Eng faol hasharchilar — ularga qo'shiling!"
            action={
              <Link to="/reyting" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline">
                To'liq reyting <ArrowRightIcon className="h-4 w-4" />
              </Link>
            }
          />
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {leaders.map((r, i) => (
              <li key={r.user.id}>
                <Link
                  to={`/u/${r.user.id}`}
                  className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift lg:flex-col lg:text-center"
                >
                  <div className="relative">
                    <Avatar name={r.user.name} src={r.user.avatar_url} size="lg" />
                    <span
                      className={cx(
                        'absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full text-[11px] font-extrabold ring-2 ring-surface',
                        i === 0 ? 'bg-amber-400 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-orange-300 text-slate-900' : 'bg-surface-3 text-ink-2',
                      )}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{r.user.name}</p>
                    <p className="text-xs font-semibold text-ink-3">
                      {r.score} ball · {r.joined} hashar
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ---------------- NEGA BIZ ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-16 lg:px-6 lg:pt-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ZapIcon, title: 'Bir bosishda', text: "Ro'yxatdan o'tish bir daqiqa. Qatnashish — bitta tugma." },
            { icon: ShieldIcon, title: 'Xavfsiz', text: "Telefon raqamingiz faqat tashkilotchiga, qo'shilganingizdan keyin ko'rinadi." },
            { icon: TrophyIcon, title: 'Rag\'bat', text: "Ball to'plang, nishonlar oling va mahalla reytingida yuqoriga ko'tariling." },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 rounded-3xl bg-surface-2 p-5 ring-1 ring-line">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface text-brand shadow-sm ring-1 ring-line">
                <f.icon className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-3">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- APK ---------------- */}
      {!IS_NATIVE && (
        <section className="mx-auto max-w-7xl px-4 py-16 lg:px-6 lg:py-24">
          <div className="hero-bg relative overflow-hidden rounded-[36px] px-6 py-10 text-white sm:px-10 lg:px-14 lg:py-14">
            <div className="grid-pattern absolute inset-0" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-200">Android ilova</p>
                <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Hasharchilar — cho'ntagingizda</h2>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-emerald-50/85">
                  Kamera bilan darhol rasm oling, joylashuvingiz bo'yicha yaqin hasharlarni toping va bir tegishda qo'shiling. Tez, yengil, bepul.
                </p>
                <ul className="mt-5 grid gap-2 text-sm font-semibold text-emerald-50 sm:grid-cols-2">
                  {['Oflayn rejimga tayyor', 'Tungi rejim', 'Kamera va GPS', 'Ulashish bir tegishda'].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <CheckCircleIcon className="h-4 w-4 text-amber-300" /> {t}
                    </li>
                  ))}
                </ul>
                <a href={appDownloadUrl(appInfo)} download="hasharchilar.apk" className={cx(btn.cta, 'mt-7 h-14 px-7 text-base')}>
                  <DownloadIcon className="h-5 w-5" /> APK yuklab olish
                  {appInfo && appInfo.size ? <span className="text-sm font-semibold opacity-70">· {formatSize(appInfo.size)}</span> : null}
                </a>
              </div>
              {/* Telefon maketi */}
              <div className="relative mx-auto hidden h-[360px] w-[200px] sm:block" aria-hidden="true">
                <div className="absolute inset-0 rounded-[36px] bg-slate-950 p-2.5 shadow-2xl ring-1 ring-white/20">
                  <div className="relative h-full overflow-hidden rounded-[28px] bg-gradient-to-b from-emerald-50 to-white">
                    <div className="h-24 bg-gradient-to-br from-emerald-700 to-emerald-500 p-3">
                      <div className="h-2 w-16 rounded-full bg-white/50" />
                      <div className="mt-3 h-3 w-28 rounded-full bg-white/90" />
                      <div className="mt-2 h-3 w-20 rounded-full bg-amber-300" />
                    </div>
                    <div className="space-y-2 p-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex gap-2 rounded-xl bg-white p-2 shadow-sm">
                          <div className={cx('h-10 w-10 rounded-lg bg-gradient-to-br', CATEGORIES[i].tint)} />
                          <div className="flex-1 space-y-1.5 pt-1">
                            <div className="h-2 w-full rounded-full bg-slate-200" />
                            <div className="h-2 w-2/3 rounded-full bg-slate-100" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-around border-t border-slate-100 bg-white">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      <span className="-mt-6 grid h-9 w-9 place-items-center rounded-full bg-amber-400 text-slate-900">
                        <PlusIcon className="h-5 w-5" strokeWidth={3} />
                      </span>
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {IS_NATIVE && <div className="h-12" />}
    </div>
  );
}
