/**
 * Tiefe Kopien des Weltzustands für den Checkpoint (`SaveCheckPointSub`
 * `0x51DF40` schreibt fast die ganze Welt in eine Datei). Unveränderliche
 * Daten — Level-Skript, Surfaces, vorbereitete Animationen — werden nicht
 * kopiert, sondern geteilt; Aliase innerhalb des Zustands (etwa die
 * gemeinsamen Register eines Gegners und seiner Teile) bleiben erhalten.
 */

/** Alle Objekte, die von `roots` aus erreichbar sind (zum Teilen statt Kopieren). */
export function collectShared(roots: readonly unknown[]): WeakSet<object> {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [...roots];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v !== "object" || v === null || seen.has(v)) continue;
    seen.add(v);
    if (ArrayBuffer.isView(v)) continue;
    for (const x of Array.isArray(v) ? v : Object.values(v)) {
      if (typeof x === "object" && x !== null) stack.push(x);
    }
  }
  return seen;
}

/**
 * Kopiert `v` rekursiv mit Prototyp; `shared` und Funktionen bleiben Referenzen.
 * Primitive Werte werden ohne Aufruf übernommen und Schlüssel ohne
 * `Object.entries` gelesen: der Schnappschuss eines Checkpoints berührt über
 * zehntausend Objekte und lag sonst über einem Anzeigebild.
 */
export function deepClone<T>(v: T, shared: WeakSet<object>, memo = new Map<object, unknown>()): T {
  if (typeof v !== "object" || v === null) return v;
  return cloneObject(v, shared, memo) as T;
}

function cloneObject(v: object, shared: WeakSet<object>, memo: Map<object, unknown>): unknown {
  if (shared.has(v)) return v;
  const known = memo.get(v);
  if (known !== undefined) return known;
  if (ArrayBuffer.isView(v)) {
    const copy = (v as unknown as Float32Array).slice();
    memo.set(v, copy);
    return copy;
  }
  if (Array.isArray(v)) {
    const copy: unknown[] = [];
    memo.set(v, copy);
    for (let i = 0; i < v.length; i++) {
      const x: unknown = v[i];
      copy.push(typeof x === "object" && x !== null ? cloneObject(x, shared, memo) : x);
    }
    return copy;
  }
  const copy = Object.create(Object.getPrototypeOf(v) as object) as Record<string, unknown>;
  memo.set(v, copy);
  const src = v as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    const x = src[k];
    copy[k] = typeof x === "object" && x !== null ? cloneObject(x, shared, memo) : x;
  }
  return copy;
}
