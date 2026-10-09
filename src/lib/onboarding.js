// Onboarding (3 slayd): APK birinchi ochilganda bir marta; saytda faqat ?onboarding=1 bilan (sinov / ko'rsatish uchun).
import { IS_NATIVE } from './config.js';
import { storage } from './storage.js';

const KEY = 'hashar_onboarded';

export function shouldShowOnboarding(route) {
  if (!route || route.name === 'admin') return false;
  let forced = route.query && route.query.onboarding === '1';
  try {
    forced = forced || new URLSearchParams(window.location.search).get('onboarding') === '1';
  } catch {
    /* e'tiborsiz */
  }
  if (forced) return true;
  return IS_NATIVE && !storage.get(KEY);
}

export const markOnboarded = () => storage.set(KEY, '1');
