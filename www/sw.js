/**
 * 个人所得税 App — Service Worker
 * =================================================
 * 策略：
 *   安装时预缓存核心资源
 *   静态资源（JS/CSS/图片/字体）：Cache-First，后台更新
 *   HTML 文档：Network-First，离线回退缓存
 *   外部资源：Network-Only
 */

const CACHE_NAME = 'tax-app-v31-home-top-bridge';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './new_tab_page.js',
  './manifest.webmanifest',
  './favicon.ico',
  './icon.png',
  './apple-touch-icon.png',
  './apple-touch-icon-180x180.png',
  './apple-touch-icon-precomposed.png',
  './assets/app-icon-180.png',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/app-icon.png',
  './assets/app-icon-1024.png',
  './assets/hero-card.jpg',
  './assets/deduct-card.jpg',
  './assets/services-strip.jpg',
  './assets/bottom-nav.jpg',
  './assets/bottom-nav-fixed-reference.png',
  './assets/pension-banner-complete.png',
  './assets/splash-reference.png',
  './assets/top-bell-reference.png',
  './assets/top-scan-reference.png',
  './assets/app-icon-reference.png',
  './assets/year-picker.png',
];

/* ===== 安装：预缓存核心资源 ===== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 逐个缓存，某个失败不影响其他资源
      const results = await Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] 缓存失败: ${url}`, err)
          )
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn(`[SW] ${failed}/${ASSETS_TO_CACHE.length} 个资源缓存失败`);
      }
    })()
  );
  // 跳过等待，立即激活
  self.skipWaiting();
});

/* ===== 激活：清理旧缓存 ===== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })()
  );
  // 立即控制所有页面
  self.clients.claim();
});

/* ===== 缓存策略 ===== */

/** 判断是否为静态资源（图片/JS/CSS/字体/图标等） */
function isStaticAsset(url) {
  const staticPatterns = [
    /\.(js|css|json)$/i,
    /\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/i,
    /\.(woff2?|eot|ttf|otf)$/i,
    /manifest\.webmanifest$/i,
    /favicon\./i,
    /apple-touch-icon/i,
    /icon\.png$/,
  ];
  return staticPatterns.some((pattern) => pattern.test(url.pathname));
}

/** 判断是否为 HTML 页面 */
function isHtmlDocument(url) {
  return (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.htm')
  );
}

/* ===== 请求拦截 ===== */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // 跳过不需要缓存的内容（仅预览页和热更新，不跳过 PWA 启动 URL）
  if (
    request.url.includes('/__livereload__') ||
    request.url.includes('/phone-preview.html')
  ) {
    return;
  }

  // 跳过非 GET 请求
  if (request.method !== 'GET') return;

  if (isStaticAsset(url)) {
    // ===== 静态资源：Cache-First =====
    event.respondWith(cacheFirstWithRefresh(request));
  } else if (isHtmlDocument(url)) {
    // ===== HTML：Network-First =====
    event.respondWith(networkFirstWithCacheFallback(request));
  }
  // 其他请求（如 EventSource）走默认网络
});

/**
 * Cache-First：从缓存取，同时在后台更新缓存
 * 用户立刻看到缓存内容，下次访问用新版本
 */
async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // 无论缓存是否命中，都在后台发起网络请求更新缓存
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    // 有缓存：立即返回，后台默默更新
    // 不等待 fetchPromise，静默更新缓存
    fetchPromise.then(null, () => {});
    return cachedResponse;
  }

  // 无缓存：等待网络
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  // 完全离线且无缓存：返回离线页面
  const offlinePage = await cache.match('./index.html');
  if (offlinePage) return offlinePage;

  // 最后的兜底
  return new Response('网络不可用，请稍后重试', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Network-First with Cache Fallback：先尝试网络，失败回退到缓存
 * 确保用户总是看到最新内容，但离线时也能使用
 */
async function networkFirstWithCacheFallback(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    // 尝试返回 index.html 兜底
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;

    return new Response('请检查网络连接后重试', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
