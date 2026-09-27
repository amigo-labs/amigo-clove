/**
 * Browser-Smoke-Test: startet den gebauten Launcher per `vite preview` und prüft
 * in Chromium (WebGL über SwiftShader):
 * 1. DOVE startet aus kaltem Cache fehlerfrei und rendert,
 * 2. Launcher und Einstellungen (Sprachwechsel) funktionieren,
 * 3. nach „Spieldaten installieren“ startet DOVE bei beendetem Server
 *    vollständig aus dem Service-Worker-Cache.
 * Aufruf: `bun run smoke` (baut vorher mit Vite).
 */
import { chromium, type Page } from "playwright-core";
import sharp from "sharp";

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
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

/** Fehler der Seite sammeln; `requestfailed` nur, solange das Netz da sein soll. */
function watch(page: Page, label: string): void {
  page.on("pageerror", (e) => failures.push(`${label} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon"))
      failures.push(`${label} console: ${m.text()}`);
  });
  page.on("requestfailed", (r) => failures.push(`${label} request: ${r.url()}`));
}

/** DOVE Level 1 ab Tick 2100 direkt starten und prüfen, dass HUD und Spielfeld rendern. */
async function playDove(page: Page, label: string): Promise<void> {
  await page.goto(`${ORIGIN}/#/dove?level=1&seed=1&invincible=1&from=2100`);
  await page.waitForSelector("body[data-game]", { timeout: 30_000 });
  const state = await page.getAttribute("body", "data-game");
  if (state !== "dove") {
    failures.push(`${label}: Boot fehlgeschlagen: ${await page.textContent("#error")}`);
    return;
  }
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(3000);
  const png = await page.screenshot();
  await page.keyboard.up("KeyS");

  // HUD (konsole.spr) ist opak und hell; im Spielfeld liegt ab Tick 2100 Landschaft.
  const hud = await litShare(png, 0, 410, 640, 70);
  const field = await litShare(png, 0, 0, 640, 410);
  console.log(
    `${label}: HUD ${(hud * 100).toFixed(1)} % hell, Spielfeld ${(field * 100).toFixed(1)} % hell`,
  );
  if (hud < 0.9) failures.push(`${label}: HUD nicht gerendert (${(hud * 100).toFixed(1)} %)`);
  if (field < 0.05) failures.push(`${label}: Spielfeld leer (${(field * 100).toFixed(1)} %)`);
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });

  // 1. Kalter Start ohne Cache direkt ins Spiel
  const cold = await browser.newPage({ viewport: { width: 640, height: 480 } });
  watch(cold, "kalt");
  await playDove(cold, "kalt");
  await cold.close();

  // 2. Launcher und Einstellungen; dann Spieldaten offline installieren
  const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await context.newPage();
  watch(page, "shell");
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector("#launcher [data-play=dove]");
  await page.click("a[href='#/settings']");
  await page.waitForSelector("#settings");
  await page.selectOption("#language", "en");
  await page.waitForFunction(
    () => document.querySelector("#settings h1")?.textContent === "Settings",
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForSelector("[data-install=dove][data-state=missing]");
  await page.click("[data-install=dove]");
  await page.waitForSelector("[data-install=dove][data-state=ready]", { timeout: 120_000 });
  console.log("Offline-Installation abgeschlossen.");

  // 3. Server beenden: DOVE muss vollständig aus dem Cache starten
  server.kill();
  await server.exited;
  page.removeAllListeners("requestfailed");
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector("#launcher [data-play=dove]");
  await playDove(page, "offline");
  await browser.close();
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
