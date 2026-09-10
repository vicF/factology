import type {CapacitorConfig} from '@capacitor/cli';

// Live reload (dev): when run-android.sh exports CAP_LIVE_URL, the app loads
// from the Vite dev server (http://localhost:5174, reached via `adb reverse`)
// instead of the bundled assets — edit resources/js/** and the device
// hot-reloads, no APK rebuild/install per change. Normal builds leave it unset,
// so the app loads the assets bundled into the APK as before.
const capacitorLiveUrl = typeof process !== 'undefined' ? process.env.CAP_LIVE_URL : undefined;

const config: CapacitorConfig = {
    appId: 'com.factology.app',
    appName: 'Factology',
    webDir: 'dist-capacitor',
    server: {
        androidScheme: 'http',
        cleartext: true,
        ...(capacitorLiveUrl ? {url: capacitorLiveUrl} : {}),
    },
};

export default config;
