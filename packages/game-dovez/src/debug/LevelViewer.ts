import type { GameHost, GameInstance } from "@clove/core";
import { parseDovezLevelDat, type DovezLevel } from "@clove/formats";
import { OP_NAMES, formatRouteOp } from "../sim/route";
import {
  DEBUG_EMITTER,
  DEBUG_PLAYER,
  PLAYER_H,
  PLAYER_W,
  PLAYFIELD_H,
  PLAYFIELD_W,
  simulateRoute,
  simulateWeaponView,
  type RouteView,
  type WeaponView,
} from "./levelModel";

/**
 * Debug-Seite `#/dovez/debug/level` (M7): simuliert die Routen und
 * Gegnerwaffen eines Level-Skripts und zeichnet Pfade und Schussmuster.
 * Canvas 2D; der Spieler steht fest, Landschaft und Treffer gibt es nicht.
 *
 * Bedienung: ←/→ Level, ↑/↓ Route bzw. Waffe (Bild ↑/↓: zehn weiter),
 * M Routen ↔ Waffen, D Befehlsliste an/aus, Esc zurück zum Launcher.
 */

const WIDTH = 800;
const HEIGHT = 600;
const TOP = HEIGHT - PLAYFIELD_H;
const MARK_EVERY = 25;
/** Ab dieser Strecke je Tick gilt ein Schritt als Sprung. */
const JUMP = 40;

type Mode = "routes" | "weapons";

interface Loaded {
  readonly id: string;
  readonly level: DovezLevel;
}

