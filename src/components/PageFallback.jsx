// Sahifa kodi yuklanayotganda (lazy chunk) — umumiy skelet.
export function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 lg:px-6" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="skeleton h-8 w-48 rounded-full" />
      <div className="skeleton mt-3 h-4 w-72 max-w-full rounded-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton aspect-[16/12] rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
