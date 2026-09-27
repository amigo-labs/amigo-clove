import type { Manifest } from "@clove/core";
import { ASSET_CACHE } from "./cacheNames";

/**
 * Offline-Betrieb: Service Worker registrieren und Spieldaten ausdrücklich
 * vollständig in den Asset-Cache legen („Spieldaten installieren“). Der Worker
 * bedient danach jede Anfrage aus demselben Cache.
 */

export function offlineSupported(): boolean {
  return import.meta.env.PROD && "serviceWorker" in navigator && typeof caches !== "undefined";
}

export async function registerServiceWorker(): Promise<void> {
  if (!offlineSupported()) return;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  } catch (err) {
    console.warn("Service Worker nicht registriert:", err);
  }
}

export interface OfflineStatus {
  readonly cachedBytes: number;
  readonly totalBytes: number;
  readonly persisted: boolean;
}

function manifestUrl(game: string): string {
  return new URL(`${import.meta.env.BASE_URL}${game}/manifest.json`, location.href).href;
}

async function readManifest(url: string): Promise<Manifest> {
  // Über den Worker: offline kommt das Manifest aus dem Cache.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Manifest ${url}: HTTP ${res.status}`);
  return (await res.json()) as Manifest;
}

function entryUrls(manifest: Manifest, base: string): { url: string; bytes: number }[] {
  return manifest.entries.map((e) => ({ url: new URL(e.file, base).href, bytes: e.bytes }));
}

export async function offlineStatus(game: string): Promise<OfflineStatus> {
  const url = manifestUrl(game);
  const manifest = await readManifest(url);
  const cache = await caches.open(ASSET_CACHE);
  let cachedBytes = 0;
  let totalBytes = 0;
  for (const e of entryUrls(manifest, url)) {
    totalBytes += e.bytes;
    if (await cache.match(e.url, { ignoreVary: true })) cachedBytes += e.bytes;
  }
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  return { cachedBytes, totalBytes, persisted };
}

/**
 * Lädt alle fehlenden Dateien eines Spiels in den Cache (höchstens sechs
 * gleichzeitig), legt das Manifest dazu und entfernt Dateien älterer
 * Asset-Stände. Bittet den Browser, die Daten dauerhaft zu behalten.
 */
export async function installGame(
  game: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  void navigator.storage?.persist?.();
  const url = manifestUrl(game);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Manifest ${url}: HTTP ${res.status}`);
  const manifest = (await res.clone().json()) as Manifest;
  const cache = await caches.open(ASSET_CACHE);
  await cache.put(url, res);

  const entries = entryUrls(manifest, url);
  const total = entries.reduce((s, e) => s + e.bytes, 0);
  let loaded = 0;
  const missing: typeof entries = [];
  for (const e of entries) {
    if (await cache.match(e.url, { ignoreVary: true })) loaded += e.bytes;
    else missing.push(e);
  }
  onProgress(loaded, total);
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const e = missing[next++] as (typeof missing)[number];
      const r = await fetch(e.url);
      if (!r.ok) throw new Error(`${e.url}: HTTP ${r.status}`);
      await cache.put(e.url, r);
      loaded += e.bytes;
      onProgress(loaded, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, missing.length) }, worker));

  const keep = new Set([url, ...entries.map((e) => e.url)]);
  const prefix = url.slice(0, url.lastIndexOf("/") + 1);
  for (const req of await cache.keys()) {
    if (req.url.startsWith(prefix) && !keep.has(req.url)) await cache.delete(req);
  }
}

/** Entfernt alle Dateien eines Spiels aus dem Cache (das Manifest eingeschlossen). */
export async function removeGame(game: string): Promise<void> {
  const prefix = new URL(`${import.meta.env.BASE_URL}${game}/`, location.href).href;
  const cache = await caches.open(ASSET_CACHE);
  for (const req of await cache.keys()) if (req.url.startsWith(prefix)) await cache.delete(req);
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | undefined> {
  const est = await navigator.storage?.estimate?.();
  return est?.usage !== undefined && est.quota !== undefined
    ? { used: est.usage, quota: est.quota }
    : undefined;
}
