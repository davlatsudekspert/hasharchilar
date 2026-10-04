// Sarlavha: logo, qidiruv, "+ Hashar e'lon qilish" (amber), profil / "Kirish".
import { initials } from '../lib/utils.js';
import { LeafIcon, PlusIcon, SearchIcon, UserIcon, XIcon } from './icons.jsx';

/** Logo. `compact` — sarlavhada: tor ekranda (< 380px) ".uz" yashiriladi va matn kerak bo'lsa qisqaradi. */
export function Logo({ className = '', compact = false }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${compact ? 'max-[380px]:gap-1.5' : ''} ${className}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-700/30">
        <LeafIcon className="h-5 w-5" strokeWidth={2.4} />
      </span>
      <span className={`min-w-0 truncate text-[17px] font-extrabold tracking-tight min-[400px]:text-[19px] sm:text-xl ${compact ? 'max-[380px]:text-base' : ''}`}>
        <span className="text-emerald-600">hashar</span>
        <span className="text-amber-500">chilar</span>
        <span className={`text-slate-400 ${compact ? 'max-[380px]:hidden' : ''}`}>.uz</span>
      </span>
    </span>
  );
}

function SearchBox({ query, onQuery, className = '' }) {
  return (
    <label
      className={`group flex items-center gap-2.5 rounded-xl bg-slate-100 px-3.5 py-2.5 text-slate-500 ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500 ${className}`}
    >
      <SearchIcon className="h-[18px] w-[18px] shrink-0" />
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Hashar, mahalla yoki manzil…"
        aria-label="Hasharlarni qidirish"
        className="w-full min-w-0 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQuery('')}
          aria-label="Qidiruvni tozalash"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-300/70 text-slate-700 hover:bg-slate-300"
        >
          <XIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
        </button>
      )}
    </label>
  );
}

export default function Header({ query, onQuery, onCreate, user, authReady, onProfile, onLogin }) {
  return (
    <header className="app-header sticky top-0 z-[1100] border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4">
        {/* min-w-0: 320–365px ekranlarda logo qisqaradi, tugmalar ekrandan chiqib ketmaydi */}
        <a href="./" aria-label="hasharchilar.uz — bosh sahifa" className="min-w-0 rounded-xl">
          <Logo compact />
        </a>

        <SearchBox query={query} onQuery={onQuery} className="ml-2 hidden max-w-md flex-1 md:flex" />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={onCreate}
            aria-label="Hashar e'lon qilish"
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-amber-400 px-2.5 text-sm font-bold text-slate-900 shadow-sm shadow-amber-500/30 transition hover:bg-amber-300 active:scale-[.98] sm:px-4"
          >
            <PlusIcon className="h-[18px] w-[18px]" strokeWidth={2.6} />
            <span className="hidden sm:inline">Hashar e'lon qilish</span>
            <span className="sm:hidden">E'lon</span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={onProfile}
              aria-label={`Profil: ${user.name}`}
              className="flex h-10 items-center gap-2 rounded-full transition hover:opacity-90"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white ring-2 ring-emerald-100">
                {initials(user.name)}
              </span>
              <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-slate-800 lg:inline">{user.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              disabled={!authReady}
              aria-label="Kirish"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 max-[374px]:w-10 max-[374px]:px-0 sm:px-4"
            >
              {/* < 375px: faqat ikonka (aria-label "Kirish" qoladi) */}
              <UserIcon className="hidden h-[18px] w-[18px] max-[374px]:block sm:block" />
              <span className="max-[374px]:sr-only">Kirish</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobilda qidiruv alohida qatorda */}
      <div className="mx-auto max-w-7xl px-4 pb-3 md:hidden">
        <SearchBox query={query} onQuery={onQuery} />
      </div>
    </header>
  );
}
