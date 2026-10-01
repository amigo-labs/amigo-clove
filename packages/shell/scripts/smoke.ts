/**
 * Browser-Smoke-Test: startet den gebauten Launcher per `vite preview` und prüft
 * in Chromium (WebGL über SwiftShader):
 * 1. DOVE startet aus kaltem Cache fehlerfrei und rendert, die DoveZ-Asset-
 *    Ansicht zeigt Sprites, die Level-Ansicht zeichnet Routen und Schüsse,
 *    Titelmenü, Optionen und Pause (mit Tastenübersicht) erscheinen als HTML,
 * 2. Launcher (aufklappbare Tastenübersicht) und Einstellungen (Sprachwechsel) funktionieren,
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
/**
 * Gestreamte Medien (Musik, Video): Chromium bricht eigene Anfragen ab und
 * wechselt auf Range-Anfragen; das ist kein Fehler. HTTP-Fehler zählen weiter.
 */
function media(url: string): boolean {
  return /\.(ogg|webm)$/.test(url);
}

function watch(page: Page, label: string): void {
  page.on("pageerror", (e) => failures.push(`${label} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !media(m.location().url))
      failures.push(`${label} console: ${m.text()} (${m.location().url})`);
  });
  page.on("requestfailed", (r) => {
    if (!media(r.url())) failures.push(`${label} request: ${r.url()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${label} HTTP ${r.status()}: ${r.url()}`);
  });
}

/**
 * Pause als HTML: das Pausemenü der Shell erscheint mit Tastenübersicht und verschwindet
 * beim Weiterspielen. Esc bleibt gehalten, bis die Pause da ist (die Spiele fragen den
 * Tastenzustand pro Tick ab, auf langsamen Rechnern ist ein Tick länger als ein
 * Tippen); weiter geht es mit Enter auf dem vorgewählten „Weiter“.
 */
async function checkPauseControls(page: Page, label: string): Promise<void> {
  const pause = ".ui-screen[data-kind=menu]";
  const hold = async (key: string, until: () => Promise<unknown>) => {
    await page.keyboard.down(key);
    try {
      await until();
    } catch {
      // gemeldet wird unten am Ergebnis
    }
    await page.keyboard.up(key);
    await page.waitForTimeout(500);
  };
  await hold("Escape", () => page.waitForSelector(pause, { timeout: 10_000 }));
  const rows = await page.locator(`${pause} .ui-controls tbody tr`).count();
  await page.keyboard.press("Enter");
  await page.waitForSelector(pause, { state: "detached", timeout: 10_000 }).catch(() => undefined);
  const after = await page.locator(pause).count();
  console.log(`${label}: Pausemenü mit Tastenübersicht (${rows} Zeilen)`);
  if (rows < 10) failures.push(`${label}: Tastenübersicht fehlt in der Pause (${rows} Zeilen)`);
  if (after !== 0) failures.push(`${label}: Pausemenü bleibt nach „Weiter“ stehen`);
}

/** DOVE-Titelmenü als HTML: sechs Einträge, Optionen öffnen und mit Esc zurück. */
async function checkDoveMenus(page: Page, label: string): Promise<void> {
  await page.goto(`${ORIGIN}/#/dove?nointro=1&nosound`);
  await page.waitForSelector("body[data-game=dove]", { timeout: 30_000 });
  const title = ".ui-screen[data-kind=menu] .ui-item";
  await page.waitForSelector(title, { timeout: 30_000 });
  const items = await page.locator(title).count();
  await page.click(`${title}[data-id="4"]`);
  const form = await page
    .waitForSelector(".ui-screen[data-kind=form]", { timeout: 10_000 })
    .catch(() => null);
  await page.keyboard.press("Escape");
  const back = await page.waitForSelector(title, { timeout: 10_000 }).catch(() => null);
  console.log(`${label}: Titelmenü mit ${items} Einträgen, Optionen ${form ? "ok" : "fehlen"}`);
  if (items !== 6) failures.push(`${label}: Titelmenü hat ${items} statt 6 Einträge`);
  if (!form) failures.push(`${label}: Optionen öffnen nicht`);
  if (!back) failures.push(`${label}: Esc führt nicht zum Titel zurück`);
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

  // Vorgabe: HTML-HUD der Shell, der Canvas zeigt nur das Spielfeld (640 × 410, zentriert).
  const hud = await page.textContent(".hud:not([hidden]) .hud-score");
  const top = await page.evaluate(() => document.querySelector("canvas")?.offsetTop ?? 0);
  const field = await litShare(png, 0, top, 640, 410);
  console.log(`${label}: HUD „${hud}“, Spielfeld ${(field * 100).toFixed(1)} % hell`);
  if (!hud?.match(/\d/)) failures.push(`${label}: HTML-HUD fehlt`);
  if (field < 0.05) failures.push(`${label}: Spielfeld leer (${(field * 100).toFixed(1)} %)`);
  await checkPauseControls(page, label);
}

/** Original-HUD (Einstellung): die Konsole (konsole.spr) ist opak und hell. */
async function playDoveOriginalHud(page: Page, label: string): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem("clove:settings", JSON.stringify({ hud: "original" })),
  );
  await page.goto(`${ORIGIN}/#/dove?level=1&seed=1&invincible=1&from=2100`);
  await page.waitForSelector("body[data-game=dove]", { timeout: 30_000 });
  await page.waitForTimeout(2000);
  const png = await page.screenshot();
  const hud = await litShare(png, 0, 410, 640, 70);
  console.log(`${label}: Original-HUD ${(hud * 100).toFixed(1)} % hell`);
  if (hud < 0.9)
    failures.push(`${label}: Original-HUD nicht gerendert (${(hud * 100).toFixed(1)} %)`);
}

/** DoveZ-Hauptmenü ohne Logos als HTML: mindestens „Neu“, „Laden“, „Optionen“, „Exit“. */
async function playDoveZMenu(page: Page, label: string): Promise<number> {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(`${ORIGIN}/#/dovez?nointro=1`);
  await page.waitForSelector("body[data-game=dovez]", { timeout: 60_000 });
  const item = ".ui-screen[data-kind=menu] .ui-item";
  await page.waitForSelector(item, { timeout: 60_000 }).catch(() => undefined);
  const items = await page.locator(item).count();
  console.log(`${label}: Hauptmenü mit ${items} Einträgen`);
  if (items < 4) failures.push(`${label}: Hauptmenü nicht gezeigt (${items} Einträge)`);
  return items;
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
  await checkDoveMenus(cold, "dove-menü");
  await cold.close();

  // 1a. Original-HUD per Einstellung
  const original = await browser.newPage({ viewport: { width: 640, height: 480 } });
  watch(original, "original-hud");
  await playDoveOriginalHud(original, "original-hud");
  await original.close();

  // 1b. DoveZ-Asset-Ansicht: erster Atlas mit Konturen, dann Wechsel zum nächsten
  const assets = await browser.newPage({ viewport: { width: 800, height: 600 } });
  watch(assets, "dovez-assets");
  await assets.goto(`${ORIGIN}/#/dovez/debug/assets`);
  await assets.waitForSelector("body[data-game=dovez]", { timeout: 30_000 });
  await assets.waitForTimeout(1500);
  const first = await assets.screenshot();
  // gehalten, nicht getippt: die Ansicht fragt den Tastenzustand einmal pro Frame ab
  await assets.keyboard.down("ArrowRight");
  await assets.waitForTimeout(100);
  await assets.keyboard.up("ArrowRight");
  await assets.waitForTimeout(1500);
  const second = await assets.screenshot();
  const sprites = await litShare(first, 0, 44, 800, 556);
  const next = await litShare(second, 0, 44, 800, 556);
  console.log(`dovez-assets: ${(sprites * 100).toFixed(1)} % / ${(next * 100).toFixed(1)} % hell`);
  if (sprites < 0.05 || next < 0.05) failures.push("dovez-assets: keine Sprites gerendert");
  if (Buffer.compare(first, second) === 0) failures.push("dovez-assets: Atlaswechsel ohne Wirkung");
  if (process.env["SMOKE_SHOTS"]) {
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-assets-1.png`, first);
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-assets-2.png`, second);
  }
  await assets.close();

  // 1b2. DoveZ spielen: Skyfight ab Tick 300, unverwundbar, feuern
  const game = await browser.newPage({ viewport: { width: 800, height: 600 } });
  watch(game, "dovez-game");
  await game.goto(`${ORIGIN}/#/dovez?level=level1-1_skyfight&invincible=1&from=300`);
  await game.waitForSelector("body[data-game=dovez]", { timeout: 30_000 });
  await game.keyboard.down("KeyS");
  await game.waitForTimeout(2500);
  const played = await game.screenshot();
  await game.keyboard.up("KeyS");
  const field = await litShare(played, 0, 0, 800, 550);
  console.log(`dovez-game: Spielfeld ${(field * 100).toFixed(1)} % hell`);
  if (field < 0.2) failures.push("dovez-game: Spielfeld leer");
  await checkPauseControls(game, "dovez-game");
  if (process.env["SMOKE_SHOTS"])
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-game.png`, played);
  await game.close();

  // 1b3. DoveZ-Hauptmenü ohne Logos als HTML, dann „Neu“ → Spieleranzahl
  const menu = await browser.newPage({ viewport: { width: 800, height: 600 } });
  watch(menu, "dovez-menu");
  await playDoveZMenu(menu, "dovez-menu");
  const mainTitle = await menu.locator(".ui-title").textContent();
  await menu.keyboard.press("Enter");
  await menu.waitForTimeout(1000);
  const nextTitle = await menu
    .locator(".ui-title")
    .textContent()
    .catch(() => null);
  console.log(`dovez-menu: „${mainTitle}“ → „${nextTitle}“`);
  if (!nextTitle || nextTitle === mainTitle) failures.push("dovez-menu: „Neu“ ohne Wirkung");
  if (process.env["SMOKE_SHOTS"])
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-menu.png`, await menu.screenshot());
  await menu.close();

  // 1b4. DoveZ mit Logos und Intro: die Content-Security-Policy darf Video und Musik nicht sperren
  const intro = await browser.newPage({ viewport: { width: 800, height: 600 } });
  watch(intro, "dovez-intro");
  await intro.goto(`${ORIGIN}/#/dovez`);
  await intro.waitForSelector("body[data-game=dovez]", { timeout: 30_000 });
  // die Logos wechseln mit schwarzen Pausen: das hellste von drei Bildern zählt
  let logoLit = 0;
  for (let i = 0; i < 4; i++) {
    await intro.waitForTimeout(2500);
    logoLit = Math.max(logoLit, await litShare(await intro.screenshot(), 0, 0, 800, 600));
  }
  console.log(`dovez-intro: ${(logoLit * 100).toFixed(1)} % hell`);
  if (logoLit < 0.02) failures.push("dovez-intro: Logos nicht gezeichnet");
  await intro.close();

  // 1b5. Osterei „LOV“ (Sichtprüfung ohne Menü): nach der Einblendung leuchten Punkte
  const love = await browser.newPage({ viewport: { width: 800, height: 600 } });
  watch(love, "dovez-love");
  await love.goto(`${ORIGIN}/#/dovez?screen=love`);
  await love.waitForSelector("body[data-game=dovez]", { timeout: 30_000 });
  await love.waitForTimeout(9000);
  const loveShot = await love.screenshot();
  const loveLit = await litShare(loveShot, 0, 0, 800, 600);
  console.log(`dovez-love: ${(loveLit * 100).toFixed(1)} % hell`);
  if (loveLit < 0.05) failures.push("dovez-love: Osterei nicht gezeichnet");
  if (process.env["SMOKE_SHOTS"])
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-love.png`, loveShot);
  await love.close();

  // 1c. DoveZ-Level-Ansicht: Route zeichnen, zur nächsten, dann Schussmuster
  const levelView = await browser.newPage({ viewport: { width: 800, height: 600 } });
  watch(levelView, "dovez-level");
  await levelView.goto(`${ORIGIN}/#/dovez/debug/level`);
  await levelView.waitForSelector("body[data-game=dovez]", { timeout: 30_000 });
  await levelView.waitForTimeout(1500);
  const tap = async (key: string) => {
    await levelView.keyboard.down(key);
    await levelView.waitForTimeout(100);
    await levelView.keyboard.up(key);
    await levelView.waitForTimeout(100);
  };
  // Liste aus: gemessen wird nur, was die Simulation zeichnet
  await tap("KeyD");
  const routeA = await levelView.screenshot();
  await tap("ArrowDown");
  await levelView.waitForTimeout(500);
  const routeB = await levelView.screenshot();
  await tap("KeyM");
  await levelView.waitForTimeout(500);
  const shots = await levelView.screenshot();
  const lit = await Promise.all(
    [routeA, routeB, shots].map((png) => litShare(png, 0, 80, 800, 520)),
  );
  console.log(`dovez-level: ${lit.map((v) => (v * 100).toFixed(2)).join(" / ")} % gezeichnet`);
  if (lit.some((v) => v < 0.001)) failures.push("dovez-level: keine Pfade gezeichnet");
  if (Buffer.compare(routeA, routeB) === 0)
    failures.push("dovez-level: Routenwechsel ohne Wirkung");
  if (process.env["SMOKE_SHOTS"]) {
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-level-route.png`, routeA);
    await Bun.write(`${process.env["SMOKE_SHOTS"]}/dovez-level-shots.png`, shots);
  }
  await levelView.close();

  // 2. Launcher und Einstellungen; dann Spieldaten offline installieren
  const context = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await context.newPage();
  watch(page, "shell");
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector("#launcher [data-play=dove]");
  for (const id of ["dove", "dovez"]) {
    await page.click(`details[data-controls=${id}] summary`);
    const rows = await page.locator(`details[data-controls=${id}][open] tbody tr`).count();
    if (rows < 10) failures.push(`launcher: Tastenübersicht ${id} fehlt (${rows} Zeilen)`);
  }
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
  await page.click("[data-install=dovez]");
  await page.waitForSelector("[data-install=dovez][data-state=ready]", { timeout: 300_000 });
  console.log("Offline-Installation abgeschlossen (DOVE und DoveZ).");

  // 3. Server beenden: DOVE und das DoveZ-Hauptmenü müssen vollständig aus dem Cache starten
  server.kill();
  await server.exited;
  page.removeAllListeners("requestfailed");
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector("#launcher [data-play=dove]");
  await playDove(page, "offline");
  await playDoveZMenu(page, "offline-dovez");
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
