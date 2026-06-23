// vitest.localdb.config.js — minimal config for local DB tests
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests-vitest/setup.localDb.js'],
        // Don't mock anything — test the real local DB
        deps: {
            optimizer: {
                ssr: {
                    include: ['fake-indexeddb'],
                },
            },
        },
    },
})
