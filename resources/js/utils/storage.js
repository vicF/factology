// Storage abstraction: works with both localStorage (web) and Capacitor Preferences (native)
// New stores should import this instead of calling localStorage/window directly.

function isNative() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();
}

export const storage = {
  async get(key) {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },

  async set(key, value) {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value });
    } else {
      localStorage.setItem(key, value);
    }
  },

  async remove(key) {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key });
    } else {
      localStorage.removeItem(key);
    }
  },

  async clear() {
    if (isNative()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.clear();
    } else {
      localStorage.clear();
    }
  },
};

// Synchronous fallback for places where async doesn't work easily
// Only works on web — returns null on native platforms
export const storageSync = {
  get(key) {
    if (isNative()) return null;
    return localStorage.getItem(key);
  },
  set(key, value) {
    if (!isNative()) localStorage.setItem(key, value);
  },
  remove(key) {
    if (!isNative()) localStorage.removeItem(key);
  },
};
