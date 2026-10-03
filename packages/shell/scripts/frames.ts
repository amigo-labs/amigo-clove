/**
 * Referenzbilder der Darstellung: feste Szenen beider Spiele bei fester Tickzahl,
 * mit Playwrights Uhr (`page.clock`) statt Echtzeit und einem Bildtakt gleich dem
 * Tick des Spiels (DOVE 14 ms, DoveZ 16 ms) — jedes Anzeigebild ist genau ein
 * Tick, das Bild also unabhängig von Rechnergeschwindigkeit und Ladezeit. Verglichen
 * wird der SHA-256 des Canvas-Ausschnitts gegen `frames.json`; so fällt jede
 * Änderung am Bild auf, auch eine unbeabsichtigte durch Optimierungen.
 * Aufruf: `bun run frames` (baut vorher, prüft), `--write` schreibt `frames.json`
 * neu (nur bei gewollter Bildänderung), `--save=<Ordner>` legt die PNGs ab,
 * `--only=<Teil des Namens>`.
 */
import { chromium, type Page } from "playwright-core";

const PORT = 4176;
const ORIGIN = `http://localhost:${PORT}`;
const FILE = `${import.meta.dir}/frames.json`;
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const WRITE = process.argv.includes("--write");
const SAVE = arg("save");
const ONLY = arg("only");

interface Shot {
  readonly name: string;
  readonly url: string;
  /** Ticks ab Levelstart bis zur Aufnahme (Dauerfeuer). */
  readonly ticks: number;
  /** Einstellungen der Shell (z. B. `hud`, `scale`, `resolution`). */
  readonly settings?: Readonly<Record<string, string>>;
  /** Fenstergröße, Vorgabe 1280 × 720 (`fit` mit gebrochenem Faktor). */
  readonly viewport?: { readonly width: number; readonly height: number };
}

/** Ganzzahlig doppelt: DOVE-Feld 640 × 410 bzw. DoveZ-Feld 800 × 550 (HTML-HUD). */
const TWICE_DOVE = { width: 1400, height: 900 };
const TWICE_DOVEZ = { width: 1700, height: 1200 };

const SHOTS: readonly Shot[] = [
  { name: "dove-1", url: "#/dove?level=1&seed=1&invincible=1&from=2100", ticks: 150 },
  {
    name: "dove-1-hud",
    url: "#/dove?level=1&seed=1&from=2100",
    ticks: 150,
    settings: { hud: "original" },
  },
  {
    name: "dove-1-int",
    url: "#/dove?level=1&seed=1&invincible=1&from=2100",
    ticks: 150,
    settings: { scale: "integer" },
    viewport: TWICE_DOVE,
  },
  { name: "dove-6", url: "#/dove?level=6&seed=1&invincible=1&from=600", ticks: 200 },
  { name: "dove-11", url: "#/dove?level=11&seed=1&invincible=1&from=600", ticks: 200 },
  {
    name: "dovez-skyfight",
    url: "#/dovez?level=level1-1_skyfight&invincible=1&from=300",
    ticks: 150,
  },
  {
    name: "dovez-skyfight-hud",
    url: "#/dovez?level=level1-1_skyfight&from=300",
    ticks: 150,
    settings: { hud: "original" },
  },
  {
    name: "dovez-skyfight-int",
    url: "#/dovez?level=level1-1_skyfight&invincible=1&from=300",
    ticks: 150,
    settings: { scale: "integer" },
    viewport: TWICE_DOVEZ,
  },
  {
    name: "dovez-atlantis-int",
    url: "#/dovez?level=level5-1_atlantis&invincible=1&from=600",
    ticks: 150,
    settings: { scale: "integer" },
    viewport: TWICE_DOVEZ,
  },
  {
    name: "dovez-station",
    url: "#/dovez?level=level2-1_spacestation_i&invincible=1&from=600",
    ticks: 150,
  },
  {
    name: "dovez-cityboss",
    url: "#/dovez?level=level4-3_cityboss&invincible=1&from=300",
    ticks: 200,
  },
  {
    name: "dovez-atlantis",
    url: "#/dovez?level=level5-1_atlantis&invincible=1&from=600",
    ticks: 150,
  },
  { name: "dovez-escape", url: "#/dovez?level=level7-5_escape&invincible=1&from=300", ticks: 150 },
  {
    name: "dovez-bonus",
    url: "#/dovez?level=spacestation_bonus&invincible=1&from=300",
    ticks: 150,
  },
  // HD: Bildschirmauflösung (bei 1280 × 720 doppelt)
  {
    name: "dove-1-hd",
    url: "#/dove?level=1&seed=1&invincible=1&from=2100",
    ticks: 150,
    settings: { resolution: "hd" },
  },
  {
    name: "dovez-skyfight-hd",
    url: "#/dovez?level=level1-1_skyfight&invincible=1&from=300",
    ticks: 150,
    settings: { resolution: "hd" },
  },
  {
    name: "dovez-skyfight-hud-hd",
    url: "#/dovez?level=level1-1_skyfight&from=300",
    ticks: 150,
    settings: { hud: "original", resolution: "hd" },
  },
  {
    name: "dovez-atlantis-hd",
    url: "#/dovez?level=level5-1_atlantis&invincible=1&from=600",
    ticks: 150,
    settings: { resolution: "hd" },
  },
  {
    name: "dovez-cityboss-hd",
    url: "#/dovez?level=level4-3_cityboss&invincible=1&from=300",
    ticks: 200,
    settings: { resolution: "hd" },
  },
];

