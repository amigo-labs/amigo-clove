import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, transformWithOxc, type Plugin } from "vite";
import { APP_CACHE_PREFIX, ASSET_CACHE } from "./src/cacheNames.ts";

/**
 * libopenmpt-Worklet (chiptune3) unverändert unter /vendor/chiptune3/ ausliefern:
 * `chiptune3.worklet.js` importiert `./libopenmpt.worklet.js` relativ, das darf
 * der Bundler nicht umbenennen.
 */
function chiptuneWorklet(): Plugin {
  const require = createRequire(join(fileURLToPath(import.meta.url), "../../audio/package.json"));
  const dir = dirname(require.resolve("chiptune3/chiptune3.worklet.js"));
  const files = ["chiptune3.worklet.js", "libopenmpt.worklet.js"];
  const prefix = "/vendor/chiptune3/";
  return {
    name: "clove-chiptune-worklet",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.startsWith(prefix) ? req.url.slice(prefix.length) : "";
        if (!files.includes(name)) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({
          type: "asset",
          fileName: `vendor/chiptune3/${name}`,
          source: readFileSync(join(dir, name)),
        });
      }
    },
  };
}

/**
 * `src/sw.ts` als klassisches Worker-Skript `sw.js` ausgeben: einzeln übersetzt
 * (kein Bundling, keine geteilten Chunks), Platzhalter ersetzt. Die Vorab-Liste
 * ist die gesamte Build-Ausgabe außer den Spielassets aus `publicDir`, die
 * Version ein Hash über alle Dateinamen und `index.html` — content-gehashte
 * Namen ändern sich mit dem Inhalt.
 */
function serviceWorker(): Plugin {
  const source = fileURLToPath(new URL("./src/sw.ts", import.meta.url));
  return {
    name: "clove-service-worker",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith(".map"))
        .toSorted();
      const version = createHash("sha256");
      for (const f of files) {
        const out = bundle[f];
        version.update(f);
        if (out?.type === "asset" && f === "index.html") version.update(out.source);
      }
      const { code } = await transformWithOxc(readFileSync(source, "utf8"), source, {
        lang: "ts",
        target: "es2022",
      });
      const replacements: Record<string, string> = {
        SW_VERSION: JSON.stringify(version.digest("hex").slice(0, 12)),
        SW_PRECACHE: JSON.stringify(["./", ...files]),
        SW_ASSET_CACHE: JSON.stringify(ASSET_CACHE),
        SW_APP_CACHE_PREFIX: JSON.stringify(APP_CACHE_PREFIX),
      };
      const script = code.replace(/^export \{\s*\};?\s*$/m, "").replace(/\bSW_[A-Z_]+\b/g, (m) => {
        const r = replacements[m];
        if (r === undefined) throw new Error(`sw.ts: unbekannter Platzhalter ${m}`);
        return r;
      });
      this.emitFile({ type: "asset", fileName: "sw.js", source: script });
    },
  };
}

// Generierte Assets liegen im Repo unter assets/ und werden 1:1 ausgeliefert
// (content-gehashte Dateinamen, nie im Bundle).
export default defineConfig({
  publicDir: fileURLToPath(new URL("../../assets", import.meta.url)),
  // Relative Pfade: die Site läuft unter jedem Unterpfad (statisches Hosting).
  base: "./",
  build: { target: "es2023", assetsInlineLimit: 0 },
  server: { port: 5173 },
  plugins: [chiptuneWorklet(), serviceWorker()],
});
