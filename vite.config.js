// vite.config.js (Updated - removed problematic SCSS options)
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
            refresh: [
                {
                    paths: [
                        'resources/views/**',
                        'app/**',
                        'lang/**',
                        'routes/**',
                    ],
                    config: { delay: 300 }
                }
            ],
        }),
        vue({
            template: {
                transformAssetUrls: {
                    base: null,
                    includeAbsolute: false,
                },
                compilerOptions: {
                    whitespace: 'condense',
                    comments: false,
                }
            },
            include: [/\.vue$/, /\.md$/],
        }),
    ],

    resolve: {
        alias: {
            '@': '/resources/js',
            '~': '/resources',
        },
        extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
        dedupe: ['vue', 'vue-router', 'vue-i18n', 'pinia'],
    },

    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,

        hmr: {
            host: '127.0.0.1',
            port: 5173,
            protocol: 'ws',
            timeout: 60000,
            overlay: true,
        },

        watch: {
            usePolling: false,
            useFsEvents: true,

            ignored: [
                '**/storage/**',
                '**/storage/framework/cache/**',
                '**/storage/logs/**',
                '**/node_modules/**',
                '**/node_modules/.cache/**',
                '**/vendor/**',
                '**/.git/**',
                '**/.idea/**',
                '**/.vscode/**',
                '**/bootstrap/cache/**',
                '**/public/build/**',
                '**/tests/**',
                '**/coverage/**',
                '**/docker/**',
            ],
        },

        fs: {
            strict: true,
            allow: [
                '.',
                '/resources',
                '/node_modules/@vue',
                '/node_modules/vite',
            ],
            deny: [
                '.env',
                '.env.*',
                '*.key',
                '*.pem',
            ],
        },

        cors: true,
        proxy: {},
    },

    build: {
        target: 'es2020',
        minify: 'esbuild',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    vue: ['vue', 'vue-router', 'vue-i18n', 'pinia'],
                    ui: ['bootstrap', '@popperjs/core'],
                    utils: ['axios', 'luxon', 'uuid', 'lodash'],
                },
                chunkFileNames: 'assets/js/[name]-[hash].js',
                entryFileNames: 'assets/js/[name]-[hash].js',
                assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
            },
            treeshake: {
                preset: 'recommended',
                moduleSideEffects: 'no-external',
            },
        },

        chunkSizeWarningLimit: 1000,
        cssCodeSplit: true,
        reportCompressedSize: false,
        emptyOutDir: true,
        copyPublicDir: true,
    },

    optimizeDeps: {
        include: [
            'vue',
            'vue-router',
            'pinia',
            'axios',
            'vue-i18n',
            '@vueuse/core',
            '@vueuse/head',
            'luxon',
            'uuid',
            'bootstrap',
            '@popperjs/core',
            'lodash',
            'mitt',
        ],

        exclude: [
            '@vue/compat',
            'vue-demi',
        ],

        force: false,
        disabled: false,

        esbuildOptions: {
            target: 'es2020',
            supported: {
                'top-level-await': true,
            },
        },
    },

    cacheDir: '.vite_cache',

    // FIXED CSS CONFIG - simplified
    css: {
        devSourcemap: true,
        preprocessorOptions: {
            scss: {
                // Only add if you have global variables to import
                // additionalData: `@import "resources/css/variables.scss";`,
                quietDeps: true,
            },
        },
    },

    worker: {
        format: 'es',
        plugins: [],
    },

    logLevel: 'info',
    customLogger: undefined,
    envPrefix: ['VITE_', 'LARAVEL_VITE_'],

    define: {
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
});
