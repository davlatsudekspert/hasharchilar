// "Sozlamalar": hashar e'lon qilish narxi (so'm, 0 — bepul), qo'lda to'lov izohi (egasiga ko'rsatiladi) va
// to'lov provayderlari holati (Worker secret'lari sozlanganmi).
import { useEffect, useState } from 'react';
import { CheckIcon, InfoIcon, WalletIcon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { btn, ErrorState, inputCls, labelCls, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatSom } from '../lib/payments.js';
import { loadServerConfig } from '../lib/serverConfig.js';
import { cx } from '../lib/utils.js';
import { RowsSkeleton } from './shared.jsx';

const PRESETS = [0, 5000, 10000, 20000];

function ProviderRow({ name, on, hint }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', on ? 'bg-brand-500 shadow-[0_0_0_4px] shadow-brand-500/15' : 'bg-slate-300')} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-slate-900">{name}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold', on ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600')}>{on ? 'Yoqilgan' : 'Sozlanmagan'}</span>
    </li>
  );
}

export default function SettingsTab() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [tg, setTg] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    setError(null);
    api.admin
      .settings()
      .then((d) => {
        setData(d);
        setFee(String(d.hashar_fee ?? 0));
        setNote(d.manual_payment_note || '');
        setTg(d.payment_telegram || '');
      })
      .catch(setError);
  };
  useEffect(load, []);

  const save = async (e) => {
    e.preventDefault();
    const n = Number(fee);
    if (!Number.isInteger(n) || n < 0) {
      setFormError("Narx — 0 yoki musbat butun son (so'mda)");
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const d = await api.admin.saveSettings({ hashar_fee: n, manual_payment_note: note.trim(), payment_telegram: tg.trim() });
      setData(d);
      setFee(String(d.hashar_fee));
      setNote(d.manual_payment_note || '');
      setTg(d.payment_telegram || '');
      loadServerConfig(); // yaratish sahifasidagi narx darhol yangilansin
      toast('Sozlamalar saqlandi');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} onRetry={load} />;
  if (!data) return <RowsSkeleton rows={3} h="h-28" />;

  const dirty =
    String(data.hashar_fee) !== fee || (data.manual_payment_note || '') !== note || (data.payment_telegram || '') !== tg;
  const p = data.payments || {};
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <form onSubmit={save} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6" data-testid="admin-settings">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <WalletIcon className="h-5 w-5 text-brand-600" /> Hashar e'lon qilish narxi
        </h2>
        <p className="mt-1 text-sm text-slate-500">Yangi hasharlar uchun. 0 — bepul (hashar darhol e'lon qilinadi).</p>
        <label htmlFor="s-fee" className={cx(labelCls, 'mt-5')}>
          Narx (so'm)
        </label>
        <div className="relative">
          <input
            id="s-fee"
            inputMode="numeric"
            className={cx(inputCls, 'pr-16 font-bold tabular')}
            value={fee}
            onChange={(e) => setFee(e.target.value.replace(/\D/g, '').slice(0, 8))}
            data-testid="settings-fee"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">so'm</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFee(String(v))}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-bold transition', fee === String(v) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            >
              {v ? formatSom(v) : 'Bepul'}
            </button>
          ))}
        </div>

        <label htmlFor="s-tg" className={cx(labelCls, 'mt-6')}>
          To'lov uchun Telegram admin
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">@</span>
          <input
            id="s-tg"
            className={cx(inputCls, 'pl-9 font-semibold')}
            value={tg}
            maxLength={40}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setTg(e.target.value.replace(/\s/g, '').replace(/^@/, ''))}
            placeholder="developer_alii"
            data-testid="settings-telegram"
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">To'lov sahifasida "Telegram orqali to'lash" tugmasi shu adminga yozadi. Bo'sh — tugma ko'rinmaydi.</p>

        <label htmlFor="s-note" className={cx(labelCls, 'mt-6')}>
          Qo'lda to'lov izohi
        </label>
        <textarea
          id="s-note"
          rows={4}
          maxLength={500}
          className={cx(inputCls, 'resize-y')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={"Masalan: To'lovni 8600 **** **** 0000 kartaga o'tkazing (Ism F.). Izohga hashar raqamini yozing."}
          data-testid="settings-note"
        />
        <p className="mt-1 flex justify-between text-xs text-slate-500">
          <span>Hashar egasiga to'lov sahifasida ko'rsatiladi.</span>
          <span className="tabular">{note.length}/500</span>
        </p>
        {formError && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
            {formError}
          </p>
        )}
        <button type="submit" disabled={busy || !dirty} className={cx(btn.primary, 'mt-5 h-12 w-full sm:w-auto sm:px-8')} data-testid="settings-save">
          {busy ? <Spinner /> : <CheckIcon className="h-5 w-5" strokeWidth={2.6} />} Saqlash
        </button>
      </form>

      <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <h2 className="text-base font-extrabold text-slate-900">To'lov usullari</h2>
        <ul className="mt-1 divide-y divide-slate-100">
          <ProviderRow name="Payme" on={!!p.payme} hint={data.payme_test_mode ? 'Sinov rejimi (test.paycom.uz)' : 'PAYME_MERCHANT_ID, PAYME_KEY'} />
          <ProviderRow name="Click" on={!!p.click} hint="CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_SECRET_KEY" />
          <ProviderRow name="Telegram orqali (admin tasdiqlaydi)" on={!!data.payment_telegram} hint={data.payment_telegram ? `@${data.payment_telegram} · To'lovlar → Kutilayotganlar` : "Telegram username kiriting"} />
          <ProviderRow name="Qo'lda (admin tasdiqlaydi)" on={p.manual !== false} hint="To'lovlar → Kutilayotganlar" />
        </ul>
        <p className="mt-3 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          Provayder kalitlari Worker secret'larida saqlanadi (GitHub: HASHARCHILAR_PAYME_MERCHANT_ID va h.k.) — bu yerda ko'rsatilmaydi.
        </p>
      </aside>
    </div>
  );
}
