// Ro'yxatlarda "tortib yangilash" (sensorli ekranlar). Sahifa eng tepada bo'lganda pastga tortilsa ishlaydi.
import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/native.js';
import { cx } from '../lib/utils.js';
import { RefreshIcon } from './icons.jsx';

const THRESHOLD = 72;

export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef(null);
  const pullRef = useRef(0);
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    const onStart = (e) => {
      if (window.scrollY > 0 || document.documentElement.classList.contains('modal-open')) return;
      start.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const v = Math.min(110, dy * 0.5);
      if (v >= THRESHOLD && pullRef.current < THRESHOLD) haptic('select');
      pullRef.current = v;
      setPull(v);
    };
    const onEnd = async () => {
      if (start.current == null) return;
      start.current = null;
      const v = pullRef.current;
      pullRef.current = 0;
      setPull(0);
      if (v >= THRESHOLD) {
        setBusy(true);
        try {
          await cbRef.current?.();
        } finally {
          setBusy(false);
        }
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const shown = busy ? 56 : pull;
  return (
    <>
      <div
        aria-hidden={!busy}
        className="pointer-events-none fixed inset-x-0 z-[1150] flex justify-center"
        style={{ top: 'calc(64px + var(--sat))', transform: `translateY(${shown - 44}px)`, opacity: shown ? 1 : 0, transition: start.current == null ? 'all .25s' : 'none' }}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-brand shadow-lift ring-1 ring-line">
          <RefreshIcon className={cx('h-5 w-5', busy && 'animate-spin')} style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
        </span>
      </div>
      {busy && <span className="sr-only" role="status">Yangilanmoqda…</span>}
      {children}
    </>
  );
}
