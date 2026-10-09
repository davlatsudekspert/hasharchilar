// Qulf moduli ikonkalari (lucide uslubida, 24x24, stroke 2).
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  focusable: false,
};
const icon = (paths) => {
  const Icon = (p) => (
    <svg {...base} {...p}>
      {paths}
    </svg>
  );
  return Icon;
};

export const FingerprintIcon = icon(
  <>
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </>,
);
export const BackspaceIcon = icon(
  <>
    <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
    <path d="m12 9 6 6" />
    <path d="m18 9-6 6" />
  </>,
);
export const LockIcon = icon(
  <>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>,
);
export const LockOpenIcon = icon(
  <>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </>,
);
export const ShieldCheckIcon = icon(
  <>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const TimerIcon = icon(
  <>
    <path d="M10 2h4" />
    <path d="m12 14 3-3" />
    <circle cx="12" cy="14" r="8" />
  </>,
);
export const KeypadIcon = icon(
  <>
    <circle cx="6" cy="5" r="1.2" />
    <circle cx="12" cy="5" r="1.2" />
    <circle cx="18" cy="5" r="1.2" />
    <circle cx="6" cy="11" r="1.2" />
    <circle cx="12" cy="11" r="1.2" />
    <circle cx="18" cy="11" r="1.2" />
    <circle cx="6" cy="17" r="1.2" />
    <circle cx="12" cy="17" r="1.2" />
    <circle cx="18" cy="17" r="1.2" />
    <circle cx="12" cy="22" r="1.2" />
  </>,
);
