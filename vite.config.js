import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Mijoz versiyasi — src/lib/api.js dagi CLIENT_VERSION bilan bir xil (oldindan so'rovda ham `?client=`)
const CLIENT_VERSION = 4;

// Sahifa modullari → marshrut (src/lib/router.js dagi ROUTES bilan bir xil)
const PAGE_ROUTES = {
  MapPage: '^/xarita$',
  ListPage: '^/hasharlar$',
  HasharPage: '^/hashar/\\d+$',
  CreatePage: '^/yaratish$',
  ResultsPage: '^/natijalar$',
  LeaderboardPage: '^/reyting$',
  ProfilePage: '^/profil$',
  UserPage: '^/u/\\d+$',
  AboutPage: '^/haqida$',
  LoginPage: '^/kirish$',
  NotificationsPage: '^/bildirishnomalar$',
  PaymentPage: '^/tolov/\\d+$',
};

/**
 * Birinchi ekran tezligi (v4): index.html ga kichik skript qo'shiladi —
 *  1) joriy marshrut sahifasining lazy chunk'i kirish skripti bilan PARALLEL yuklanadi (<link rel="modulepreload">) —
 *     chuqur havola (#/hashar/5) "kirish JS → sahifa JS" zanjirini kutmaydi. Sahifaning umumiy bo'laklari (Modal,
 *     PhotoInput va h.k.) fetchpriority="low" bilan: sekin tarmoqda kirish JS/CSS bilan raqobat qilmaydi
 *     (birinchi chizish kechikmaydi);
 *  2) shu sahifa ma'lumoti (GET /api/hashars yoki /api/hashars/:id) darhol so'raladi — src/lib/api.js uni bir marta
 *     ishlatadi (token bir xil bo'lsa). MapLibre chunk'lari hech qachon oldindan yuklanmaydi (CI tekshiradi).
 */
function routePreload(apiBase) {
  return {
    name: 'hashar-route-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const routes = [];
        for (const chunk of Object.values(ctx.bundle)) {
          if (chunk.type !== 'chunk' || !chunk.facadeModuleId) continue;
          const m = chunk.facadeModuleId.replace(/\\/g, '/').match(/\/src\/pages\/(\w+)\.jsx$/);
          if (!m || !PAGE_ROUTES[m[1]]) continue;
          const deps = (chunk.imports || []).filter((f) => !/maplibre/i.test(f) && !(ctx.bundle[f] && ctx.bundle[f].isEntry));
          routes.push([PAGE_ROUTES[m[1]], [chunk.fileName, ...deps]]);
        }
        const script = `<script>(function(){try{
var p=(location.hash||'').replace(/^#/,'').split('?')[0]||'/';if(p.charAt(0)!=='/')p='/'+p;if(p.length>1)p=p.replace(/\\/+$/,'');
if(/^\\/?admin/.test(p))return;
var R=${JSON.stringify(routes)};
for(var i=0;i<R.length;i++)if(new RegExp(R[i][0]).test(p)){R[i][1].forEach(function(f,j){var l=document.createElement('link');l.rel='modulepreload';l.href='/'+f;if(j)l.setAttribute('fetchpriority','low');document.head.appendChild(l);});break;}
var u=null,m=p.match(/^\\/hashar\\/(\\d+)$/);if(m)u='/hashars/'+m[1];else if(/^\\/(xarita|hasharlar|natijalar)?$/.test(p))u='/hashars';
if(!u||!window.fetch)return;var t='';try{t=localStorage.getItem('hashar_token')||'';}catch(e){}
var h={Accept:'application/json'};if(t)h.Authorization='Bearer '+t;
var r=fetch(${JSON.stringify(apiBase)}+'/api'+u+(t?'?client=${CLIENT_VERSION}':''),{headers:h});r.catch(function(){});
window.__hp={path:u,tok:t,res:r};
}catch(e){}})();</script>`;
        // Kirish skripti va CSS dan OLDIN: <link rel="stylesheet"> keyingi oddiy skriptni bloklaydi
        const at = html.search(/<script type="module"|<link rel="stylesheet"/);
        return at === -1 ? html.replace('</head>', `    ${script}\n  </head>`) : `${html.slice(0, at)}${script}\n    ${html.slice(at)}`;
      },
    },
  };
}

// Bitta build: sayt (Cloudflare Worker static assets) va Android APK (Capacitor webDir: dist).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = String(process.env.VITE_API_BASE || env.VITE_API_BASE || '').replace(/\/+$/, '');
  return {
    plugins: [react(), tailwindcss(), routePreload(apiBase)],
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
      // v4: sahifalar ham alohida chunk (src/lib/pages.js), joriy sahifa chunk'i index.html dan oldindan yuklanadi.
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          // Faqat nom: MapLibre bor chunk "maplibre-*.js" deb ataladi (bo'linishga ta'sir qilmaydi)
          chunkFileNames: (chunk) =>
            chunk.moduleIds.some((id) => id.includes('/node_modules/maplibre-gl/')) ? 'assets/maplibre-[hash].js' : 'assets/[name]-[hash].js',
        },
      },
    },
  };
});
