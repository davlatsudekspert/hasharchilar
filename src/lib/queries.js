// Umumiy so'rovlar: kesh kaliti + yuklovchi bir joyda (sahifalar, oldindan yuklash va prefetch bir xil kalitdan foydalanadi).
import { api } from './api.js';
import { preload } from './store.js';
import { sortHashars } from './utils.js';

const arr = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []);

export const Q = {
  hashars: ['hashars:all', () => api.listHashars().then((l) => sortHashars(arr(l)))],
  stats: ['stats', () => api.stats()],
  leaderboard: (period = 'all') => [`leaderboard:${period}`, () => api.leaderboard(period)],
  hashar: (id) => [`hashar:${id}`, () => api.getHashar(id)],
  user: (id) => [`user:${id}`, () => api.user(id)],
  myCreated: ['me:created', () => api.listHashars({ mine: 'created' }).then(arr)],
  myJoined: ['me:joined', () => api.listHashars({ mine: 'joined' }).then(arr)],
  mySaves: ['me:saves', () => api.mySaves().then(arr)],
  myBlocks: ['me:blocks', () => api.myBlocks().then(arr)],
  payment: (id) => [`payment:${id}`, () => api.hasharPayment(id)],
  app: ['app', () => api.appInfo()],
};

/** Marshrut ma'lumotini oldindan yuklash (sahifa kodi bilan parallel; birinchi ekran bitta so'rovni kutadi). */
export function preloadRouteData(route, { authed = false } = {}) {
  if (!route) return;
  const id = route.params && route.params.id;
  switch (route.name) {
    case 'home':
    case 'list':
    case 'map':
    case 'results':
      preload(...Q.hashars);
      break;
    case 'hashar':
      if (id) preload(...Q.hashar(id));
      break;
    case 'user':
      if (id) preload(...Q.user(id));
      break;
    case 'leaderboard':
      preload(...Q.leaderboard('all'));
      break;
    case 'payment':
      if (id && authed) preload(...Q.payment(id));
      break;
    case 'profile':
      if (authed) preload(...Q.myCreated);
      break;
    default:
  }
}

export { arr as asList };
