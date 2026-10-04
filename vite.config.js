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
    // MapLibre GL (~1 MB) dinamik import('./HasharMap.jsx') va h.k. orqali o'zi alohida lazy chunk bo'ladi.
    // manualChunks QO'YILMASIN: Rollup umumiy CommonJS yordamchisini o'sha chunk'ga joylab, kirish chunk'i
    // uni statik import qiladi — natijada har sahifa (bosh sahifa, admin) MapLibre'ni yuklab, ishga tushiradi.
    // CI (deploy.yml) dist/index.html va kirish chunk'ida MapLibre yo'qligini tekshiradi.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Faqat nom: MapLibre bor chunk "maplibre-*.js" deb ataladi (bo'linishga ta'sir qilmaydi)
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => id.includes('/node_modules/maplibre-gl/')) ? 'assets/maplibre-[hash].js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
