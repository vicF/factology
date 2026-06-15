// Platform detection utilities
// Used to switch behaviour between web SPA and native (Capacitor) builds

export const PLATFORM = {
  get isNative() {
    return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform();
  },
  get isWeb() {
    return !this.isNative;
  },
  get isCapacitor() {
    return typeof window !== 'undefined' && !!window.Capacitor;
  },
  get isIOS() {
    return this.isNative && window.Capacitor?.getPlatform() === 'ios';
  },
  get isAndroid() {
    return this.isNative && window.Capacitor?.getPlatform() === 'android';
  },
  get isElectron() {
    return this.isNative && window.Capacitor?.getPlatform() === 'electron';
  },
};

// Environment-based build target (set via VITE_TARGET env var)
export const BUILD_TARGET = import.meta.env.VITE_TARGET || 'web';
export const IS_CAPACITOR_BUILD = BUILD_TARGET === 'capacitor';
