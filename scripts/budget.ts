/**
 * Größenbudget der gebauten Site (`bun run build` vorher): Der Code (JS, gzip) bleibt
 * unter 450 KB, `index.html` unter 20 KB, jedes einzelne Bundle unter 120 KB. Die Spiel-
 * assets (~150 MB) zählen nicht: sie laden je Level bzw. beim Offline-Installieren.
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "../packages/shell/dist");
const KB = 1024;
const failures: string[] = [];

const assets = readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".js"));
let total = 0;
for (const f of assets) {
  const gz = gzipSync(readFileSync(join(DIST, "assets", f))).length;
  total += gz;
  if (gz > 120 * KB) failures.push(`${f}: ${(gz / KB).toFixed(1)} KB gzip (Grenze 120 KB)`);
}
const html = statSync(join(DIST, "index.html")).size;
console.log(`JS gesamt: ${(total / KB).toFixed(1)} KB gzip in ${assets.length} Dateien`);
console.log(`index.html: ${(html / KB).toFixed(1)} KB`);
if (total > 450 * KB) failures.push(`JS gesamt ${(total / KB).toFixed(1)} KB gzip (Grenze 450 KB)`);
if (html > 20 * KB) failures.push(`index.html ${(html / KB).toFixed(1)} KB (Grenze 20 KB)`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Größenbudget eingehalten.");
