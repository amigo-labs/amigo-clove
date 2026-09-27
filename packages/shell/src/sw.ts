/**
 * Service Worker der Shell. Kein Modul zur Laufzeit: `vite.config.ts` übersetzt
 * die Datei einzeln nach `sw.js` und setzt die `SW_…`-Platzhalter ein
 * (Build-Version, Dateiliste der App, Cache-Namen aus `cacheNames.ts`).
 *
 * - App (HTML, JS, Worklet): beim Installieren vorab, danach Cache zuerst;
 *   Navigation Netz zuerst mit `index.html` als Rückfall.
 * - `manifest.json` der Spiele: Netz zuerst, Rückfall auf den Cache.
 * - alles andere (content-gehashte Spielassets): Cache zuerst, bei Fehlen aus
 *   dem Netz holen und ablegen — jede gespielte Sitzung füllt den Cache.
 */

declare const SW_VERSION: string;
declare const SW_PRECACHE: readonly string[];
declare const SW_ASSET_CACHE: string;
declare const SW_APP_CACHE_PREFIX: string;

interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(r: Response | Promise<Response>): void;
}
interface Scope {
  readonly registration: { readonly scope: string };
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: "install" | "activate", listener: (e: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (e: FetchEvent) => void): void;
}

const sw = self as unknown as Scope;
const APP_CACHE = SW_APP_CACHE_PREFIX + SW_VERSION;
const scope = sw.registration.scope;
const indexUrl = new URL("index.html", scope).href;
/**
 * Server wie `vite preview` antworten mit `Vary: Origin`, Modul-Skripte schicken
 * `Origin` mit, die Vorab-Anfragen nicht — ohne `ignoreVary` fände der Cache sie nie.
 * Alle Dateien sind statisch, `Vary` ist für sie bedeutungslos.
 */
const MATCH: CacheQueryOptions = { ignoreVary: true };
const appFiles = new Set(SW_PRECACHE.map((p) => new URL(p, scope).href));

sw.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll([...appFiles])));
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith(SW_APP_CACHE_PREFIX) && n !== APP_CACHE)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

async function networkFirst(req: Request, cacheName: string, fallback?: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && fallback === undefined) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit =
      (await cache.match(req, MATCH)) ?? (fallback ? await cache.match(fallback) : undefined);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!url.href.startsWith(scope)) return;
  const bare = url.origin + url.pathname;
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, APP_CACHE, indexUrl));
  } else if (appFiles.has(bare)) {
    e.respondWith(cacheFirst(req, APP_CACHE));
  } else if (url.pathname.endsWith("/manifest.json")) {
    e.respondWith(networkFirst(req, SW_ASSET_CACHE));
  } else {
    e.respondWith(cacheFirst(req, SW_ASSET_CACHE));
  }
});

// Macht die Datei für TypeScript zum Modul (keine globalen Namen); der Build streicht die Zeile.
// oxlint-disable-next-line unicorn/require-module-specifiers
export {};
