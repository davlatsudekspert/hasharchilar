import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Bitta build: sayt (Cloudflare Worker static assets) va Android APK (Capacitor webDir: dist).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev rejimida /api so'rovlari `wrangler dev` (8787-port) ga yo'naltiriladi
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: {
    // Eski Android WebView'lar uchun ham mos sintaksis (?. va ?? transpilatsiya qilinadi)
    target: 'es2019',
    cssTarget: 'chrome87',
    sourcemap: false,
    // MapLibre GL (~1 MB) — alohida lazy chunk, faqat xarita ochilganda yuklanadi
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          return undefined;
        },
      },
    },
  },
});
