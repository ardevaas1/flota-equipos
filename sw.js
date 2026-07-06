// ============================================
// Service Worker — LST Flota & Equipos
// Soporte offline básico: cachea el "esqueleto" de la app
// (HTML/CSS/JS/logo) para que abra sin internet. Los datos
// (Sheets/Drive) NO se cachean aquí — eso se maneja por
// separado en localStorage desde app-v2.js.
// ============================================

const CACHE_NAME = 'lst-flota-shell-v4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './app-v2.js',
  './inventario.js',
  './andamios-seed.js',
  './manifest.json',
  './logo.png',
  './logo-white.png',
];

// Instalar: precachear el esqueleto de la app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activar: limpiar caches viejos de versiones anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: solo intervenimos en archivos propios del sitio (mismo origen).
// Las llamadas a Google Sheets/Drive/Identity pasan directo a la red,
// sin pasar por el cache (necesitan auth en vivo, no tiene sentido cachearlas aquí).
//
// Estrategia: NETWORK-FIRST. Siempre se intenta traer la versión más
// reciente del servidor primero; el cache local solo se usa como respaldo
// si no hay conexión. Esto evita que, tras subir cambios de diseño, alguien
// vea una mezcla de archivos viejos y nuevos por culpa de una copia cacheada
// — el único costo es que con internet la app siempre pide la versión actual.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // dejar pasar todo lo externo
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(event.request);
        if (fresh && fresh.status === 200) cache.put(event.request, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await cache.match(event.request);
        return cached || new Response(
          '<h1>Sin conexión</h1><p>No se pudo cargar esta página y no hay una copia guardada.</p>',
          { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
        );
      }
    })()
  );
});
