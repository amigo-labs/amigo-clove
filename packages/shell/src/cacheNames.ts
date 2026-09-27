/**
 * Cache-Namen, geteilt von Shell und Service Worker (der Vite-Build setzt sie
 * in `sw.js` ein). Spielassets sind content-gehasht und damit unveränderlich:
 * ein Cache für alle Versionen, veraltete Dateien räumt die Installation ab.
 * Die App selbst (HTML, JS, Worklet) liegt je Build in einem eigenen Cache.
 */
export const ASSET_CACHE = "clove-assets-v1";
export const APP_CACHE_PREFIX = "clove-app-";
