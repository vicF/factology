import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.factology.app',
    appName: 'Factology',
    webDir: 'dist-capacitor',
    server: {
        androidScheme: 'http',
        "cleartext": true,
        // For live reload during development, uncomment the line below and run `npm run dev:capacitor`
        // url: 'http://localhost:5174',
    },
};

export default config;
