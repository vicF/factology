// vitest.config.js
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
            '@icons': path.resolve(__dirname, './resources/js/components/icons'),
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [
            './tests-vitest/setup.js',
            './tests-vitest/setup.localDb.js',
        ],
        server: {
            deps: {
                inline: ['fake-indexeddb', 'dexie'],
            },
        },
    },
})
