// Internet yo'q banneri (native — Network plagini, web — online/offline hodisalari).
import { useEffect, useState } from 'react';
import { watchNetwork } from '../lib/native.js';
import { invalidate } from '../lib/store.js';
import { WifiOffIcon } from './icons.jsx';

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let was = true;
    return watchNetwork((on) => {
      setOnline(on);
      if (on && !was) invalidate(''); // aloqa tiklanganda ma'lumotlar yangilanadi
      was = on;
    });
  }, []);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[4000] safe-top">
      <div className="mx-auto mt-2 flex w-fit items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/10">
        <WifiOffIcon className="h-4 w-4 text-amber-300" /> Internet aloqasi yo'q — oflayn rejim
      </div>
    </div>
  );
}
