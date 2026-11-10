const CACHE = "mcq-web-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./src/styles.css", "./src/app.js", "./src/db.js", "./src/annotate.js", "./src/image.js", "./src/core/template.js", "./src/core/otsu.js", "./src/core/answers.js", "./src/core/grader.js", "./src/core/imaging.js", "./src/core/markers.js", "./src/core/scan.js", "./src/core/sheetPdf.js", "./vendor/pdf-lib.esm.min.js", "./assets/icon-192.png", "./assets/icon-512.png"];
const clean = async (r) => (r.redirected ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r);
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map(async (u) => { const r = await fetch(u, { cache: "reload" }); if (r.ok) await c.put(u, await clean(r)); })))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const q = e.request, u = new URL(q.url); if (q.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(q).then(async (r) => { if (r.ok) { const copy = await clean(r.clone()); caches.open(CACHE).then((c) => c.put(q, copy)); } return r; }).catch(() => caches.match(q, { ignoreSearch: true }).then((h) => h || (q.mode === "navigate" ? caches.match("./index.html") : undefined))));
});
