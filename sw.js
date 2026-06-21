// アプリシェルをキャッシュ（オフライン起動用）。更新を確実に届けるため network-first。
const CACHE = 'ebaycalc-shell-v2';
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
    // 同一オリジン: network-first（最新を取得＆キャッシュ更新、オフライン時はキャッシュ）
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
  // 外部API(為替・翻訳・フォント)は素通し（SWは介入しない）
});
