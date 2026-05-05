// vitest.config.js
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
            // Add this alias for icons
            '@icons': path.resolve(__dirname, './resources/js/components/icons'),
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests-vitest/setup.js'],
    },
})
