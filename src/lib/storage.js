// localStorage xavfsiz o'rami: private rejim yoki bloklangan saqlashda xato bermaydi.
const memory = new Map(); // localStorage ishlamasa — xotirada saqlaymiz

export const storage = {
  get(key) {
    try {
      const v = window.localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      /* e'tiborsiz */
    }
    return memory.has(key) ? memory.get(key) : null;
  },
  set(key, value) {
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* e'tiborsiz */
    }
  },
  remove(key) {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* e'tiborsiz */
    }
  },
  getJSON(key, fallback = null) {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },
};

export const TOKEN_KEY = 'hashar_token';
export const USER_KEY = 'hashar_user';
