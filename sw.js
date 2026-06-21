// アプリシェルをキャッシュ（オフライン起動＋PWAインストール用）。外部API(為替/翻訳)はネット。
const CACHE = 'ebaycalc-shell-v1';
const ASSETS = [
  './', './index.html', './app.bundle.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // 同一オリジン: キャッシュ優先（無ければネット）
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
  // 外部API(為替・翻訳・フォント)は素通し（SWは介入しない）
});
