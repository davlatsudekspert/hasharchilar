// Element ekranga yaqinlashganda true (bir marta): og'ir bloklar (xarita, reyting) kerak bo'lgandagina yuklanadi.
// Ishlatish: const [ref, seen] = useInView({ margin: '400px' }); <div ref={ref} />
import { useCallback, useEffect, useState } from 'react';

export function useInView({ margin = '400px' } = {}) {
  const [el, setEl] = useState(null);
  const [seen, setSeen] = useState(false);
  const ref = useCallback((node) => setEl(node), []);
  useEffect(() => {
    if (!el || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, margin, seen]);
  return [ref, seen];
}
