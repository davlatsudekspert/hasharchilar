// Kirish / ro'yxatdan o'tish sahifasi (#/kirish). Kirgandan keyin profilga (yoki ?next= ga) o'tadi.
import { useEffect } from 'react';
import AuthForm from '../components/AuthForm.jsx';
import { CheckCircleIcon } from '../components/icons.jsx';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../lib/auth.jsx';
import { navigate } from '../lib/router.js';
import { useServerConfig } from '../lib/serverConfig.js';

const PERKS = ["Bir bosishda hasharlarga qo'shiling", "O'z hasharingizni e'lon qiling", "Ball to'plang va nishonlar oling", 'Natijalaringizni profilda saqlang'];

export default function LoginPage({ route }) {
  const { user, ready } = useAuth();
  const { email_enabled: emailOn } = useServerConfig();
  const next = route.query.next && route.query.next.startsWith('/') ? route.query.next : '/profil';

  useEffect(() => {
    if (ready && user) navigate(next, { replace: true });
  }, [ready, user, next]);

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-2 lg:px-6 lg:py-16">
      <div className="hero-bg relative hidden overflow-hidden rounded-[36px] p-10 text-white lg:block">
        <div className="grid-pattern absolute inset-0" />
        <div className="relative">
          <Logo light />
          <h1 className="mt-10 text-4xl font-extrabold leading-tight">
            Mahallangiz sizni <span className="text-gradient">kutmoqda</span>
          </h1>
          <p className="mt-3 text-emerald-50/85">Minglab qo'shnilar bilan birga shahrimizni toza va yashil qilamiz.</p>
          <ul className="mt-8 space-y-3">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-3 font-semibold">
                <CheckCircleIcon className="h-5 w-5 text-amber-300" /> {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto w-full min-w-0 max-w-md">
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-soft sm:p-8">
          <h1 className="text-2xl font-extrabold text-ink">Xush kelibsiz!</h1>
          <p className="mb-6 mt-1 text-sm text-ink-3">
            {emailOn ? "Telefon raqamingiz yoki emailingiz bilan kiring, yoki ro'yxatdan o'ting." : "Telefon raqamingiz bilan kiring yoki ro'yxatdan o'ting."}
          </p>
          <AuthForm reason={route.query.reason} initialMode={route.query.mode === 'register' ? 'register' : 'login'} onSuccess={() => navigate(next, { replace: true })} />
        </div>
      </div>
    </div>
  );
}
