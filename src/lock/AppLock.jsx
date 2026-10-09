// Ilova qulfi (PIN / barmoq izi) — faqat APK. Saytda o'tkazgich: hech narsa yuklanmaydi.
// APK'da qulf qatlami alohida chunk (LockLayer.jsx); ilova (children) doim o'z joyida qoladi —
// qulflash/ochishda qayta o'rnatilmaydi, holati (forma, scroll) saqlanadi.
import { lazy, Suspense } from 'react';
import { getToken } from '../lib/api.js';
import { IS_NATIVE } from '../lib/config.js';
import { storage } from '../lib/storage.js';

const LockLayer = IS_NATIVE ? lazy(() => import('./LockLayer.jsx')) : null;

/** Qulf chunk'i yuklanguncha: PIN yoqilgan bo'lsa ilova mazmuni ko'rinmasin. */
function Cover() {
  if (!getToken() || storage.get('hashar_lock_on') !== '1') return null;
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9000] bg-bg"
      style={{ background: 'linear-gradient(180deg, var(--c-surface), var(--c-bg))' }}
    />
  );
}

export default function AppLock({ children }) {
  if (!LockLayer) return children;
  return (
    <>
      {children}
      <Suspense fallback={<Cover />}>
        <LockLayer />
      </Suspense>
    </>
  );
}
