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
            host: 'localhost',
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
            // Ignore heavy directories to save CPU cycles
            ignored: ['**/node_modules/**', '**/vendor/**', '**/storage/**']
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
