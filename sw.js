// Service worker của A.I Store
// - Luôn ưu tiên lấy bản mới nhất từ mạng (để sửa trang trên Vercel là mọi máy cập nhật ngay)
// - Chỉ dùng bản lưu sẵn khi mất mạng, để app vẫn mở được
// - Không đụng tới dữ liệu Firebase (Firebase tự đồng bộ)
// Khi sửa tệp này, tăng số phiên bản để máy người dùng nhận bản mới.
const CACHE = 'aistore-v1';
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Dữ liệu Firebase / Google: để trình duyệt xử lý trực tiếp
  if (/firestore|googleapis|firebaseio|identitytoolkit|securetoken/.test(url.hostname)) return;

  // Trang của mình + thư viện giao diện (Tailwind, Font Awesome, font, Firebase SDK):
  // lấy từ mạng trước, lưu lại một bản; mất mạng thì dùng bản đã lưu.
  const isOwn = url.origin === self.location.origin;
  const isLib = /cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com|github\.com|githubusercontent\.com/.test(url.hostname);
  if (!isOwn && !isLib) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});
