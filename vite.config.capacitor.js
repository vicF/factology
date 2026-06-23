import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

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
        rollupOptions: {
            input: path.resolve(__dirname, 'index.capacitor.html'),
        },
    },
    // Load .env.capacitor for VITE_TARGET and VITE_API_URL
    envDir: __dirname,
    envPrefix: 'VITE_',
    define: {
        'import.meta.env.VITE_TARGET': JSON.stringify('capacitor'),
    },
    server: {
        host: '0.0.0.0',
        port: 5174,
        cors: true,
    },
});