export async function bootLevelViewer(host: GameHost): Promise<GameInstance> {
  const canvas = host.canvas;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.maxWidth = "100%";
  canvas.style.maxHeight = "100%";
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D nicht verfügbar");

  const ids = host.assets.manifest.entries
    .filter((e) => e.kind === "binary" && e.id.startsWith("leveldat/"))
    .map((e) => e.id)
    .toSorted();
  if (ids.length === 0) throw new Error("Manifest enthält keine Level-Skripte");
  const cache = new Map<string, Promise<Loaded>>();
  const load = (id: string) => {
    let p = cache.get(id);
    if (!p) {
      p = host.assets.bytes(id).then((b) => ({ id, level: parseDovezLevelDat(b) }));
      cache.set(id, p);
    }
    return p;
  };

  let levelIndex = 0;
  let mode: Mode = "routes";
  let item = 0;
  let listing = true;
  let current: Loaded | undefined;
  let view: RouteView | WeaponView | undefined;
  let start = performance.now();
  let disposed = false;

  const count = () =>
    current ? (mode === "routes" ? current.level.routes : current.level.weapons).length : 0;

  const simulate = () => {
    view = undefined;
    if (!current || count() === 0) return;
    item = Math.min(item, count() - 1);
    view =
      mode === "routes"
        ? simulateRoute(current.level, item)
        : simulateWeaponView(current.level, item);
    start = performance.now();
  };

  const text = (s: string, x: number, y: number, color = "#ccc") => {
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };

  const drawPath = (
    path: readonly [number, number][],
    ox: number,
    oy: number,
    hue: (t: number) => number,
  ) => {
    for (let t = 1; t < path.length; t++) {
      const [x0, y0] = path[t - 1]!;
      const [x1, y1] = path[t]!;
      ctx.strokeStyle = `hsl(${hue(t)} 90% 60%)`;
      // Sprünge (SetPos) gestrichelt, damit sie nicht wie Bewegung aussehen
      ctx.setLineDash(Math.hypot(x1 - x0, y1 - y0) > JUMP ? [3, 4] : []);
      ctx.beginPath();
      ctx.moveTo(ox + x0, oy + y0);
      ctx.lineTo(ox + x1, oy + y1);
      ctx.stroke();
      if (t % MARK_EVERY === 0) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(ox + x1 - 1, oy + y1 - 1, 3, 3);
      }
    }
    ctx.setLineDash([]);
  };

  const drawRoute = (v: RouteView, frame: number) => {
    const ox = v.offset.x;
    const oy = TOP + v.offset.y;
    if (v.offset.x || v.offset.y) {
      ctx.strokeStyle = "#666";
      ctx.strokeRect(ox - 4.5, oy - 4.5, 9, 9);
    }
    const n = Math.max(1, v.path.length - 1);
    // Mitte des Objekts zeichnen, nicht seine linke obere Ecke
    drawPath(v.path, ox + v.width / 2, oy + v.height / 2, (t) => 200 - (160 * t) / n);
    const [sx, sy] = v.path[0]!;
    ctx.fillStyle = "#3f6";
    ctx.fillRect(ox + sx + v.width / 2 - 3, oy + sy + v.height / 2 - 3, 7, 7);
    const t = frame % v.path.length;
    const [x, y] = v.path[t]!;
    ctx.strokeStyle = "#fc6";
    ctx.strokeRect(ox + x + 0.5, oy + y + 0.5, v.width, v.height);
    if (v.dead) {
      const [ex, ey] = v.path.at(-1)!;
      ctx.strokeStyle = "#f44";
      ctx.beginPath();
      const cx = ox + ex + v.width / 2;
      const cy = oy + ey + v.height / 2;
      ctx.moveTo(cx - 6, cy - 6);
      ctx.lineTo(cx + 6, cy + 6);
      ctx.moveTo(cx + 6, cy - 6);
      ctx.lineTo(cx - 6, cy + 6);
      ctx.stroke();
    }
    text(
      `Tick ${t}/${v.path.length - 1}${v.dead ? " · Route endet" : " · läuft weiter"}`,
      8,
      TOP + 6,
    );
    const fx = v.effects.filter((e) => e.tick - (v.effects[0]?.tick ?? 0) <= t);
    if (fx.length) {
      const names = [...new Set(fx.map((e) => OP_NAMES[e.op] ?? String(e.op)))];
      text(`Effekte: ${names.join(", ")}`, 8, TOP + 20, "#9cf");
    }
  };

  const drawWeapon = (v: WeaponView, frame: number) => {
    ctx.strokeStyle = "#3f6";
    ctx.strokeRect(DEBUG_PLAYER.x + 0.5, TOP + DEBUG_PLAYER.y + 0.5, PLAYER_W, PLAYER_H);
    ctx.fillStyle = "#fc6";
    ctx.fillRect(DEBUG_EMITTER.x - 4, TOP + DEBUG_EMITTER.y - 4, 9, 9);
    const salvos = Math.max(1, new Set(v.shots.map((s) => s.salvo)).size);
    const last = Math.max(1, ...v.shots.map((s) => s.tick + s.path.length));
    const t = frame % last;
    for (const s of v.shots) {
      const hue = (360 * s.salvo) / salvos + (s.weapon === v.index ? 0 : 40);
      drawPath(s.path, s.width / 2, TOP + s.height / 2, () => hue);
      const k = t - s.tick;
      if (k >= 0 && k < s.path.length) {
        const [x, y] = s.path[k]!;
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(x + 0.5, TOP + y + 0.5, s.width, s.height);
      }
    }
    text(`Tick ${t} · ${v.shots.length} Schüsse`, 8, TOP + 6);
    if (v.carriers.length) {
      text(`Getragen von: ${v.carriers.slice(0, 4).join(", ")}`, 8, TOP + 20, "#9cf");
    }
  };

  const drawListing = () => {
    if (!current || !view) return;
    const lines: string[] = [];
    if (mode === "routes") {
      const r = current.level.routes[view.index]!;
      r.ops.forEach((op, i) => lines.push(`${String(i).padStart(3)} ${formatRouteOp(op)}`));
    } else {
      const w = current.level.weapons[view.index]!;
      w.salvos.forEach((s, j) => {
        const shot = current!.level.shots[s.shotType];
        lines.push(`#${j} ${shot?.name ?? s.shotType}: ${s.repeat + 1}× alle ${s.interval}`);
        lines.push(`   ab ${s.startDelay}, Tempo ${s.speed}, Schaden ${s.damage}`);
        lines.push(
          `   ${s.aimed ? "gezielt" : s.route >= 0 ? `Route ${current!.level.routes[s.route]?.name}` : "steht"}` +
            ` · Versatz ${s.offsetX}, ${s.offsetY}`,
        );
        if (s.onRouteEnd === 1) {
          lines.push(`   am Ende → ${current!.level.weapons[s.spawnWeapon]?.name}`);
        }
      });
    }
    const x = WIDTH - 300;
    const shown = lines.slice(0, Math.floor((PLAYFIELD_H - 12) / 13));
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x - 6, TOP + 2, 304, shown.length * 13 + 8);
    shown.forEach((l, i) =>
      text(l.length > 44 ? `${l.slice(0, 43)}…` : l, x, TOP + 6 + i * 13, "#ddd"),
    );
    if (lines.length > shown.length) {
      text(`… ${lines.length - shown.length} weitere`, x, TOP + 6 + shown.length * 13, "#888");
    }
  };

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = "12px monospace";
    ctx.textBaseline = "top";
    ctx.lineWidth = 1;
    const id = ids[levelIndex]!;
    const head = `${levelIndex + 1}/${ids.length}  ${id}`;
    text(head, 8, 6, "#fc6");
    const titleX = 8 + ctx.measureText(head).width + 16;
    if (!current || current.id !== id) {
      text("lädt …", 8, 24, "#999");
      return;
    }
    const n = count();
    const kind = mode === "routes" ? "Route" : "Waffe";
    if (!view) {
      text(`keine ${mode === "routes" ? "Routen" : "Waffen"} · M wechselt`, 8, 24, "#999");
      return;
    }
    const detail =
      "uses" in view
        ? `${view.uses.map((u) => u.label).join(", ") || "unbenutzt"} · ${view.context}`
        : `${view.shots.length} Schüsse`;
    text(`${kind} ${item + 1}/${n}: ${view.name}`, titleX, 6, "#fff");
    text(detail.length > 128 ? `${detail.slice(0, 127)}…` : detail, 8, 22, "#999");
    text("←/→ Level  ↑/↓ Eintrag  M Routen/Waffen  D Liste  Esc", 8, 36, "#666");
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, WIDTH, PLAYFIELD_H);
    ctx.clip();
    ctx.fillStyle = "#0b0f18";
    ctx.fillRect(0, TOP, PLAYFIELD_W, PLAYFIELD_H);
    const frame = Math.floor((performance.now() - start) / 14);
    if ("uses" in view) drawRoute(view, frame);
    else drawWeapon(view, frame);
    if (listing) drawListing();
    ctx.restore();
  };

  const select = async (next: number) => {
    levelIndex = (next + ids.length) % ids.length;
    item = 0;
    view = undefined;
    draw();
    const loaded = await load(ids[levelIndex]!);
    if (disposed || loaded.id !== ids[levelIndex]) return;
    current = loaded;
    simulate();
    draw();
  };

  const move = (d: number) => {
    const n = count();
    if (n === 0) return;
    item = (item + d + n) % n;
    simulate();
  };

  const watched = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "KeyM",
    "KeyD",
    "Escape",
  ];
  let held = new Set<string>();
  let frameId = 0;
  const poll = () => {
    if (disposed) return;
    const now = new Set(watched.filter((k) => host.keys.isDown(k)));
    const hit = (k: string) => now.has(k) && !held.has(k);
    if (hit("ArrowRight")) void select(levelIndex + 1);
    if (hit("ArrowLeft")) void select(levelIndex - 1);
    if (hit("ArrowDown")) move(1);
    if (hit("ArrowUp")) move(-1);
    if (hit("PageDown")) move(10);
    if (hit("PageUp")) move(-10);
    if (hit("KeyM")) {
      mode = mode === "routes" ? "weapons" : "routes";
      item = 0;
      simulate();
    }
    if (hit("KeyD")) listing = !listing;
    held = now;
    if (hit("Escape")) {
      host.exit();
      return;
    }
    draw();
    frameId = requestAnimationFrame(poll);
  };
  frameId = requestAnimationFrame(poll);

  await select(0);
  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      cache.clear();
    },
  };
}
