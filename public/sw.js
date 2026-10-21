// Service worker so Chrome offers "Install app". Chrome ignores an empty fetch handler (and then
// never fires its install prompt), so page loads pass through here. Network only, no caching:
// a new deploy is always what loads. Offline, a page load gets a short notice instead of an error.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline</title>"
      + "<p style='font-family:monospace;padding:16px'>You are offline. Extraction Theory needs a connection to reach your Google Sheet.</p>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  )));
});
