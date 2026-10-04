// Asosiy ekran: holat, ma'lumot yuklash va barcha amallar (qo'shilish, yaratish, yakunlash...).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { useAuth } from './lib/auth.jsx';
import { hideSplash } from './lib/native.js';
import { distanceKm, geoErrorKind, matchesQuery, sortHashars } from './lib/utils.js';
import AppBanner, { appDownloadUrl, useAppInfo } from './components/AppBanner.jsx';
import AuthModal from './components/AuthModal.jsx';
import CompletedGallery from './components/CompletedGallery.jsx';
import CreateHasharModal from './components/CreateHasharModal.jsx';
import HasharCard from './components/HasharCard.jsx';
import HasharDetail from './components/HasharDetail.jsx';
import Header, { Logo } from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import { DownloadIcon, LocateIcon, PlusIcon, SearchIcon } from './components/icons.jsx';
import MapView from './components/MapView.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import Tabs from './components/Tabs.jsx';
import { useToast } from './components/Toast.jsx';
import { btn, CardSkeleton, EmptyState, ErrorState, Spinner } from './components/ui.jsx';

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;

export default function App() {
  const auth = useAuth();
  const toast = useToast();
  const appInfo = useAppInfo();
  const userId = auth.user ? auth.user.id : null;

  // ----- Ma'lumotlar -----
  const [hashars, setHashars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);

  // ----- UI holati -----
  const [tab, setTab] = useState('map');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // { id, seed }
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [authReason, setAuthReason] = useState(null); // null | 'login' | 'join' | 'create'
  const pending = useRef(null); // kirishdan keyin bajariladigan amal
  const [joinBusyId, setJoinBusyId] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [geo, setGeo] = useState('idle'); // idle | loading | ok | denied | unavailable | timeout | unsupported
  const cardRefs = useRef(new Map());
  const loadSeq = useRef(0);
  const loadedOnce = useRef(false);

  // ----- Yuklash -----
  const loadStats = useCallback(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => setStats((s) => s || {})); // xato bo'lsa skelet o'rniga "—"
  }, []);

  const loadHashars = useCallback(async () => {
    const my = ++loadSeq.current; // faqat eng so'nggi javob qo'llanadi
    if (!loadedOnce.current) setLoading(true);
    setError('');
    try {
      const list = await api.listHashars();
      if (my === loadSeq.current) setHashars(sortHashars(Array.isArray(list) ? list : []));
    } catch (e) {
      if (my === loadSeq.current) setError(e.message);
    } finally {
      if (my === loadSeq.current) {
        loadedOnce.current = true;
        setLoading(false);
        hideSplash();
      }
    }
  }, []);

  useEffect(loadStats, [loadStats]);

  // Auth aniqlangach va foydalanuvchi o'zgarganda (joined / is_owner bayroqlari uchun)
  useEffect(() => {
    if (auth.ready) loadHashars();
  }, [auth.ready, userId, loadHashars]);

  const retry = () => {
    loadedOnce.current = false;
    loadHashars();
    loadStats();
  };

  // ----- Ro'yxatni lokal yangilash -----
  const patchHashar = useCallback((id, patch) => {
    setHashars((list) => list.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    setDetail((d) => (d && d.id === id ? { ...d, seed: { ...d.seed, ...patch } } : d));
  }, []);

  const replaceHashar = useCallback((dto) => {
    setHashars((list) => sortHashars(list.some((h) => h.id === dto.id) ? list.map((h) => (h.id === dto.id ? dto : h)) : [dto, ...list]));
    setDetail((d) => (d && d.id === dto.id ? { ...d, seed: dto } : d));
  }, []);

  // ----- Amallar -----
  const doJoin = useCallback(
    async (id) => {
      setJoinBusyId(id);
      try {
        const r = await api.join(id);
        patchHashar(id, { joined: true, volunteer_count: r.volunteer_count });
        toast("Siz ro'yxatga olindingiz. Rahmat! 🌱");
        loadStats();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        setJoinBusyId(null);
      }
    },
    [patchHashar, toast, loadStats],
  );

  const join = (id) => {
    if (!auth.user) {
      pending.current = { type: 'join', id };
      setAuthReason('join');
      return;
    }
    doJoin(id);
  };

  const leave = async (id) => {
    const r = await api.leave(id);
    patchHashar(id, { joined: false, volunteer_count: r.volunteer_count });
    toast("Siz hashardan chiqdingiz");
    loadStats();
  };

  const openCreate = () => {
    if (!auth.user) {
      pending.current = { type: 'create' };
      setAuthReason('create');
      return;
    }
    setShowCreate(true);
  };

  const create = async (form) => {
    const created = await api.createHashar(form); // xato bo'lsa modal o'zi ko'rsatadi
    replaceHashar(created);
    setShowCreate(false);
    setQuery('');
    setTab('map');
    setSelectedId(created.id);
    toast("Hashar e'lon qilindi! 🎉");
    loadStats();
    auth.refresh().catch(() => {});
  };

  const complete = async (id, file) => {
    const fd = new FormData();
    fd.set('photo', file, file.name || 'keyin.jpg');
    const dto = await api.complete(id, fd);
    replaceHashar(dto);
    toast("Hashar yakunlandi! Natija galereyaga qo'shildi ✨");
    loadStats();
  };

  const remove = async (id) => {
    await api.remove(id);
    setHashars((list) => list.filter((h) => h.id !== id));
    setDetail(null);
    setSelectedId(null);
    toast("Hashar o'chirildi");
    loadStats();
    auth.refresh().catch(() => {});
  };

  const onAuthSuccess = async (user) => {
    setAuthReason(null);
    const p = pending.current;
    pending.current = null;
    if (!p || p.type !== 'join') toast(`Xush kelibsiz, ${user.name}!`);
    if (p && p.type === 'join') {
      await doJoin(p.id);
      loadHashars(); // joined/is_owner bayroqlari yangi foydalanuvchi uchun
    } else if (p && p.type === 'create') {
      setShowCreate(true);
    }
  };

  const openDetail = useCallback((id, seed) => {
    setSelectedId(id);
    setDetail({ id, seed: seed || null });
  }, []);

  // Xaritada pin tanlansa — desktopda kartani ko'rinadigan joyga suramiz
  const selectFromMap = useCallback((id) => {
    setSelectedId(id);
    if (isDesktop()) cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // ----- Geolokatsiya ("Yaqindagi hasharlar") -----
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo('unsupported');
      return;
    }
    setGeo('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeo('ok');
      },
      (err) => setGeo(geoErrorKind(err)),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60000 },
    );
  }, []);

  const changeTab = (id) => {
    setTab(id);
    if (id === 'nearby' && !userPos && geo !== 'loading') requestLocation();
  };

  // ----- Ko'rinadigan ro'yxat -----
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => hashars.filter((h) => matchesQuery(h, q)), [hashars, q]);
  const withDistance = useMemo(
    () => (userPos ? filtered.map((h) => ({ ...h, distance: distanceKm(userPos, h) })) : filtered),
    [filtered, userPos],
  );
  const pendingList = useMemo(() => {
    const list = withDistance.filter((h) => h.status === 'PENDING');
    return userPos ? [...list].sort((a, b) => a.distance - b.distance) : list;
  }, [withDistance, userPos]);
  const completedList = useMemo(() => withDistance.filter((h) => h.status === 'COMPLETED'), [withDistance]);
  const visible = tab === 'nearby' ? pendingList : withDistance;

  const counts = loading || error ? {} : { map: filtered.length, nearby: pendingList.length, done: completedList.length };

  const detailHashar = detail ? hashars.find((h) => h.id === detail.id) || detail.seed : null;
  const detailDistance = detailHashar && userPos ? distanceKm(userPos, detailHashar) : null;

  // ----- Ro'yxat bloki -----
  const renderList = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      );
    }
    if (error) return <ErrorState message={error} onRetry={retry} />;
    if (hashars.length === 0) {
      return (
        <EmptyState
          title="Hozircha hashar yo'q — birinchisini siz e'lon qiling!"
          text="Mahallangizda tozalash yoki daraxt ekish kerakmi? Hashar e'lon qiling, qo'shnilaringiz qo'shiladi."
          action={
            <button type="button" onClick={openCreate} className={`${btn.cta} h-11 px-5`}>
              <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
            </button>
          }
        />
      );
    }
    if (visible.length === 0) {
      return q ? (
        <EmptyState
          icon={SearchIcon}
          title="Hech narsa topilmadi"
          text={`"${query.trim()}" bo'yicha hashar topilmadi. Boshqa so'z bilan qidirib ko'ring.`}
          action={
            <button type="button" onClick={() => setQuery('')} className={`${btn.ghost} h-10 px-4 text-sm`}>
              Qidiruvni tozalash
            </button>
          }
        />
      ) : (
        <EmptyState
          title="Kutilayotgan hashar yo'q"
          text="Hozircha barcha hasharlar yakunlangan. Yangisini e'lon qiling!"
          action={
            <button type="button" onClick={openCreate} className={`${btn.cta} h-11 px-5`}>
              <PlusIcon className="h-5 w-5" strokeWidth={2.6} /> Hashar e'lon qilish
            </button>
          }
        />
      );
    }
    return (
      <ul className="space-y-3">
        {visible.map((h) => (
          <li key={h.id}>
            <HasharCard
              ref={(el) => (el ? cardRefs.current.set(h.id, el) : cardRefs.current.delete(h.id))}
              hashar={h}
              distance={h.distance}
              selected={h.id === selectedId}
              busy={joinBusyId === h.id}
              onOpen={(id) => openDetail(id)}
              onJoin={join}
            />
          </li>
        ))}
      </ul>
    );
  };

  // "Yaqindagi" tab uchun joylashuv holati
  const GEO_ERRORS = {
    denied: 'Joylashuvga ruxsat berilmadi.',
    unavailable: "Joylashuv xizmati o'chiq — telefon sozlamalarida GPS (Joylashuv) ni yoqing.",
    timeout: "Joylashuvni aniqlab bo'lmadi.",
    unsupported: 'Qurilmangiz joylashuvni aniqlay olmaydi.',
  };
  const geoNotice =
    tab !== 'nearby' ? null : geo === 'loading' ? (
      <p className="flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
        <Spinner /> Joylashuvingiz aniqlanmoqda…
      </p>
    ) : GEO_ERRORS[geo] ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <span className="font-medium">{GEO_ERRORS[geo]} Hasharlar sana bo'yicha ko'rsatilmoqda.</span>
        {geo !== 'unsupported' && (
          <button type="button" onClick={requestLocation} className="inline-flex items-center gap-1.5 font-bold text-amber-900 underline-offset-2 hover:underline">
            <LocateIcon className="h-4 w-4" /> Qayta urinish
          </button>
        )}
      </div>
    ) : geo === 'ok' ? (
      <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <LocateIcon className="h-4 w-4 text-sky-600" /> Sizga eng yaqin hasharlar birinchi ko'rsatilmoqda
      </p>
    ) : null;

  const listTitle = tab === 'nearby' ? 'Yaqindagi hasharlar' : q ? 'Qidiruv natijalari' : 'Barcha hasharlar';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#tab-panel" className="skip-link">
        Asosiy qismga o'tish
      </a>
      <Header
        query={query}
        onQuery={setQuery}
        onCreate={openCreate}
        user={auth.user}
        authReady={auth.ready}
        onProfile={() => setShowProfile(true)}
        onLogin={() => setAuthReason('login')}
      />
      <AppBanner info={appInfo} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12">
        <Hero stats={stats} loading={!stats} />

        <Tabs active={tab} onChange={changeTab} counts={counts} />

        <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5 outline-none" tabIndex={-1}>
          {tab === 'done' ? (
            loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />
                ))}
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={retry} />
            ) : (
              <CompletedGallery hashars={completedList} onOpen={(id) => openDetail(id)} query={query.trim()} />
            )
          ) : (
            // grid-cols-1 = minmax(0,1fr): uzun (truncate) matnlar mobil ustunni ekrandan kengaytirmasin
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6">
              {/* Xarita: mobilda tepada 340px, desktopda o'ngda sticky 600px */}
              <div className="lg:sticky lg:top-[84px] lg:order-2">
                <MapView
                  hashars={visible}
                  selectedId={selectedId}
                  userPos={userPos}
                  onSelect={selectFromMap}
                  onJoin={join}
                  onOpen={(id) => openDetail(id)}
                />
                <div className="mt-2 flex items-center gap-4 px-1 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Kutilmoqda
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Bajarildi
                  </span>
                  {userPos && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-sky-200" /> Siz
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 lg:order-1">
                {!loading && !error && hashars.length > 0 && (
                  <div className="flex items-baseline justify-between px-0.5">
                    <h2 className="text-lg font-extrabold text-slate-900">{listTitle}</h2>
                    <span className="text-sm font-semibold text-slate-500">{visible.length} ta</span>
                  </div>
                )}
                {geoNotice}
                {renderList()}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="safe-bottom border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo className="scale-90 origin-left" />
          </div>
          <p>Birgalikda obod qilamiz · © {new Date().getFullYear()}</p>
          {appInfo && (
            <a href={appDownloadUrl(appInfo)} className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline">
              <DownloadIcon className="h-4 w-4" /> Android ilova
            </a>
          )}
        </div>
      </footer>

      {/* ----- Oynalar ----- */}
      {detailHashar && (
        <HasharDetail
          key={detailHashar.id}
          hashar={detailHashar}
          distance={detailDistance}
          joinBusy={joinBusyId === detailHashar.id}
          onClose={() => setDetail(null)}
          onJoin={join}
          onLeave={leave}
          onComplete={complete}
          onDelete={remove}
        />
      )}
      {showCreate && <CreateHasharModal onSubmit={create} onClose={() => setShowCreate(false)} center={userPos} />}
      {showProfile && auth.user && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          onOpenHashar={(h) => {
            setShowProfile(false);
            openDetail(h.id, h);
          }}
          onLoggedOut={() => {
            setShowProfile(false);
            toast('Tizimdan chiqdingiz');
          }}
        />
      )}
      {authReason && (
        <AuthModal
          reason={authReason}
          onClose={() => {
            pending.current = null;
            setAuthReason(null);
          }}
          onSuccess={onAuthSuccess}
        />
      )}
    </div>
  );
}
