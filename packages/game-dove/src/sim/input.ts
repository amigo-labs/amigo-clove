import { SCREEN_W } from "./constants";

/** Eingabe eines Ticks als Bitmaske. */
export const Input = {
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
  Fire: 16,
  Faster: 32,
  Slower: 64,
  /** `A`: Beam laden. */
  Beam: 128,
  /** `D`: Waffenausrichtung vorn/hinten umkehren. */
  Swap: 256,
  /**
   * Erweiterung (Maus/Touch): Bits 10–19 und 20–28 tragen ein Ziel für den
   * Bezugspunkt des Schiffs; es ersetzt die Richtungstasten. Ohne dieses Bit
   * läuft alles wie im Original.
   */
  Target: 512,
} as const;

/** Tastenbits (ohne Ziel); nur sie zählen für Kanten und den Weltzustand. */
export const BUTTONS = 0x1ff;

/** Eingabe mit Zeigerziel; Koordinaten werden auf den Bildschirm begrenzt. */
export function withTarget(buttons: number, x: number, y: number): number {
  const tx = Math.max(0, Math.min(SCREEN_W - 1, Math.round(x)));
  const ty = Math.max(0, Math.min(479, Math.round(y)));
  return (buttons & BUTTONS) | Input.Target | (tx << 10) | (ty << 20);
}

/** Ziel einer Eingabe oder `undefined`. */
export function targetOf(input: number): { x: number; y: number } | undefined {
  if (!(input & Input.Target)) return undefined;
  return { x: (input >>> 10) & 0x3ff, y: (input >>> 20) & 0x1ff };
}
