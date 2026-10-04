// Ixcham hero: sarlavha, subtitr va /api/stats dan 3 ta jonli raqam.
import { CheckIcon, LeafIcon, UsersIcon } from './icons.jsx';

const nf = new Intl.NumberFormat('uz-UZ');
const fmt = (n) => (typeof n === 'number' ? nf.format(n).replace(/\s/g, ' ') : '—');

function Stat({ icon: Icon, value, label, loading, tone }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-200/70 sm:p-4">
      <span className={`hidden h-11 w-11 shrink-0 place-items-center rounded-xl sm:grid ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        {loading ? (
          <span className="skeleton block h-7 w-12 rounded-lg" />
        ) : (
          <span className="block text-[22px] font-black leading-none tracking-tight text-slate-900 sm:text-[28px]">{fmt(value)}</span>
        )}
        <span className="mt-1 block truncate text-xs font-semibold text-slate-500 sm:text-sm">{label}</span>
      </div>
    </div>
  );
}

export default function Hero({ stats, loading }) {
  return (
    <section className="py-5 sm:py-8">
      <p className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100 sm:inline-flex">
        <LeafIcon className="h-3.5 w-3.5" /> Mahalla hasharlari platformasi
      </p>
      <h1 className="text-[28px] font-black leading-[1.08] tracking-tight text-slate-900 sm:mt-3 sm:text-5xl">
        Birgalikda <span className="text-emerald-600">obod</span> qilamiz
      </h1>
      {/* Desktopda: subtitr chapda, raqamlar o'ngda — hero ixcham qoladi */}
      <div className="mt-2 grid grid-cols-1 gap-4 sm:mt-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:items-center lg:gap-10">
        <p className="max-w-xl text-[15px] leading-snug text-slate-600 sm:text-lg sm:leading-relaxed">
          Mahallangizdagi hasharlarni xaritada toping, bir bosishda qo'shiling yoki o'zingiz e'lon qiling.
          <span className="hidden sm:inline"> Tozalash, ko'kalamzorlashtirish, obodonlashtirish — hammasi bir joyda.</span>
        </p>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <Stat icon={LeafIcon} value={stats?.hashars} label="hasharlar" loading={loading} tone="bg-amber-50 text-amber-600" />
          <Stat icon={CheckIcon} value={stats?.completed} label="bajarildi" loading={loading} tone="bg-emerald-50 text-emerald-600" />
          <Stat icon={UsersIcon} value={stats?.volunteers} label="ko'ngillilar" loading={loading} tone="bg-sky-50 text-sky-600" />
        </div>
      </div>
    </section>
  );
}
