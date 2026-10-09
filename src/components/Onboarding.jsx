// Onboarding: APK birinchi ochilganda 3 slayd (nima, qanday, boshlash). Surib yoki tugma bilan o'tiladi;
// "O'tkazib yuborish" / Android "orqaga" — yopadi. Keyin ko'rsatilmaydi (localStorage['hashar_onboarded']).
import { useEffect, useRef, useState } from 'react';
import { registerModal } from '../lib/modals.js';
import { haptic } from '../lib/native.js';
import { markOnboarded } from '../lib/onboarding.js';
import { navigate } from '../lib/router.js';
import { cx } from '../lib/utils.js';
import { ArrowRightIcon, BellIcon, CameraIcon, CheckCircleIcon, HandIcon, LeafIcon, PinIcon, PlusIcon, QrIcon, SproutIcon, UsersIcon } from './icons.jsx';

const SLIDES = [
  {
    eyebrow: 'Nima bu?',
    title: 'Mahallani birga obod qilamiz',
    text: "Tozalash, ko'kalamzorlashtirish va ta'mirlash hasharlarini toping yoki o'zingiz tashkil qiling.",
    art: 'leaf',
  },
  {
    eyebrow: 'Qanday ishlaydi?',
    title: "Toping. Qo'shiling. Natijani ko'ring",
    text: "Xaritada yaqin hasharni tanlang, bir bosishda qo'shiling, QR kod bilan davomatni tasdiqlang — Oldin/Keyin natija hammaga ko'rinadi.",
    art: 'map',
  },
  {
    eyebrow: 'Boshladik!',
    title: 'Birinchi qadamni qo\'ying',
    text: "Hashar kuni yaqinlashganda eslatma yuboramiz. Ilovani PIN kod yoki barmoq izi bilan himoyalash mumkin — Profil → Sozlamalar.",
    art: 'start',
  },
];

function Art({ kind }) {
  const Center = kind === 'leaf' ? LeafIcon : kind === 'map' ? PinIcon : PlusIcon;
  const chips =
    kind === 'leaf'
      ? [
          [SproutIcon, "Ko'kalamzor", '-left-6 top-6'],
          [UsersIcon, '+12 ko\'ngilli', '-right-8 top-24'],
          [CheckCircleIcon, 'Bajarildi', 'left-0 bottom-2'],
        ]
      : kind === 'map'
        ? [
            [HandIcon, "Qo'shildingiz", '-left-8 top-10'],
            [QrIcon, 'Davomat ✓', '-right-6 top-4'],
            [CameraIcon, 'Oldin / Keyin', '-right-4 bottom-4'],
          ]
        : [
            [BellIcon, 'Ertaga 09:00', '-left-6 top-8'],
            [UsersIcon, 'Mahalla', '-right-8 top-28'],
            [LeafIcon, 'Obod', 'left-2 bottom-0'],
          ];
  return (
    <div className="relative mx-auto h-56 w-56" aria-hidden="true">
      <div className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/15" />
      <div className="absolute inset-7 rounded-full bg-white/10 ring-1 ring-white/20" />
      <div className="absolute inset-[3.6rem] grid place-items-center rounded-[34px] bg-white text-brand-600 shadow-2xl">
        <Center className="h-14 w-14" strokeWidth={2.2} />
      </div>
      {chips.map(([Icon, label, pos], i) => (
        <span
          key={label}
          className={cx('absolute flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold text-slate-800 shadow-xl', pos)}
          style={{ animation: `float ${5 + i}s ease-in-out infinite ${i * 0.6}s` }}
        >
          <Icon className="h-3.5 w-3.5 text-brand-600" /> {label}
        </span>
      ))}
    </div>
  );
}

export default function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  const trackRef = useRef(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const finish = (to) => {
    markOnboarded();
    haptic('success');
    doneRef.current?.();
    if (to) navigate(to);
  };

  useEffect(() => registerModal(() => finish()), []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n) => {
    const el = trackRef.current;
    if (!el) return;
    haptic('select');
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = trackRef.current;
    if (el) setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const last = i === SLIDES.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-label="Ilova bilan tanishuv" className="onboarding hero-bg fixed inset-0 z-[4500] flex flex-col text-white">
      <div className="grid-pattern pointer-events-none absolute inset-0" />
      <div className="safe-top relative flex items-center justify-between px-5 pt-3">
        <span className="font-display text-sm font-extrabold tracking-wide text-white/80">hasharchilar.uz</span>
        {!last && (
          <button type="button" onClick={() => finish()} className="rounded-full px-3 py-2 text-sm font-bold text-white/85 hover:bg-white/10">
            O'tkazib yuborish
          </button>
        )}
      </div>
      <div ref={trackRef} onScroll={onScroll} className="no-scrollbar relative flex flex-1 snap-x snap-mandatory overflow-x-auto">
        {SLIDES.map((s, n) => (
          <section key={s.title} className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-7 text-center" aria-hidden={n !== i}>
            <div className={cx('transition duration-500', n === i ? 'scale-100 opacity-100' : 'scale-90 opacity-40')}>
              <Art kind={s.art} />
            </div>
            <p className="mt-10 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">{s.eyebrow}</p>
            <h2 className="mt-2 max-w-sm text-[30px] font-extrabold leading-tight">{s.title}</h2>
            <p className="mt-3 max-w-sm text-[15.5px] leading-relaxed text-white/80">{s.text}</p>
          </section>
        ))}
      </div>
      <div className="relative px-6 pb-[calc(24px+var(--sab))] pt-4">
        <div className="mb-5 flex justify-center gap-2" role="tablist" aria-label="Slaydlar">
          {SLIDES.map((s, n) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`${n + 1}-slayd`}
              onClick={() => go(n)}
              className={cx('h-2 rounded-full transition-all duration-500', n === i ? 'w-7 bg-white' : 'w-2 bg-white/40')}
            />
          ))}
        </div>
        {last ? (
          <div className="mx-auto flex max-w-sm flex-col gap-2.5">
            <button type="button" onClick={() => finish('/xarita')} className="press h-14 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-400 text-base font-extrabold text-slate-950 shadow-cta">
              Hasharlarni topish
            </button>
            <button type="button" onClick={() => finish()} className="press h-12 rounded-2xl bg-white/10 text-[15px] font-bold text-white ring-1 ring-white/25">
              Bosh sahifaga
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => go(i + 1)} className="press mx-auto flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-white text-base font-extrabold text-brand-800 shadow-xl">
            Keyingi <ArrowRightIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
