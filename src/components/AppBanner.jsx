// APK ma'lumoti (/api/app): saytda "Android ilovani yuklab olish" banneri, APK ichida — "Yangi versiya" banneri.
import { useEffect, useState } from 'react';
import { IS_NATIVE, mediaUrl } from '../lib/config.js';
import { nativeBuild } from '../lib/native.js';
import { Q } from '../lib/queries.js';
import { storage } from '../lib/storage.js';
import { peek, useApi } from '../lib/store.js';
import { DownloadIcon, SmartphoneIcon, XIcon } from './icons.jsx';

const DISMISS_KEY = 'hashar_app_banner_dismissed';
export const formatSize = (bytes) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '');

/** /api/app — birinchi ekrandan keyin (2.5 s) so'raladi; sessiyada keshlanadi. */
export function useAppInfo() {
  const [go, setGo] = useState(() => peek(Q.app[0]) !== undefined);
  useEffect(() => {
    if (go) return undefined;
    const t = setTimeout(() => setGo(true), 2500);
    return () => clearTimeout(t);
  }, [go]);
  const { data } = useApi(go ? Q.app[0] : null, Q.app[1]);
  return data && data.available ? data : null;
}

export const appDownloadUrl = (info) => mediaUrl((info && info.url) || '/api/app/download');

/** APK: o'rnatilgan versiyadan yangisi bormi (serverdagi versionCode > App.getInfo().build). */
function useUpdateAvailable(info) {
  const [build, setBuild] = useState(null);
  useEffect(() => {
    if (!IS_NATIVE) return undefined;
    let alive = true;
    nativeBuild().then((b) => alive && setBuild(b));
    return () => {
      alive = false;
    };
  }, []);
  return !!(info && build && info.versionCode && info.versionCode > build);
}

/** Saytda — faqat telefon brauzerida ko'rinadigan ixcham banner; APK'da — faqat yangi versiya chiqqanda. */
export default function AppBanner({ info }) {
  const [dismissed, setDismissed] = useState(() => storage.get(DISMISS_KEY));
  const update = useUpdateAvailable(info);
  if (!info || (IS_NATIVE && !update)) return null;
  const versionKey = (IS_NATIVE ? 'native-' : '') + (info.version || '1');
  if (dismissed === versionKey) return null;
  const dismiss = () => {
    storage.set(DISMISS_KEY, versionKey);
    setDismissed(versionKey);
  };
  const meta = [info.version && `v${info.version}`, formatSize(info.size)].filter(Boolean).join(' · ');
  return (
    <div className="bg-gradient-to-r from-brand-800 to-brand-600 text-white lg:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
          <SmartphoneIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-bold">{IS_NATIVE ? 'Yangi versiya' : 'Android ilovasi'}</p>
          {meta && <p className="truncate text-xs text-brand-100">{IS_NATIVE ? meta : `${meta} · bepul`}</p>}
        </div>
        {/* APK'da tashqi havola tizim brauzerida ochiladi (Capacitor) — yuklab olish o'sha yerda */}
        <a
          href={appDownloadUrl(info)}
          download={IS_NATIVE ? undefined : 'hasharchilar.apk'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-brand-800 hover:bg-brand-50"
        >
          <DownloadIcon className="h-4 w-4" /> {IS_NATIVE ? 'Yangilash' : 'Yuklash'}
        </a>
        <button type="button" onClick={dismiss} aria-label="Bannerni yopish" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-brand-100 hover:bg-white/10">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
