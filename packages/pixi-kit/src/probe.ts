/**
 * Zeitmessung je Frame für `bun run perf:render` (und Tickzähler für
 * `bun run frames`): Das Messskript legt `globalThis.cloveProbe` an, bevor die
 * Seite lädt, und liest es nach jedem Anzeigebild aus. Ohne Messung ist jede
 * Messstelle ein Vergleich mit `undefined`.
 */
export interface FrameProbe {
  /** Simulation (Eingabe lesen und Ticks), ms seit dem letzten Auslesen. */
  sim: number;
  /** Szene aufbauen, bei DoveZ samt Zeichnen in den Backbuffer. */
  draw: number;
  ticks: number;
}

const probe = (globalThis as { cloveProbe?: FrameProbe }).cloveProbe;

/** Beginn einer Messstelle (0 ohne Messung). */
export function probeStart(): number {
  return probe ? performance.now() : 0;
}

/** Ende einer Messstelle: Zeit seit `start` (und Ticks) auf `kind` buchen. */
export function probeEnd(kind: "sim" | "draw", start: number, ticks = 0): void {
  if (!probe) return;
  probe[kind] += performance.now() - start;
  probe.ticks += ticks;
}
