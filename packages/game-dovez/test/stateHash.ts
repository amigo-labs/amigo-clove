import type { World } from "../src/sim/world";

/** Prüfsumme über Positionen von Kacheln, Gegnern, Schüssen und Spielern (FNV-1a). */
export function stateHash(w: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul((h ^ (Math.fround(v) * 1000)) | 0, 0x01000193) >>> 0;
  };
  const mix2 = (x: number, y: number) => {
    mix(x);
    mix(y);
  };
  for (const l of w.layers) for (const t of l.tiles) if (t.active) mix2(t.x, t.y);
  for (const e of w.enemies.items) {
    if (e?.alive) {
      mix2(e.actor.x, e.actor.y);
      mix(e.actor.hp);
    }
  }
  for (const s of w.fire.shots) if (s.active) mix2(s.actor.x, s.actor.y);
  for (const p of w.players) {
    mix2(p.x, p.y);
    mix(p.energy);
  }
  mix(w.score[0] ?? 0);
  mix(w.tick);
  return h >>> 0;
}
