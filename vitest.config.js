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
            '@factology/engine': path.resolve(__dirname, './packages/engine/src'),
        }
    },
    // Keep the heavy dirs out of the watcher — with hundreds of thousands of
    // thumbnail files present, polling them over the Docker mount makes runs
    // hang for minutes.
    server: {
        watch: {
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
            ],
        },
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
