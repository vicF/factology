import { defineConfig } from 'vite';
import path from 'path';
export default defineConfig({
    base: './',
    server: { host: '0.0.0.0', port: 5196, strictPort: true, cors: true },
    optimizeDeps: {
        // ONLY crawl the real source entry — not the android/dist/electron
        // build copies that Vite's default **/*.html discovery would scan.
        entries: [path.resolve(__dirname, 'index.capacitor.html')],
    },
});
