import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests-vitest/setup.js'],
        include: ['tests-vitest/**/*.spec.js'],
        exclude: ['resources/js/**', 'node_modules', 'tests/**', 'tests-js/**'],
    },
})
