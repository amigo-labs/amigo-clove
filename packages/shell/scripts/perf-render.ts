/**
 * Zeichenbudget im Browser: startet den gebauten Launcher per `vite preview` und
 * misst in Chromium (WebGL über SwiftShader) feste Szenen beider Spiele bei
 * Dauerfeuer. Je Szene: Zeit in den `requestAnimationFrame`-Callbacks (p50, p99,
 * max), davon Simulation und Szenenaufbau (`probeStart`/`probeEnd` in
 * `@clove/pixi-kit`), und je Frame geräteunabhängig: Draw-Calls, Wechsel des
 * Render-Ziels, Bildschirm-Renders (Clear auf dem Standard-Framebuffer),
 * GPU-Kopien, Textur- und Buffer-Uploads, Rücklesungen und JS-Allokationen.
 * SwiftShader rechnet auf der CPU: Zeiten nur relativ vergleichen, optimiert
 * wird auf die Zählwerte.
 * Aufruf: `bun run perf:render` (baut vorher), Optionen `--seconds=6`,
 * `--only=<Teil des Szenennamens>`, `--out=<datei.json>`, `--base=<datei.json>`
 * (Vergleich mit einer früheren Messung), `--resolution=xbr|hd` (Einstellung
 * „Auflösung“ statt Original).
 */
import { chromium, type Page } from "playwright-core";

const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const SECONDS = Number(arg("seconds") ?? 6);
const ONLY = arg("only");
/** Renderauflösung (Einstellung der Shell), Vorgabe Original. */
const RESOLUTION = arg("resolution");

/** Szenen mit Effekten, die viel zeichnen: Hintergründe, Wasser, Flucht, Bosse. */
const SCENES: readonly { name: string; url: string }[] = [
  { name: "dove-1", url: "#/dove?level=1&seed=1&invincible=1&from=2100" },
  { name: "dove-6", url: "#/dove?level=6&seed=1&invincible=1&from=600" },
  { name: "dove-11", url: "#/dove?level=11&seed=1&invincible=1&from=600" },
  { name: "dovez-skyfight", url: "#/dovez?level=level1-1_skyfight&invincible=1&from=300" },
  { name: "dovez-station", url: "#/dovez?level=level2-1_spacestation_i&invincible=1&from=600" },
  { name: "dovez-cityboss", url: "#/dovez?level=level4-3_cityboss&invincible=1&from=300" },
  { name: "dovez-atlantis", url: "#/dovez?level=level5-1_atlantis&invincible=1&from=600" },
  { name: "dovez-escape", url: "#/dovez?level=level7-5_escape&invincible=1&from=300" },
  { name: "dovez-bonus", url: "#/dovez?level=spacestation_bonus&invincible=1&from=300" },
];

/** Ein Anzeigebild: Callback-Zeit und Zählwerte bis zum nächsten Bild. */
interface Frame {
  t: number;
  cb: number;
  sim: number;
  draw: number;
  ticks: number;
  draws: number;
  targets: number;
  screens: number;
  copies: number;
  uploads: number;
  uploadKb: number;
  bufferKb: number;
  reads: number;
  heapKb: number;
}

interface Result {
  name: string;
  frames: number;
  cbP50: number;
  cbP99: number;
  cbMax: number;
  sim: number;
  draw: number;
  ticks: number;
  draws: number;
  targets: number;
  screens: number;
  copies: number;
  uploads: number;
  uploadKb: number;
  bufferKb: number;
  reads: number;
  allocKb: number;
  gcs: number;
  jank: number;
  longTasks: number;
}

