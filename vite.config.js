import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.js'],
            refresh: true,
        }),
        vue(),
    ],
    server: {
        host: '0.0.0.0',
        port: 5173,
        cors: true,
        strictPort: true,
        hmr: {
            host: '127.0.0.1',
        },
        watch: {
            usePolling: true,
            interval: 1000,
            // This prevents "Double-Reloads" which often cause the
            // infinite loading spinner on Windows mounts
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            },
            // Ignore heavy directories to save CPU cycles.
            // Thumbs caches (public/dist) contain hundreds of thousands of
            // small files — keeping them out of the watcher keeps the Docker
            // file-sharing mount fast. They are served by the backend, not vite.
            ignored: [
                '**/node_modules/**',
                '**/vendor/**',
                '**/storage/**',
                '**/public/thumbs/**',
                '**/public/thumbs__/**',
                '**/dist/thumbs/**',
                '**/dist/thumbs__/**',
                '**/dist/**',
                '**/dist-capacitor/**',
                '**/electron/**',
            ]
        },
    },
    css: {
        preprocessorOptions: {
            scss: {
                quietDeps: true, // This silences warnings from node_modules (Bootstrap)
            },
        },
    },
});
