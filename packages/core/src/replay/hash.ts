/**
 * xxHash32 über den Weltzustand. Typed Arrays werden in Plattform-Bytefolge
 * gelesen; alle Zielplattformen (x86, ARM) sind little endian.
 */
const P1 = 0x9e3779b1;
const P2 = 0x85ebca77;
const P3 = 0xc2b2ae3d;
const P4 = 0x27d4eb2f;
const P5 = 0x165667b1;

const rotl = (x: number, r: number) => (x << r) | (x >>> (32 - r));

function round(acc: number, input: number): number {
  return Math.imul(rotl((acc + Math.imul(input, P2)) | 0, 13), P1);
}

export function xxhash32(bytes: Uint8Array, seed = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.byteLength;
  let p = 0;
  let h: number;
  if (len >= 16) {
    let v1 = (seed + P1 + P2) | 0;
    let v2 = (seed + P2) | 0;
    let v3 = seed | 0;
    let v4 = (seed - P1) | 0;
    for (; p + 16 <= len; p += 16) {
      v1 = round(v1, view.getInt32(p, true));
      v2 = round(v2, view.getInt32(p + 4, true));
      v3 = round(v3, view.getInt32(p + 8, true));
      v4 = round(v4, view.getInt32(p + 12, true));
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) | 0;
  } else {
    h = (seed + P5) | 0;
  }
  h = (h + len) | 0;
  for (; p + 4 <= len; p += 4) {
    h = Math.imul(rotl((h + Math.imul(view.getInt32(p, true), P3)) | 0, 17), P4);
  }
  for (; p < len; p++) {
    h = Math.imul(rotl((h + Math.imul(bytes[p] as number, P5)) | 0, 11), P1);
  }
  h = Math.imul(h ^ (h >>> 15), P2);
  h = Math.imul(h ^ (h >>> 13), P3);
  return (h ^ (h >>> 16)) >>> 0;
}

type Hashable = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;

/** Hash über mehrere Arrays; die Längen fließen mit ein, damit Grenzen nicht verschwimmen. */
export function hashArrays(arrays: readonly Hashable[], seed = 0): number {
  let h = seed >>> 0;
  for (const a of arrays) {
    h = xxhash32(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), (h ^ a.length) >>> 0);
  }
  return h;
}