/** Läuft vor jedem Skript der Seite: zählt WebGL-Aufrufe und Callback-Zeiten je Bild. */
function instrument(): void {
  const probe = { sim: 0, draw: 0, ticks: 0 };
  (globalThis as Record<string, unknown>)["cloveProbe"] = probe;
  const c = {
    draws: 0,
    targets: 0,
    screens: 0,
    copies: 0,
    uploads: 0,
    uploadKb: 0,
    bufferKb: 0,
    reads: 0,
    bound: null as unknown,
  };
  const m = {
    recording: false,
    frames: [] as Record<string, number>[],
    longTasks: 0,
    cur: undefined as Record<string, number> | undefined,
  };
  (globalThis as Record<string, unknown>)["cloveMeasure"] = m;
  const P = WebGL2RenderingContext.prototype as unknown as Record<string, unknown>;
  const wrap = (name: string, count: (a: unknown[]) => void) => {
    const orig = P[name] as (...a: unknown[]) => unknown;
    P[name] = function (this: unknown, ...a: unknown[]) {
      count(a);
      return orig.apply(this, a);
    };
  };
  // Hilfen als Objekt: die Funktion läuft serialisiert in der Seite, ohne äußeren Gültigkeitsbereich
  const u = {
    kb: (w: unknown, h: unknown) => (Number(w) * Number(h) * 4) / 1024,
    size: (s: unknown) => s as { width?: number; height?: number } | null,
    bytes: (d: unknown) =>
      typeof d === "number" ? d : ((d as ArrayBufferView | null)?.byteLength ?? 0),
    heap: () =>
      ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
        0) / 1024,
  };
  for (const n of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"])
    wrap(n, () => c.draws++);
  wrap("bindFramebuffer", (a) => {
    if (a[0] === 0x8ca8) return; // READ_FRAMEBUFFER
    if (a[1] !== c.bound) c.targets++;
    c.bound = a[1];
  });
  wrap("clear", () => {
    if (c.bound === null) c.screens++;
  });
  wrap("texImage2D", (a) => {
    c.uploads++;
    const s = u.size(a[5]);
    c.uploadKb += a.length >= 9 ? u.kb(a[3], a[4]) : u.kb(s?.width ?? 0, s?.height ?? 0);
  });
  wrap("texSubImage2D", (a) => {
    c.uploads++;
    const s = u.size(a[6]);
    c.uploadKb += a.length >= 9 ? u.kb(a[4], a[5]) : u.kb(s?.width ?? 0, s?.height ?? 0);
  });
  wrap("bufferData", (a) => (c.bufferKb += u.bytes(a[1]) / 1024));
  wrap("bufferSubData", (a) => (c.bufferKb += u.bytes(a[2]) / 1024));
  wrap("readPixels", () => c.reads++);
  wrap("copyTexSubImage2D", () => c.copies++);
  wrap("blitFramebuffer", () => c.copies++);

  /** Werte des vorigen Bilds abschließen: Zählwerte seit seinem Beginn, Probe auslesen. */
  const close = (f: Record<string, number>) => {
    for (const k of [
      "draws",
      "targets",
      "screens",
      "copies",
      "uploads",
      "uploadKb",
      "bufferKb",
      "reads",
    ])
      f[k] = (c as unknown as Record<string, number>)[k]! - f[k]!;
    f["heapKb"] = u.heap() - f["heapKb"]!;
    f["sim"] = probe.sim;
    f["draw"] = probe.draw;
    f["ticks"] = probe.ticks;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      let f = m.cur;
      if (!f || f["t"] !== t) {
        if (f) close(f);
        probe.sim = probe.draw = probe.ticks = 0;
        f = { t, cb: 0, heapKb: u.heap() };
        for (const k of [
          "draws",
          "targets",
          "screens",
          "copies",
          "uploads",
          "uploadKb",
          "bufferKb",
          "reads",
        ])
          f[k] = (c as unknown as Record<string, number>)[k]!;
        m.cur = f;
        if (m.recording) m.frames.push(f);
      }
      const start = performance.now();
      cb(t);
      f["cb"]! += performance.now() - start;
    });
  new PerformanceObserver((list) => {
    if (m.recording) m.longTasks += list.getEntries().length;
  }).observe({ type: "longtask", buffered: false });
}

const quantile = (sorted: readonly number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
const mean = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);

