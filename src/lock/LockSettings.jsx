// Profil → Sozlamalar: "Ilova qulfi" kartasi. APK'da — PIN / barmoq izi sozlamalari (alohida chunk),
// saytda — qisqa eslatma: bu imkoniyat faqat Android ilovada.
import { lazy, Suspense } from 'react';
import { SmartphoneIcon } from '../components/icons.jsx';
import { IS_NATIVE } from '../lib/config.js';
import { ShieldCheckIcon } from './icons.jsx';

const NativeSettings = IS_NATIVE ? lazy(() => import('./LockSettingsNative.jsx')) : null;

export default function LockSettings() {
  if (NativeSettings) {
    return (
      <Suspense fallback={<div className="skeleton h-[104px] rounded-3xl" aria-hidden="true" />}>
        <NativeSettings />
      </Suspense>
    );
  }
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft" data-testid="lock-settings">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand ring-1 ring-line">
          <ShieldCheckIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-ink">Ilova qulfi</h3>
          <p className="text-sm text-ink-3">PIN va barmoq izi faqat ilovada — Android ilovada hisobingizni PIN kod yoki barmoq izi bilan qulflang.</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand ring-1 ring-brand-line sm:inline-flex">
          <SmartphoneIcon className="h-3.5 w-3.5" /> APK
        </span>
      </div>
    </section>
  );
}
