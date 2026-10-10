// Loyiha haqida + FAQ.
import { useState } from 'react';
import { ArrowRightIcon, CameraIcon, ChevronDownIcon, GlobeIcon, HandIcon, HeartIcon, LeafIcon, MapIcon, ShieldIcon, TrophyIcon, UsersIcon } from '../components/icons.jsx';
import { btn, Link, SectionHeader } from '../components/ui.jsx';
import { Q } from '../lib/queries.js';
import { useApi } from '../lib/store.js';
import { SITE_URL } from '../lib/config.js';
import { cx } from '../lib/utils.js';

const FAQ = [
  ['Hashar nima?', "Hashar — o'zbek xalqining azaliy an'anasi: qo'shnilar birgalikda mahalla uchun foydali ishni bajaradi. Bu platforma hasharlarni topish va tashkil qilishni osonlashtiradi."],
  ['Qatnashish pullikmi?', "Yo'q, platforma to'liq bepul. Hasharlar ham ixtiyoriy va beg'araz."],
  ["Hasharga qanday qo'shilaman?", "Hashar sahifasida \"Qatnashish\" tugmasini bosing. Birinchi marta telefon raqamingiz bilan ro'yxatdan o'tasiz — bir daqiqa vaqt oladi."],
  ["Telefon raqamim kimga ko'rinadi?", "Raqamingiz hech kimga ko'rinmaydi. Faqat tashkilotchining raqami — siz hasharga qo'shilganingizdan keyin sizga ko'rinadi."],
  ["O'zim hashar e'lon qila olamanmi?", "Albatta! \"＋\" tugmasini bosing, kategoriya, joy va vaqtni tanlang, \"Oldin\" rasmini yuklang. Hashar yakunlangach \"Keyin\" rasmini qo'shasiz."],
  ['Ball va nishonlar nima uchun?', "Qatnashganingiz uchun 3, tashkil qilganingiz uchun 5, yakunlangan har bir hashar uchun 10 ball olasiz. Ballar reytingda, nishonlar profilingizda ko'rinadi."],
  ['Android ilova bormi?', "Ha — sayt pastidagi yoki bosh sahifadagi \"APK yuklab olish\" tugmasi orqali o'rnating. Ilova kamera, GPS va tungi rejimni qo'llaydi."],
];

const VALUES = [
  { icon: UsersIcon, title: 'Jamoa', text: "Har bir mahalla — katta oila. Birga qilingan ish tez va quvnoq bitadi." },
  { icon: LeafIcon, title: 'Ekologiya', text: "Toza havo, yashil ko'chalar va ozoda ariqlar — kelajak avlod uchun." },
  { icon: ShieldIcon, title: 'Ishonch', text: "Shaxsiy ma'lumotlar himoyalangan, natijalar ochiq va shaffof." },
  { icon: GlobeIcon, title: 'Ochiqlik', text: 'Platforma bepul va hamma uchun ochiq — sayt va Android ilova.' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="font-bold text-ink">{q}</span>
        <ChevronDownIcon className={cx('h-5 w-5 shrink-0 text-ink-3 transition', open && 'rotate-180 text-brand')} />
      </button>
      {open && <p className="fade-up px-5 pb-5 text-[15px] leading-relaxed text-ink-3">{a}</p>}
    </li>
  );
}

export default function AboutPage() {
  const stats = useApi(...Q.stats);
  const s = stats.data || {};
  return (
    <div>
      <section className="hero-bg relative overflow-hidden text-white">
        <div className="grid-pattern absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-4 py-14 text-center sm:py-20 lg:px-6">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/20">
            <HeartIcon className="h-8 w-8 text-amber-300" />
          </span>
          <h1 className="mt-5 text-4xl font-extrabold sm:text-5xl">
            Hashar — <span className="text-gradient">bizning an'anamiz</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-brand-50/85">
            hasharchilar.uz — mahalla hasharlarini zamonaviy usulda tashkil qilish platformasi. Biz qo'shnilarni birlashtiramiz, natijani esa hamma ko'radi.
          </p>
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-3">
            {[
              [s.hashars, 'hashar'],
              [s.volunteers, "ko'ngilli"],
              [s.completed, 'natija'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-3xl bg-white/[0.08] p-4 ring-1 ring-white/15">
                <p className="font-display text-3xl font-extrabold tabular">{v ?? '—'}</p>
                <p className="text-sm text-brand-100/80">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14 lg:px-6">
        <SectionHeader center eyebrow="Qadriyatlar" title="Nimaga ishonamiz" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line">
                <v.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-extrabold text-ink">{v.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14 lg:px-6">
        <SectionHeader center eyebrow="Qanday ishlaydi" title="To'rt oddiy qadam" />
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            [MapIcon, 'Toping', "Xarita yoki ro'yxatdan yaqin hasharni tanlang."],
            [HandIcon, "Qo'shiling", 'Bir bosishda qatnashing, kalendarga qo\'shing.'],
            [CameraIcon, 'Natija', '"Keyin" rasmi bilan natijani ko\'rsating.'],
            [TrophyIcon, 'Rag\'bat', "Ball va nishonlar to'plang."],
          ].map(([Icon, t, d], i) => (
            <li key={t} className="relative rounded-3xl bg-surface-2 p-5 ring-1 ring-line">
              <span className="font-display text-sm font-extrabold text-brand">0{i + 1}</span>
              <Icon className="mt-3 h-7 w-7 text-ink" />
              <h3 className="mt-3 font-extrabold text-ink">{t}</h3>
              <p className="mt-1 text-sm text-ink-3">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 lg:px-6">
        <SectionHeader center eyebrow="FAQ" title="Ko'p so'raladigan savollar" />
        <ul className="mt-8 overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
          {FAQ.map(([q, a]) => (
            <FaqItem key={q} q={q} a={a} />
          ))}
        </ul>
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-extrabold text-ink">Tayyormisiz? Mahallangiz sizni kutmoqda.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/yaratish" className={cx(btn.cta, 'h-12 px-6')}>
              Hashar e'lon qilish
            </Link>
            <Link to="/xarita" className={cx(btn.outline, 'h-12 px-6')}>
              Xaritani ochish <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <p className="text-sm text-ink-3">
            <a href={`${SITE_URL}/privacy.html`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
              Maxfiylik siyosati
            </a>
            {' · '}
            <a href={`${SITE_URL}/delete-account.html`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
              Hisobni o'chirish
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
