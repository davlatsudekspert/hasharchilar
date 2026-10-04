// "📱 Android ilovasini yuklab olish" banneri — faqat saytda (native emas) va /api/app available bo'lsa.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { IS_NATIVE, mediaUrl } from '../lib/config.js';
import { storage } from '../lib/storage.js';
import { DownloadIcon, XIcon } from './icons.jsx';

const DISMISS_KEY = 'hashar_app_banner_dismissed';

const formatSize = (bytes) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '');

/** Ilova ma'lumotini bir marta olish uchun hook (banner va footer uchun). */
export function useAppInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (IS_NATIVE) return undefined;
    let alive = true;
    api
      .appInfo()
      .then((d) => alive && d && d.available && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

export const appDownloadUrl = (info) => mediaUrl((info && info.url) || '/api/app/download');

export default function AppBanner({ info }) {
  // Yopilgan versiyani eslab qolamiz — yangi versiya chiqsa banner yana ko'rinadi
  const [dismissed, setDismissed] = useState(() => storage.get(DISMISS_KEY));
  if (IS_NATIVE || !info) return null;
  const versionKey = info.version || '1';
  if (dismissed === versionKey) return null;

  const dismiss = () => {
    storage.set(DISMISS_KEY, versionKey);
    setDismissed(versionKey);
  };
  const meta = [info.version && `v${info.version}`, formatSize(info.size)].filter(Boolean).join(' · ');

  return (
    <div className="bg-emerald-700 text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:py-2.5">
        <a
          href={appDownloadUrl(info)}
          download="hasharchilar.apk"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-sm font-semibold hover:underline"
        >
          <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15 sm:grid">
            <DownloadIcon className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate">📱 Android ilovasini yuklab olish</span>
            {meta && <span className="hidden shrink-0 text-xs font-medium text-emerald-100 min-[420px]:inline">{meta}</span>}
          </span>
        </a>
        <a
          href={appDownloadUrl(info)}
          download="hasharchilar.apk"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 hover:bg-emerald-50 sm:inline-flex"
        >
          <DownloadIcon className="h-4 w-4" /> Yuklab olish
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Bannerni yopish"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-emerald-100 hover:bg-white/10 hover:text-white"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
