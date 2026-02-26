// vite.config.js - Optimized for Docker + Windows
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
            // Add this to help with Docker
            valet: false,
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
        // CHANGE THIS: Listen on all interfaces in Docker
        host: '0.0.0.0',  // Was '127.0.0.1'
        port: 5173,
        strictPort: true,

        // ADD THIS: CORS for Docker
        cors: {
            origin: [
                'http://localhost',
                'http://localhost:8003',  // Your Laravel port
                'http://127.0.0.1:8003',
                'http://0.0.0.0:8003',
            ],
            methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
            credentials: true,
        },

        hmr: {
            // CHANGE THIS: Use 'localhost' for browser connections
            host: 'localhost',  // Was '127.0.0.1'
            port: 5173,
            protocol: 'ws',
            timeout: 60000,
            overlay: true,
            // ADD THIS: Client port for Docker
            clientPort: 5173,
        },

        watch: {
            // CHANGE THIS: Use polling for Docker filesystem
            usePolling: true,  // Was false
            interval: 1000,     // Check every second
            binaryInterval: 1000,
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            },

            // ADD THIS: Better polling settings
            useFsEvents: false,  // Disable fs events, use polling

            ignored: [
                '**/storage/**',
                '**/storage/framework/cache/**',
                '**/storage/logs/**',
                '**/vendor/**',
                '**/.git/**',
                '**/.idea/**',
                '**/.vscode/**',
                '**/bootstrap/cache/**',
                '**/public/build/**',
                '**/tests/**',
                '**/coverage/**',
                '**/docker/**',
                // REMOVED node_modules from ignored - we need to watch package.json
            ],
        },

        fs: {
            // CHANGE THIS: Less strict for Docker
            strict: false,  // Was true
            allow: [
                '.',
                '..',  // Allow going up a level
                '/resources',
                '/node_modules',
            ],
            deny: [
                '.env',
                '.env.*',
                '*.key',
                '*.pem',
            ],
        },

        // REMOVE this - we're using cors above
        // cors: true,

        proxy: {},

        // ADD THIS: Force exit on close
        forceExit: true,
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

        // ADD THIS: For Docker builds
        commonjsOptions: {
            include: [/node_modules/],
            extensions: ['.js', '.cjs'],
            strictRequires: true,
            transformMixedEsModules: true,
        },
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
            'relation-graph',  // Added from your logs
        ],

        exclude: [
            '@vue/compat',
            'vue-demi',
        ],

        // CHANGE THIS: Force optimize on start for Docker
        force: true,  // Was false

        disabled: false,

        esbuildOptions: {
            target: 'es2020',
            supported: {
                'top-level-await': true,
            },
        },
    },

    cacheDir: '.vite_cache',

    css: {
        devSourcemap: true,
        preprocessorOptions: {
            scss: {
                quietDeps: true,
                // ADD THIS: For Docker path resolution
                includePaths: ['node_modules'],
            },
        },
    },

    worker: {
        format: 'es',
        plugins: [],
    },

    logLevel: 'info',

    // ADD THIS: More detailed logging for debugging
    customLogger: {
        info: (msg, options) => {
            console.log(`[Vite] ${msg}`);
        },
        warn: (msg, options) => {
            console.warn(`[Vite] ${msg}`);
        },
        error: (msg, options) => {
            console.error(`[Vite] ${msg}`);
        },
    },

    envPrefix: ['VITE_', 'LARAVEL_VITE_'],

    define: {
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },

    // ADD THIS: For better Docker performance
    experimental: {
        renderBuiltUrl: (filename, { hostType }) => {
            if (hostType === 'js') {
                return { runtime: `window.__dynamic_base__ + ${JSON.stringify(filename)}` };
            }
            return { relative: true };
        },
    },
});
