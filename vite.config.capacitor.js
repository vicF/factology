import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { execSync } from 'child_process';

// Build info injected at compile time so the running APK can be identified.
let buildId = 'dev';
let buildTime = Date.now();
try {
    buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    buildTime = Date.now();
} catch (_) { /* not a git repo */ }

// Capacitor-specific Vite config: produces a standalone SPA build.
// Does NOT use the laravel-vite-plugin — the output goes to dist/ and
// is served directly by Capacitor's WebView (no Laravel backend).

export default defineConfig({
    plugins: [
        vue(),
    ],
    css: {
        preprocessorOptions: {
            scss: {
                // Silence Bootstrap 5 Sass deprecation warnings (uses @import, global built-ins)
                silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'resources/js'),
            '~': path.resolve(__dirname, 'resources'),
        },
    },
    // Don't copy the Laravel public directory (huge thumbs, PHP files) into the build
    publicDir: false,
    build: {
        outDir: 'dist-capacitor',
        emptyOutDir: true,
        sourcemap: false,
        // The SPA uses top-level await (localDb/standaloneBootstrap.js) and runs
        // inside a modern Chromium WebView, so target the latest browsers.
        target: 'esnext',
        rollupOptions: {
            input: path.resolve(__dirname, 'index.capacitor.html'),
        },
    },
    // Load .env.capacitor for VITE_TARGET and VITE_API_URL
    envDir: __dirname,
    envPrefix: 'VITE_',
    define: {
        'import.meta.env.VITE_TARGET': JSON.stringify('capacitor'),
        // Injected at build time by build-android.sh. Empty string => standalone
        // Dexie mode; non-empty => remote server mode (see resources/js/app.js).
        'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? ''),
        'import.meta.env.VITE_BUILD_ID': JSON.stringify(`b${buildId}-${buildTime}`),
    },
    server: {
        host: '0.0.0.0',
        port: 5174,
        cors: true,
    },
});
