import {
  type PrecacheEntry,
  Serwist,
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const CACHE_VERSION = "motaabi-v1";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // ❌ navigationPreload disabled — causes issues on mobile browsers
  navigationPreload: false,
  runtimeCaching: [
    // 1. HTML pages — NetworkFirst: try network, fall back to cache
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: `${CACHE_VERSION}-pages`,
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          }),
        ],
      }),
    },

    // 2. Next.js static chunks (_next/static) — CacheFirst: very stable files
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: `${CACHE_VERSION}-next-static`,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 256,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          }),
        ],
      }),
    },

    // 3. Next.js image optimization — StaleWhileRevalidate
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/image"),
      handler: new StaleWhileRevalidate({
        cacheName: `${CACHE_VERSION}-next-image`,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          }),
        ],
      }),
    },

    // 4. App icons & manifest — CacheFirst
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/icons/") ||
        url.pathname === "/manifest.json" ||
        url.pathname.endsWith(".png") ||
        url.pathname.endsWith(".svg") ||
        url.pathname.endsWith(".ico"),
      handler: new CacheFirst({
        cacheName: `${CACHE_VERSION}-assets`,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },

    // 5. Google Fonts — StaleWhileRevalidate
    {
      matcher: ({ url }) =>
        url.origin === "https://fonts.googleapis.com" ||
        url.origin === "https://fonts.gstatic.com",
      handler: new StaleWhileRevalidate({
        cacheName: `${CACHE_VERSION}-fonts`,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 16,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },

    // 6. Supabase REST API — NetworkFirst with short timeout (data must be fresh)
    {
      matcher: ({ url }) => url.hostname.includes("supabase"),
      handler: new NetworkFirst({
        cacheName: `${CACHE_VERSION}-api`,
        networkTimeoutSeconds: 8,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 60 * 60, // 1 hour
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
