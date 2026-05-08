const CACHE_NAME = "webmessenger-v1";

const STATIC_ASSETS = [
  "/frontend/index.html",
  "/frontend/app.js",
  "/frontend/style.css",
  "/frontend/manifest.json",
];


self.addEventListener("install", (event) => {
    console.log("[SW] Installiere Service Worker...");
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Caching statische Dateien");
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log("[SW] Service Worker aktiv!");
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log("[SW] Lösche alten Cache:", name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    if(url.pathname.startsWith("/api/")) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    if(url.hostname !== self.location.hostname){
        event.respondWith(networkFirst(event.request));
        return;
    }

    event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if(cached) return cached;

    try {
        const networkResponse = await fetch(request);
        if(networkResponse.ok){
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }catch {
        return caches.match("/frontend/index.html");
    }
}

async function networkFirst(request) {
    try{
        const networkResponse = await fetch(request);
        if(networkResponse.ok){
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }catch {
        const cached = await caches.match(request);
        return cached || new Response(
            JSON.stringify({error: "Offline - keine Verbindung"}),
            {headers: {"Content-Type": "application/json"}}
        );
    }
}

self.addEventListener("push", (event) => {
    if(!event.data) return;
    const data = event.data.json();
    self.registration.showNotification(data.title || "Neue Nachricht",
        {
                body: data.body || "Du hast eine neue Nachricht erhalten",
    icon: "/frontend/icons/icon-192x192.png",
    badge: "/frontend/icons/icon-72x72.png",
    vibrate: [200, 100, 200]
  });     
});