/**
 * Browser-Smoke-Test: startet den gebauten Launcher per `vite preview`, bootet
 * DOVE in Chromium (WebGL über SwiftShader) und prüft, dass es fehlerfrei
 * läuft und rendert. Aufruf: `bun run smoke` (baut vorher mit Vite).
 */
import { chromium } from "playwright-core";
import sharp from "sharp";

const PORT = 4173;
const server = Bun.spawn(["bunx", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: `${import.meta.dir}/..`,
  stdout: "ignore",
  stderr: "inherit",
});

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {
      // noch nicht bereit
    }
    await Bun.sleep(100);
  }
  throw new Error("vite preview startet nicht");
}

/** Anteil der Pixel im Rechteck, die nicht (fast) schwarz sind. */
async function litShare(png: Buffer, x: number, y: number, w: number, h: number): Promise<number> {
  const { data, info } = await sharp(png)
    .extract({ left: x, top: y, width: w, height: h })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let lit = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if ((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number) > 60) lit++;
  }
  return lit / (w * h);
}

const failures: string[] = [];
try {
  await waitForServer();
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon"))
      failures.push(`console: ${m.text()}`);
  });
  page.on("requestfailed", (r) => failures.push(`request: ${r.url()}`));

  await page.goto(`http://localhost:${PORT}/#/dove?level=1&seed=1&invincible=1&from=2100`);
  await page.waitForSelector("body[data-game]", { timeout: 30_000 });
  const state = await page.getAttribute("body", "data-game");
  if (state !== "dove") failures.push(`Boot fehlgeschlagen: ${await page.textContent("#error")}`);

  await page.keyboard.down("KeyS");
  await page.waitForTimeout(3000);
  const png = await page.screenshot();
  await page.keyboard.up("KeyS");
  await browser.close();

  // HUD (konsole.spr) ist opak und hell; im Spielfeld liegt ab Tick 2100 Landschaft.
  const hud = await litShare(png, 0, 410, 640, 70);
  const field = await litShare(png, 0, 0, 640, 410);
  console.log(`HUD ${(hud * 100).toFixed(1)} % hell, Spielfeld ${(field * 100).toFixed(1)} % hell`);
  if (hud < 0.9) failures.push(`HUD nicht gerendert (${(hud * 100).toFixed(1)} %)`);
  if (field < 0.05) failures.push(`Spielfeld leer (${(field * 100).toFixed(1)} %)`);
} catch (err) {
  failures.push(String(err));
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Smoke-Test bestanden.");
