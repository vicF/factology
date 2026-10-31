import { defineConfig } from 'vite';
import path from 'path';
export default defineConfig({
    base: './',
    server: { host: '0.0.0.0', port: 5198, strictPort: true, cors: true },
    envDir: __dirname,
    envPrefix: 'VITE_',
    resolve: { alias: {
        '@': path.resolve(__dirname, 'resources/js'),
        '~': path.resolve(__dirname, 'resources'),
        '@factology/engine': path.resolve(__dirname, 'packages/engine/src'),
    } },
});
