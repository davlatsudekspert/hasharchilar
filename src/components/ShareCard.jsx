// Ulashish kartasi / sertifikat: yakunlangan hashar uchun canvas'da 1080×1350 rasm ("Men … hasharida qatnashdim",
// Oldin/Keyin suratlari, sana, manzil, logo) — yuklab olish yoki ulashish.
import { useEffect, useRef, useState } from 'react';
import { IS_NATIVE, mediaUrl, shareUrl } from '../lib/config.js';
import { categoryOf } from '../lib/meta.js';
import { haptic, shareLink } from '../lib/native.js';
import { cssVar } from '../lib/theme.jsx';
import { cx, formatDateLong, formatDay } from '../lib/utils.js';
import { DownloadIcon, ShareIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { btn, Spinner } from './ui.jsx';

const W = 1080;
const H = 1350;
const LEAF = 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z M2 21c0-3 1.9-5.5 6-7';
const DISPLAY = '"Manrope Variable", "Inter Variable", system-ui, sans-serif';
const SANS = '"Inter Variable", system-ui, sans-serif';

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const t = setTimeout(() => resolve(null), 7000);
    img.onload = () => (clearTimeout(t), resolve(img));
    img.onerror = () => (clearTimeout(t), resolve(null));
    img.src = src;
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rasmni berilgan to'rtburchakka "cover" qilib chizadi. */
function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxW && last.length > 1) last = last.slice(0, -1);
    cut[maxLines - 1] = `${last.trim()}…`;
    return cut;
  }
  return lines;
}

function pill(ctx, text, x, y, { bg, fg, size = 26 }) {
  ctx.font = `800 ${size}px ${SANS}`;
  const w = ctx.measureText(text).width + size * 1.3;
  const h = size * 1.75;
  ctx.fillStyle = bg;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size * 0.65, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

async function drawCard(canvas, { h, name, owner, withPhotos }) {
  const ctx = canvas.getContext('2d');
  const a = {
    950: cssVar('--a-950', '#022c22'),
    800: cssVar('--a-800', '#065f46'),
    700: cssVar('--a-700', '#047857'),
    600: cssVar('--a-600', '#059669'),
    400: cssVar('--a-400', '#34d399'),
    300: cssVar('--a-300', '#6ee7b7'),
  };
  try {
    await Promise.all([document.fonts.load(`800 96px ${DISPLAY}`), document.fonts.load(`600 32px ${SANS}`), document.fonts.load(`800 32px ${SANS}`)]);
  } catch {
    /* shriftsiz ham chiziladi */
  }

  // Fon
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, a[950]);
  g.addColorStop(0.5, a[800]);
  g.addColorStop(1, a[700]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.95, -60, 40, W * 0.95, -60, 820);
  glow.addColorStop(0, `${a[400]}88`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const warm = ctx.createRadialGradient(-80, H + 60, 40, -80, H + 60, 700);
  warm.addColorStop(0, 'rgba(250,204,21,0.22)');
  warm.addColorStop(1, 'transparent');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Logo
  ctx.fillStyle = '#fff';
  rr(ctx, 80, 76, 88, 88, 28);
  ctx.fill();
  ctx.save();
  ctx.translate(98, 94);
  ctx.scale(2.2, 2.2);
  ctx.strokeStyle = a[600];
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(LEAF));
  ctx.restore();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(162, 82, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `800 40px ${DISPLAY}`;
  ctx.fillStyle = '#fff';
  ctx.fillText('hashar', 192, 134);
  const hw = ctx.measureText('hashar').width;
  ctx.fillStyle = '#fcd34d';
  ctx.fillText('chilar', 192 + hw, 134);
  const cw = ctx.measureText('chilar').width;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('.uz', 192 + hw + cw, 134);
  ctx.font = `800 24px ${SANS}`;
  const label = owner ? 'TASHKILOTCHI' : 'SERTIFIKAT';
  const lw = ctx.measureText(label).width + 40;
  pill(ctx, label, W - 80 - lw, 92, { bg: 'rgba(252,211,77,0.95)', fg: '#422006', size: 24 });

  // Sarlavha
  ctx.fillStyle = '#fff';
  ctx.font = `800 92px ${DISPLAY}`;
  ctx.fillText(owner ? 'Men hashar' : 'Men hasharda', 80, 300);
  const grad = ctx.createLinearGradient(80, 0, 760, 0);
  grad.addColorStop(0, '#fde68a');
  grad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = grad;
  ctx.fillText(owner ? 'tashkil qildim!' : 'qatnashdim!', 80, 400);

  // Suratlar
  const px = 80;
  const py = 460;
  const pw = W - 160;
  const ph = 440;
  const before = withPhotos ? await loadImg(mediaUrl(h.before_url)) : null;
  const after = withPhotos ? await loadImg(mediaUrl(h.after_url)) : null;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = a[600];
  rr(ctx, px, py, pw, ph, 44);
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, px, py, pw, ph, 44);
  ctx.clip();
  if (before && after) {
    cover(ctx, before, px, py, pw / 2, ph);
    cover(ctx, after, px + pw / 2, py, pw / 2, ph);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + pw / 2 - 3, py, 6, ph);
    pill(ctx, 'OLDIN', px + 24, py + 24, { bg: 'rgba(15,23,42,0.7)', fg: '#fff', size: 22 });
    pill(ctx, 'KEYIN', px + pw / 2 + 24, py + 24, { bg: a[600], fg: '#fff', size: 22 });
  } else if (after || before) {
    cover(ctx, after || before, px, py, pw, ph);
  } else {
    const c = categoryOf(h.category);
    const cg = ctx.createLinearGradient(px, py, px + pw, py + ph);
    cg.addColorStop(0, c.color);
    cg.addColorStop(1, a[700]);
    ctx.fillStyle = cg;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(px + pw - 90, py + 60, 170, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px + pw / 2 - 90, py + ph / 2 - 95);
    ctx.scale(7.5, 7.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(LEAF));
    ctx.restore();
  }
  ctx.restore();

  // Hashar nomi va tafsilotlar
  ctx.fillStyle = '#fff';
  ctx.font = `800 52px ${DISPLAY}`;
  const lines = wrap(ctx, h.title, W - 160, 2);
  lines.forEach((l, i) => ctx.fillText(l, 80, 980 + i * 64));
  let y = 980 + lines.length * 64 + 12;
  ctx.font = `600 32px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const meta = [formatDay(h.completed_at || h.date_time) || formatDateLong(h.date_time), h.address].filter(Boolean).join('  ·  ');
  wrap(ctx, meta, W - 160, 2).forEach((l, i) => ctx.fillText(l, 80, y + i * 44));

  // Pastki panel
  const by = H - 170;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  rr(ctx, 80, by, W - 160, 110, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  rr(ctx, 80, by, W - 160, 110, 34);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(150, by + 55, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = a[700];
  ctx.font = `800 28px ${SANS}`;
  ctx.textAlign = 'center';
  const ini = String(name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  ctx.fillText(ini, 150, by + 65);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `800 32px ${SANS}`;
  ctx.fillText(wrap(ctx, name || 'Hasharchi', 470, 1)[0], 204, by + 50);
  ctx.font = `600 26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(`${h.volunteer_count || 1} ko'ngilli bilan birga`, 204, by + 86);
  ctx.textAlign = 'right';
  ctx.font = `800 28px ${DISPLAY}`;
  ctx.fillStyle = '#fcd34d';
  ctx.fillText('Birgalikda', W - 116, by + 50);
  ctx.fillStyle = '#fff';
  ctx.fillText('obod qilamiz', W - 116, by + 86);
  ctx.textAlign = 'left';
}

