const CACHE_NAME = "mumscare-auth-media-v4";
const OFFLINE_ASSETS = [
  "/media/authentication-background.mp4",
  "/media/authentication-background-poster.jpg",
  "/mums-care-logo.png",
  "/fonts/satoshi-regular.woff2",
  "/fonts/satoshi-medium.woff2",
  "/fonts/satoshi-bold.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(OFFLINE_ASSETS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (response.ok) await cache.put(path, response);
      } catch {
        // Keep the worker installable; a later online media request can fill the cache.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("mumscare-auth-media-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function rangedResponse(response, rangeHeader) {
  return response.arrayBuffer().then((body) => {
    const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    const size = body.byteLength;
    if (!range || size === 0) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }

    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[2] && range[1] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }

    const headers = new Headers(response.headers);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    headers.delete("Content-Encoding");
    return new Response(body.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers });
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !OFFLINE_ASSETS.includes(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);
    if (cached) {
      const range = request.headers.get("Range");
      return range ? rangedResponse(cached, range) : cached;
    }

    // Fetch a complete response so the same asset can serve future byte-range requests offline.
    const response = await fetch(url.pathname);
    if (response.ok && response.status === 200) await cache.put(url.pathname, response.clone());
    const range = request.headers.get("Range");
    return range && response.status === 200 ? rangedResponse(response, range) : response;
  })());
});
