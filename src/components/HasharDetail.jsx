// Hashar tafsiloti (modal/sheet): rasm yoki Oldin/Keyin slayder, ma'lumotlar, ko'ngillilar,
// tashkilotchi telefoni, xaritada ochish; egasi uchun Yakunlash/O'chirish; qo'shilgan uchun Chiqish.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { mediaUrl } from '../lib/config.js';
import { cx, formatDateLong, formatDay, formatKm, formatPhone, osmLink, volunteersLabel } from '../lib/utils.js';
import BeforeAfterSlider from './BeforeAfterSlider.jsx';
import { JoinButton } from './HasharCard.jsx';
import { AlertIcon, CalendarIcon, CheckIcon, ExternalIcon, LogOutIcon, PackageIcon, PhoneIcon, PinIcon, TrashIcon, UsersIcon } from './icons.jsx';
import Modal from './Modal.jsx';
import PhotoInput from './PhotoInput.jsx';
import { Avatar, btn, ItemChips, Spinner, StatusBadge } from './ui.jsx';

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-0.5 text-[15px] font-semibold text-slate-900">{children}</div>
      </div>
    </div>
  );
}

function Section({ title, children, aside }) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function HasharDetail({ hashar, distance, onClose, onJoin, onLeave, onComplete, onDelete, joinBusy }) {
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState(null); // null | 'complete' | 'delete'
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false); // "Keyin" rasmi hali siqilmoqda
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const completeRef = useRef(null);
  const topRef = useRef(null);

  // "Yakunlash" bosilganda rasm bo'limiga aylantiramiz
  useEffect(() => {
    const el = completeRef.current;
    const box = el && el.closest('.overflow-y-auto');
    if (mode !== 'complete' || !box) return;
    // scrollIntoView butun panelni siljitib yuboradi — faqat tana konteynerini aylantiramiz
    const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
    box.scrollTo({ top, behavior: 'smooth' });
  }, [mode]);

  // To'liq ma'lumot (ko'ngillilar ro'yxati, telefon) — qo'shilish/holat o'zgarsa qayta olinadi
  useEffect(() => {
    let alive = true;
    setLoadError('');
    api
      .getHashar(hashar.id)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [hashar.id, hashar.joined, hashar.status, hashar.volunteer_count]);

  // Ro'yxatdagi (eng yangi) holat + tafsilotdagi qo'shimcha maydonlar
  const h = {
    ...(detail || {}),
    ...hashar,
    creator: { ...(hashar.creator || {}), ...((detail && detail.creator) || {}) },
    volunteers: detail ? detail.volunteers : null,
  };
  const done = h.status === 'COMPLETED';
  const before = mediaUrl(h.before_url);
  const after = mediaUrl(h.after_url);
  // Telefon faqat qatnashuvchi/egasiga (chiqqandan keyin eski javobdagi raqam ko'rinmasin)
  const phone = (h.joined || h.is_owner) && h.creator ? h.creator.phone : null;

  const run = async (fn) => {
    setBusy(true);
    setActionError('');
    try {
      await fn();
      setMode(null);
      setAfterPhoto(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ----- Pastki panel (holatga qarab) -----
  let footer;
  if (mode === 'complete') {
    footer = (
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => setMode(null)} className={cx(btn.ghost, 'h-12 px-5')}>
          Bekor
        </button>
        <button
          type="button"
          disabled={busy || photoBusy || !afterPhoto}
          onClick={() =>
            run(async () => {
              await onComplete(h.id, afterPhoto);
              // Yakunlangach yangi Oldin/Keyin slayder ko'rinsin — tana tepasiga qaytamiz
              topRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
            })
          }
          className={cx(btn.primary, 'h-12 flex-1')}
        >
          {busy || photoBusy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} Yakunlashni tasdiqlash
        </button>
      </div>
    );
  } else if (mode === 'delete') {
    footer = (
      <div>
        <p className="mb-3 flex items-start gap-2 text-sm font-medium text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> Hasharni o'chirasizmi? Bu amalni qaytarib bo'lmaydi.
        </p>
        <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={() => setMode(null)} className={cx(btn.ghost, 'h-12 flex-1')}>
            Bekor
          </button>
          <button type="button" disabled={busy} onClick={() => run(() => onDelete(h.id))} className={cx(btn.danger, 'h-12 flex-1')}>
            {busy ? <Spinner /> : <TrashIcon className="h-5 w-5" />} Ha, o'chirish
          </button>
        </div>
      </div>
    );
  } else if (h.is_owner && !done) {
    footer = (
      <div className="flex gap-3">
        <button type="button" onClick={() => setMode('complete')} className={cx(btn.primary, 'h-12 flex-1')}>
          <CheckIcon className="h-5 w-5" strokeWidth={2.6} /> Yakunlash (Keyin rasmi)
        </button>
        <button type="button" onClick={() => setMode('delete')} aria-label="Hasharni o'chirish" className={cx(btn.dangerSoft, 'h-12 px-4')}>
          <TrashIcon className="h-5 w-5" /> <span className="hidden sm:inline">O'chirish</span>
        </button>
      </div>
    );
  } else if (h.joined && !done) {
    footer = (
      <div className="flex items-center gap-3">
        <JoinButton hashar={h} size="lg" className="flex-1" />
        <button type="button" disabled={busy} onClick={() => run(() => onLeave(h.id))} className={cx(btn.outline, 'h-12 px-4')}>
          {busy ? <Spinner /> : <LogOutIcon className="h-5 w-5" />} Chiqish
        </button>
      </div>
    );
  } else {
    footer = <JoinButton hashar={h} size="lg" busy={joinBusy} onJoin={onJoin} className="w-full" />;
  }

  return (
    <Modal
      title={h.title}
      subtitle={h.creator && h.creator.name ? `Tashkilotchi: ${h.creator.name}` : null}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          {actionError && (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
              {actionError}
            </p>
          )}
          {footer}
        </>
      }
      size="lg"
    >
      <div ref={topRef} />
      {/* Rasm */}
      {done && before && after ? (
        <BeforeAfterSlider before={before} after={after} alt={h.title} />
      ) : before || after ? (
        <div className="relative overflow-hidden rounded-2xl bg-slate-100">
          <img src={after || before} alt={`${h.title} — ${after ? 'keyin' : 'oldin'}`} className="aspect-[16/9] w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            {after ? 'Keyin' : 'Oldin'}
          </span>
        </div>
      ) : null}

      <div className={cx('flex flex-wrap items-center gap-2', (before || after) && 'mt-4')}>
        <StatusBadge status={h.status} />
        {h.joined && !done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
            <CheckIcon className="h-3 w-3" strokeWidth={3} /> Siz qatnashasiz
          </span>
        )}
        {h.is_owner && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Sizning hasharingiz</span>}
        {distance != null && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800">{formatKm(distance)} uzoqlikda</span>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoRow icon={CalendarIcon} label={done ? "Bo'lib o'tdi" : 'Qachon'}>
          {formatDateLong(h.date_time)}
          {done && h.completed_at && <p className="text-sm font-medium text-emerald-700">Yakunlandi: {formatDay(h.completed_at)}</p>}
        </InfoRow>
        <InfoRow icon={UsersIcon} label="Ko'ngillilar">
          {volunteersLabel(h.volunteer_count)}
        </InfoRow>
        <div className="sm:col-span-2">
          <InfoRow icon={PinIcon} label="Manzil">
            <span className="break-words">{h.address || 'Xaritada belgilangan joy'}</span>
            <a
              href={osmLink(h.lat, h.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex w-fit items-center gap-1 text-sm font-bold text-emerald-700 hover:underline"
            >
              Xaritada ochish <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          </InfoRow>
        </div>
      </div>

      {h.description && (
        <Section title="Tavsif">
          <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-slate-700">{h.description}</p>
        </Section>
      )}

      {h.items && h.items.length > 0 && (
        <Section title="Kerakli narsalar" aside={<PackageIcon className="h-4 w-4 text-slate-400" />}>
          <ItemChips items={h.items} />
        </Section>
      )}

      {/* Tashkilotchi */}
      <Section title="Tashkilotchi">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
          <Avatar name={h.creator && h.creator.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-900">{(h.creator && h.creator.name) || "Noma'lum"}</p>
            <p className="text-sm text-slate-500">
              {phone ? formatPhone(phone) : h.joined || h.is_owner ? 'Yuklanmoqda…' : "Telefon qo'shilganingizdan keyin ko'rinadi"}
            </p>
          </div>
          {phone && !h.is_owner && (
            <a href={`tel:${phone}`} className={cx(btn.soft, 'h-10 px-3.5 text-sm')} aria-label={`Qo'ng'iroq qilish: ${formatPhone(phone)}`}>
              <PhoneIcon className="h-4 w-4" /> Qo'ng'iroq
            </a>
          )}
        </div>
      </Section>

      {/* Ko'ngillilar ro'yxati */}
      <Section title={`Ko'ngillilar${h.volunteers ? ` · ${h.volunteers.length}` : ''}`}>
        {loadError ? (
          <p className="text-sm text-slate-500">{loadError}</p>
        ) : !h.volunteers ? (
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton h-9 w-28 rounded-full" />
            ))}
          </div>
        ) : h.volunteers.length === 0 ? (
          <p className="text-sm text-slate-500">Hali hech kim qo'shilmagan — birinchi bo'ling!</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {h.volunteers.map((v) => (
              <li key={v.id} className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
                <Avatar name={v.name} size="sm" />
                {v.name}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Egasi: "Keyin" rasmi bilan yakunlash */}
      {mode === 'complete' && (
        <div ref={completeRef}>
        <Section title="Yakunlash">
          <p className="mb-3 text-sm text-slate-600">
            Hashardan keyingi holatni suratga oling. Rasm "Oldin/Keyin" galereyasida ko'rsatiladi.
          </p>
          <PhotoInput
            value={afterPhoto}
            onChange={setAfterPhoto}
            onBusyChange={setPhotoBusy}
            title={'"Keyin" rasmini yuklang'}
            hint="Majburiy · JPG, PNG yoki WebP"
          />
        </Section>
        </div>
      )}
    </Modal>
  );
}
