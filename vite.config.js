import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function offlineShell() {
  return {
    name: 'offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(x => /\.(js|css)$/.test(x)).map(x => '/' + x);
      const files = ['/', '/index.html', '/manifest.json', '/icon.svg', ...assets];
      const hash = createHash('sha256');
      for (const [name, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const file of ['public/manifest.json', 'public/icon.svg', 'index.html']) hash.update(readFileSync(file));
      const version = hash.digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify('kodiflow-' + version)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kodiflow-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/kodiflow.apk') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});` });
    }
  };
}
export default defineConfig({
  plugins: [react(), offlineShell()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: ['.e2b.app'] },
  build: { outDir: 'dist', sourcemap: false }
});
