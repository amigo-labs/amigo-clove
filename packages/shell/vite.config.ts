import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

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

// Generierte Assets liegen im Repo unter assets/ und werden 1:1 ausgeliefert
// (content-gehashte Dateinamen, nie im Bundle).
export default defineConfig({
  publicDir: fileURLToPath(new URL("../../assets", import.meta.url)),
  build: { target: "es2023", assetsInlineLimit: 0 },
  server: { port: 5173 },
  plugins: [chiptuneWorklet()],
});
