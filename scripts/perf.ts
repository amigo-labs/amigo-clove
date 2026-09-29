/**
 * Simulationsbudget DoveZ: je Level 3000 Ticks kopflos (unverwundbar, Dauerfeuer)
 * und die Zeit je Tick. Der Takt des Originals ist 16 ms; Ziel ist, dass die
 * Simulation nur einen kleinen Teil davon braucht (der Rest gehört dem Zeichnen).
 * Aufruf: `bun run perf` (Tabelle) — die Grenzen prüft `game-dovez/test/perf.test.ts`.
 */
import { NO_INPUT } from "../packages/game-dovez/src/sim/player";
import { World } from "../packages/game-dovez/src/sim/world";
import { LEVEL_SLUGS, loadTestLevel } from "../packages/game-dovez/test/assets";

const TICKS = Number(process.argv[2] ?? 3000);
const rows: { slug: string; mean: number; p99: number; max: number }[] = [];

for (const slug of LEVEL_SLUGS) {
  const { level, sprites } = await loadTestLevel(slug);
  const w = new World(level, sprites);
  const ms: number[] = [];
  for (let t = 0; t < TICKS && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = 2;
    const start = performance.now();
    w.step([{ ...NO_INPUT, fire: true }]);
    ms.push(performance.now() - start);
    w.events.length = 0;
  }
  const sorted = ms.toSorted((a, b) => a - b);
  rows.push({
    slug,
    mean: ms.reduce((s, v) => s + v, 0) / ms.length,
    p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  });
}

console.log(
  "Level".padEnd(34),
  "mittel".padStart(8),
  "p99".padStart(8),
  "max".padStart(8),
  "(ms je Tick)",
);
for (const r of rows)
  console.log(
    r.slug.padEnd(34),
    r.mean.toFixed(3).padStart(8),
    r.p99.toFixed(3).padStart(8),
    r.max.toFixed(3).padStart(8),
  );
const worst = rows.toSorted((a, b) => b.mean - a.mean)[0];
if (worst) console.log(`\nam meisten: ${worst.slug} mit ${worst.mean.toFixed(3)} ms (Takt 16 ms)`);
