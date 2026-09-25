import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Generierte Assets liegen im Repo unter assets/ und werden 1:1 ausgeliefert
// (content-gehashte Dateinamen, nie im Bundle).
export default defineConfig({
  publicDir: fileURLToPath(new URL("../../assets", import.meta.url)),
  build: { target: "es2023", assetsInlineLimit: 0 },
  server: { port: 5173 },
});
