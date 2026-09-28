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

/** Kopiert `v` rekursiv mit Prototyp; `shared` und Funktionen bleiben Referenzen. */
export function deepClone<T>(v: T, shared: WeakSet<object>, memo = new Map<object, unknown>()): T {
  if (typeof v !== "object" || v === null || shared.has(v)) return v;
  const known = memo.get(v);
  if (known !== undefined) return known as T;
  if (ArrayBuffer.isView(v)) {
    const copy = (v as unknown as Float32Array).slice();
    memo.set(v, copy);
    return copy as T;
  }
  if (Array.isArray(v)) {
    const copy: unknown[] = [];
    memo.set(v, copy);
    for (const x of v) copy.push(deepClone(x, shared, memo));
    return copy as T;
  }
  const copy = Object.create(Object.getPrototypeOf(v) as object) as Record<string, unknown>;
  memo.set(v, copy);
  for (const [k, x] of Object.entries(v)) copy[k] = deepClone(x, shared, memo);
  return copy as T;
}
