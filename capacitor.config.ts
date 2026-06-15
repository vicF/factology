import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.factology.app',
    appName: 'Factology',
    webDir: 'dist-capacitor',
    server: {
        androidScheme: 'https',
        "cleartext": true,
        // For live reload: uncomment and run `npm run dev:capacitor`
        url: 'http://localhost:5174',
    },
};

export default config;
