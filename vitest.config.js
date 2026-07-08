// vitest.config.js
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
            '@icons': path.resolve(__dirname, './resources/js/components/icons'),
        }
    },
    test: {
        pool: 'threads',
        globals: true,
        environment: 'jsdom',
        setupFiles: [
            path.resolve(__dirname, 'tests-vitest/setup.js'),
            path.resolve(__dirname, 'tests-vitest/setup.localDb.js'),
        ],
        include: [
            'tests-vitest/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],
        server: {
            deps: {
                inline: ['fake-indexeddb', 'dexie'],
            },
        },
    },
})
