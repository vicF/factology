import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import path from 'path'

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/sass/app.scss', 'resources/js/app.js'],
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
            vue: 'vue/dist/vue.esm-bundler.js',
            '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
            '@': '/resources/js'
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        hmr: {
            host: '127.0.0.1',
            port: 5173,
            protocol: 'ws',
            clientPort: 5173,
        },
    },
    optimizeDeps: {
        include: ['vue', 'vue-router', 'pinia', 'axios', 'lodash'], // Pre-bundle specific dependencies
        force: true, // Force re-optimization on start
    },
    build: {
        sourcemap: true,
    },
    logLevel: 'info',
});
