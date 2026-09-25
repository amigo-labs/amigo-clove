/**
 * Die Endbilder `Grafik/B1–B5.spr` (640×450) liegen kachelweise verwürfelt vor.
 * `Data/1–5.dat` enthält je 2880 `Int32` (LE), eine Permutation von 0…2879:
 * Zielkachel `i` ← Quellkachel `p[i]`, Kacheln 10×10 px, 64 pro Zeile
 * (`ShowOutro` `0x4A0D00`, `docs/measurements/dove-flow.md`).
 */
export const SCRAMBLE_TILE = 10;
export const SCRAMBLE_COLS = 64;
export const SCRAMBLE_ROWS = 45;

export class ScrambleError extends Error {
  override name = "ScrambleError";
}

export function parsePermutation(bytes: Uint8Array): Int32Array {
  const n = SCRAMBLE_COLS * SCRAMBLE_ROWS;
  if (bytes.byteLength !== n * 4) {
    throw new ScrambleError(`erwartet ${n * 4} Byte, erhalten ${bytes.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const perm = new Int32Array(n);
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = view.getInt32(i * 4, true);
    if (p < 0 || p >= n || seen[p]) throw new ScrambleError(`keine Permutation (Index ${i}: ${p})`);
    seen[p] = 1;
    perm[i] = p;
  }
  return perm;
}

/** Setzt ein RGBA-Bild (640×450) aus den verwürfelten Kacheln zusammen. */
export function descrambleTiles(
  rgba: Uint8Array,
  width: number,
  height: number,
  perm: Int32Array,
): Uint8Array {
  const T = SCRAMBLE_TILE;
  if (width !== SCRAMBLE_COLS * T || height !== SCRAMBLE_ROWS * T) {
    throw new ScrambleError(`Bildgröße ${width}×${height}, erwartet 640×450`);
  }
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < perm.length; i++) {
    const p = perm[i] as number;
    const sx = (p % SCRAMBLE_COLS) * T;
    const sy = Math.floor(p / SCRAMBLE_COLS) * T;
    const dx = (i % SCRAMBLE_COLS) * T;
    const dy = Math.floor(i / SCRAMBLE_COLS) * T;
    for (let y = 0; y < T; y++) {
      const s = ((sy + y) * width + sx) * 4;
      out.set(rgba.subarray(s, s + T * 4), ((dy + y) * width + dx) * 4);
    }
  }
  return out;
}
