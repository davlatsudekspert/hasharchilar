// Muvaffaqiyat animatsiyasi: aksent doira + chiziladigan belgi + konfetti nuqtalari (to'lov, davomat).
const DOTS = [
  [-70, -54, '#fbbf24'],
  [64, -60, 'var(--a-400)'],
  [-82, 18, 'var(--a-500)'],
  [84, 10, '#f472b6'],
  [-46, 70, '#60a5fa'],
  [50, 68, '#fbbf24'],
  [0, -86, 'var(--a-300)'],
  [-20, 88, 'var(--a-600)'],
];

export default function SuccessBurst({ size = 96 }) {
  return (
    <span className="burst mx-auto" style={{ width: size, height: size }} aria-hidden="true">
      <span className="burst__ring" />
      {DOTS.map(([dx, dy, c], i) => (
        <span key={i} className="burst__dot" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, background: c, animationDelay: `${120 + i * 25}ms` }} />
      ))}
      <span className="burst__core" style={{ width: size * 0.78, height: size * 0.78 }}>
        <svg viewBox="0 0 24 24" width={size * 0.4} height={size * 0.4} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path className="burst__check" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </span>
  );
}
