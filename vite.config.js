// vite.config.js (full file with minimal necessary changes)
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
            ],
            refresh: true,
        }),
        vue({
            template: {
                transformAssetUrls: {
                    base: null,
                    includeAbsolute: false,
                },
            },
        }),
    ],
    resolve: {
        alias: {
            '@': '/resources/js',  // Add alias for @ to resources/js
        },
    },
    server: {
        hmr: {
            host: 'localhost',  // Force host for HMR
        },
        watch: {
            usePolling: true,   // Recommended in Docker/containers
        },
    },
});