async function measure(page: Page, scene: { name: string; url: string }): Promise<Result> {
  await page.goto(`${ORIGIN}/${scene.url}&nosound=1`);
  await page.waitForSelector("body[data-game]", { timeout: 60_000 });
  // das Level läuft, sobald die Simulation tickt
  await page.waitForFunction(
    () => ((globalThis as Record<string, unknown>)["cloveProbe"] as { ticks: number }).ticks > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    ((globalThis as Record<string, unknown>)["cloveMeasure"] as { recording: boolean }).recording =
      true;
  });
  await page.waitForTimeout(SECONDS * 1000);
  const { frames, longTasks } = await page.evaluate(() => {
    const m = (globalThis as Record<string, unknown>)["cloveMeasure"] as {
      recording: boolean;
      frames: unknown[];
      longTasks: number;
    };
    m.recording = false;
    // das letzte Bild ist noch offen
    return { frames: m.frames.slice(0, -1), longTasks: m.longTasks };
  });
  await page.keyboard.up("KeyS");
  const fs = frames as Frame[];
  const cb = fs.map((f) => f.cb).toSorted((a, b) => a - b);
  const intervals = fs.slice(1).map((f, i) => f.t - fs[i]!.t);
  const field = (k: keyof Frame) => mean(fs.map((f) => f[k]));
  return {
    name: scene.name,
    frames: fs.length,
    cbP50: quantile(cb, 0.5),
    cbP99: quantile(cb, 0.99),
    cbMax: cb[cb.length - 1] ?? 0,
    sim: field("sim"),
    draw: field("draw"),
    ticks: field("ticks"),
    draws: field("draws"),
    targets: field("targets"),
    screens: field("screens"),
    copies: field("copies"),
    uploads: field("uploads"),
    uploadKb: field("uploadKb"),
    bufferKb: field("bufferKb"),
    reads: field("reads"),
    allocKb: mean(fs.map((f) => Math.max(0, f.heapKb))),
    gcs: fs.filter((f) => f.heapKb < 0).length,
    jank: intervals.filter((d) => d > 20).length / Math.max(1, intervals.length),
    longTasks,
  };
}

const COLUMNS: readonly [keyof Result, string, number][] = [
  ["frames", "Bilder", 0],
  ["cbP50", "cb p50", 2],
  ["cbP99", "cb p99", 2],
  ["cbMax", "cb max", 1],
  ["sim", "Sim", 2],
  ["draw", "Szene", 2],
  ["ticks", "Ticks", 2],
  ["draws", "Draws", 1],
  ["targets", "Ziele", 1],
  ["screens", "Screen", 2],
  ["copies", "Kopien", 2],
  ["uploads", "Uploads", 2],
  ["uploadKb", "Upl KB", 1],
  ["bufferKb", "Buf KB", 1],
  ["reads", "Reads", 2],
  ["allocKb", "Alloc KB", 1],
  ["gcs", "GCs", 0],
  ["jank", "Jank", 3],
  ["longTasks", "Long", 0],
];

function print(results: readonly Result[], base: readonly Result[] | undefined): void {
  console.log(
    "Szene".padEnd(16),
    ...COLUMNS.map(([, h]) => h.padStart(9)),
    "\n(ms bzw. Anzahl je Bild; cb = Zeit in den Bild-Callbacks, Jank = Anteil Abstände > 20 ms)",
  );
  for (const r of results) {
    const b = base?.find((x) => x.name === r.name);
    console.log(
      r.name.padEnd(16),
      ...COLUMNS.map(([k, , d]) => (r[k] as number).toFixed(d).padStart(9)),
    );
    if (b)
      console.log(
        "  vorher".padEnd(16),
        // ältere Messungen kennen nicht jede Spalte
        ...COLUMNS.map(([k, , d]) => ((b[k] as number | undefined)?.toFixed(d) ?? "–").padStart(9)),
      );
  }
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
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
    ],
  });
  const results: Result[] = [];
  for (const scene of SCENES) {
    if (ONLY && !scene.name.includes(ONLY)) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(instrument);
    if (RESOLUTION)
      await page.addInitScript(
        (resolution) => localStorage.setItem("clove:settings", JSON.stringify({ resolution })),
        RESOLUTION,
      );
    page.on("pageerror", (e) => console.error(`${scene.name}: ${e.message}`));
    results.push(await measure(page, scene));
    await page.close();
  }
  await browser.close();
  const out = arg("out");
  if (out) await Bun.write(out, JSON.stringify(results, null, 2));
  const baseFile = arg("base");
  const base = baseFile ? ((await Bun.file(baseFile).json()) as Result[]) : undefined;
  print(results, base);
} finally {
  server.kill();
}