/** Tickzähler der Messstellen in `@clove/pixi-kit` (ohne Zurücksetzen je Bild). */
function probe(): void {
  (globalThis as Record<string, unknown>)["cloveProbe"] = { sim: 0, draw: 0, ticks: 0 };
}

/** Anzeigebilder im Takt `ms` (unter der Uhr von Playwright, die sonst alle 16 ms zeichnet). */
function frameEvery(ms: number): void {
  window.requestAnimationFrame = (cb) =>
    setTimeout(() => cb(performance.now()), ms) as unknown as number;
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}

const ticks = (page: Page) =>
  page.evaluate(
    () => ((globalThis as Record<string, unknown>)["cloveProbe"] as { ticks: number }).ticks,
  );

async function shoot(page: Page, shot: Shot): Promise<Buffer> {
  const ms = shot.url.startsWith("#/dovez") ? 16 : 14;
  await page.clock.install({ time: 0 });
  await page.addInitScript(frameEvery, ms);
  await page.clock.pauseAt(1000);
  await page.goto(`${ORIGIN}/${shot.url}&nosound=1`);
  // bis das Level tickt, in Bildschritten; Laden und Netz laufen in Echtzeit dazwischen
  for (let i = 0; (await ticks(page)) === 0; i++) {
    if (i > 2000) throw new Error(`${shot.name}: Level startet nicht`);
    await page.clock.runFor(ms);
    await page.waitForTimeout(5);
  }
  // ein Bild ist ein Tick: das Feuer beginnt immer nach dem ersten
  await page.keyboard.down("KeyS");
  while ((await ticks(page)) < shot.ticks) await page.clock.runFor(ms);
  const done = await ticks(page);
  if (done !== shot.ticks) throw new Error(`${shot.name}: ${done} statt ${shot.ticks} Ticks`);
  // Ausschnitt statt Element-Aufnahme: die wartet auf Animations-Bilder, und die Uhr steht
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error(`${shot.name}: kein Canvas`);
  // SwiftShader arbeitet die Bilder erst bei der Aufnahme ab, in HD je Bild ~¼ s
  return page.screenshot({ clip: box, timeout: 300_000 });
}

const server = Bun.spawn(["bunx", "vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: `${import.meta.dir}/..`,
  stdout: "ignore",
  stderr: "inherit",
});
try {
  for (let i = 0; ; i++) {
    if (i > 100) throw new Error("vite preview startet nicht");
    if (
      await fetch(ORIGIN).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await Bun.sleep(100);
  }
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const expected = (await Bun.file(FILE).exists())
    ? ((await Bun.file(FILE).json()) as Record<string, string>)
    : {};
  const hashes: Record<string, string> = { ...expected };
  const failures: string[] = [];
  for (const shot of SHOTS) {
    if (ONLY && !shot.name.includes(ONLY)) continue;
    const page = await browser.newPage({ viewport: shot.viewport ?? { width: 1280, height: 720 } });
    await page.addInitScript(probe);
    if (shot.settings)
      await page.addInitScript(
        (s) => localStorage.setItem("clove:settings", JSON.stringify(s)),
        shot.settings,
      );
    page.on("pageerror", (e) => failures.push(`${shot.name}: ${e.message}`));
    const png = await shoot(page, shot);
    await page.close();
    const hash = new Bun.CryptoHasher("sha256").update(png).digest("hex");
    hashes[shot.name] = hash;
    const same = expected[shot.name] === hash;
    console.log(`${shot.name.padEnd(20)} ${hash.slice(0, 16)} ${same ? "gleich" : "ANDERS"}`);
    if (!same && !WRITE) failures.push(`${shot.name}: Bild weicht von frames.json ab`);
    if (SAVE) await Bun.write(`${SAVE}/${shot.name}.png`, png);
  }
  await browser.close();
  if (WRITE) await Bun.write(FILE, `${JSON.stringify(hashes, null, 2)}\n`);
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else console.log(WRITE ? "frames.json geschrieben." : "Alle Bilder gleich.");
} finally {
  server.kill();
}