const toBlob = (canvas) => new Promise((resolve, reject) => {
  try {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png');
  } catch (e) {
    reject(e);
  }
});

export default function ShareCardModal({ hashar: h, user, onClose }) {
  const toast = useToast();
  const [img, setImg] = useState(null); // { url, blob }
  const [error, setError] = useState('');
  const urlRef = useRef(null);
  const owner = !!h.is_owner;

  useEffect(() => {
    let alive = true;
    (async () => {
      const make = async (withPhotos) => {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        await drawCard(canvas, { h, name: user?.name, owner, withPhotos });
        return toBlob(canvas);
      };
      let blob;
      try {
        blob = await make(true);
      } catch {
        // Surat boshqa domendan (CORS) — rasmsiz variant
        try {
          blob = await make(false);
        } catch {
          if (alive) setError("Rasmni tayyorlab bo'lmadi");
          return;
        }
      }
      if (!alive) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setImg({ url, blob });
    })();
    return () => {
      alive = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // Faqat hashar/foydalanuvchi almashganda qayta chiziladi (fondagi kesh yangilanishi bilan emas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.id, user?.name, owner]);

  const fileName = `hashar-${h.id}-sertifikat.png`;
  const download = () => {
    if (!img) return;
    haptic('light');
    const a = document.createElement('a');
    a.href = img.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (IS_NATIVE) toast('Rasm saqlanmasa — uni bosib turing va "Saqlash"ni tanlang', 'info');
    else toast('Rasm yuklab olindi');
  };
  const share = async () => {
    if (!img) return;
    haptic('light');
    const text = owner ? `Men "${h.title}" hasharini tashkil qildim!` : `Men "${h.title}" hasharida qatnashdim!`;
    try {
      const file = new File([img.blob], fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'hasharchilar.uz', text });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const r = await shareLink({ title: 'hasharchilar.uz', text, url: shareUrl(`/hashar/${h.id}`) });
    if (r === 'copied') toast('Havola nusxalandi');
  };

  return (
    <Modal title={owner ? 'Tashkilotchi kartasi' : 'Ishtirok sertifikati'} subtitle="Do'stlaringizga ulashing — ular ham qo'shilsin!" onClose={onClose} size="md" autoFocus={false}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={download} disabled={!img} className={cx(btn.outline, 'h-12 flex-1')} data-testid="share-card-download">
            <DownloadIcon className="h-5 w-5" /> Yuklab olish
          </button>
          <button type="button" onClick={share} disabled={!img} className={cx(btn.primary, 'h-12 flex-1')}>
            <ShareIcon className="h-5 w-5" /> Ulashish
          </button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[340px]">
        {img ? (
          <img src={img.url} alt="Ulashish kartasi" width={W} height={H} className="fade-up block h-auto w-full rounded-3xl shadow-lift ring-1 ring-line" data-testid="share-card-image" />
        ) : error ? (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
        ) : (
          <div className="skeleton grid aspect-[4/5] w-full place-items-center rounded-3xl">
            <Spinner className="h-6 w-6 text-brand" />
          </div>
        )}
      </div>
    </Modal>
  );
}
