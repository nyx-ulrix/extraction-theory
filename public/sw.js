// Minimal service worker so browsers offer "Install app". Network only: no caching,
// so a new deploy is always what loads (Sheets data needs a connection anyway).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
