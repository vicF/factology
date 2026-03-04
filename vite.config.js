// vite.config.js (ВРЕМЕННЫЙ МИНИМАЛЬНЫЙ КОНФИГ ДЛЯ ТЕСТА)
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.js'],
            refresh: true, // Оставляем базовый рефреш
        }),
        vue(),
    ],
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        hmr: {
            host: 'localhost',
        },
        watch: {
            usePolling: true,          // Критически важно
            interval: 1000,             // Проверка раз в секунду
            awaitWriteFinish: {
                stabilityThreshold: 500,  // Увеличим до 500мс
                pollInterval: 100
            }
        },
    },
});
