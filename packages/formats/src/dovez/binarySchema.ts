import { decodeCp1252, encodeCp1252 } from "../text/cp1252";

/**
 * Kleiner Binär-Codec für VB6-`Get #`/`Put #`-Dateien: Ein Schema beschreibt
 * die Felder in Dateireihenfolge, Parser und Serializer laufen über dasselbe
 * Schema. Damit kann der Round-Trip nur brechen, wenn das Schema falsch ist —
 * nie, weil Lesen und Schreiben auseinanderlaufen.
 *
 * VB6 schreibt Zählfelder als obere Grenze (`ReDim a(0 To n)`), also als
 * Anzahl − 1, und manchmal an anderer Stelle als die Elemente selbst. `count`
 * liest die Grenze, `list` später die Elemente derselben Liste.
 */

export class SchemaError extends Error {
  override name = "SchemaError";
}

/** Skalartypen: VB `Integer` (i16), `Long` (i32), `Single` (f32), String mit Länge, String fester Länge. */
export type Scalar = "i16" | "i32" | "f32" | "str" | `fixed${number}`;

export type Field =
  | { readonly name: string; readonly type: Scalar }
  /** Obergrenze (Anzahl − 1) der Liste `list`, deren Elemente an ihrer eigenen Position folgen. */
  | { readonly count: string }
  | { readonly list: string; readonly of: Schema }
  /** Liste fester Länge ohne Zählfeld. */
  | { readonly name: string; readonly repeat: number; readonly of: Schema };

export type Schema = readonly Field[];

export type Value = number | string | Row[];
export type Row = { [name: string]: Value };

class Reader {
  private offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get position(): number {
    return this.offset;
  }
  private need(n: number, what: string): void {
    if (this.offset + n > this.bytes.length) {
      throw new SchemaError(`${what} bei ${this.offset}: Datei endet (${this.bytes.length} Byte)`);
    }
  }
  i16(): number {
    this.need(2, "i16");
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }
  i32(): number {
    this.need(4, "i32");
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  f32(): number {
    this.need(4, "f32");
    const v = this.view.getFloat32(this.offset, true);
    if (Number.isNaN(v))
      throw new SchemaError(`NaN bei ${this.offset} ist nicht verlustfrei lesbar`);
    this.offset += 4;
    return v;
  }
  fixed(n: number): string {
    this.need(n, "String");
    const v = decodeCp1252(this.bytes.subarray(this.offset, this.offset + n));
    this.offset += n;
    return v;
  }
  str(): string {
    const at = this.offset;
    const n = this.i32();
    if (n < 0 || n > 0xffff) throw new SchemaError(`Stringlänge ${n} bei ${at}`);
    return this.fixed(n);
  }
}

class Writer {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  private offset = 0;
  private grow(n: number): void {
    if (this.offset + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.offset + n));
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  i16(v: number): void {
    this.grow(2);
    this.view.setInt16(this.offset, v, true);
    this.offset += 2;
  }
  i32(v: number): void {
    this.grow(4);
    this.view.setInt32(this.offset, v, true);
    this.offset += 4;
  }
  f32(v: number): void {
    this.grow(4);
    this.view.setFloat32(this.offset, v, true);
    this.offset += 4;
  }
  bytes(b: Uint8Array): void {
    this.grow(b.length);
    this.buf.set(b, this.offset);
    this.offset += b.length;
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.offset);
  }
}

function fixedLength(type: Scalar): number | null {
  return type.startsWith("fixed") ? Number(type.slice(5)) : null;
}

function readScalar(r: Reader, type: Scalar): number | string {
  switch (type) {
    case "i16":
      return r.i16();
    case "i32":
      return r.i32();
    case "f32":
      return r.f32();
    case "str":
      return r.str();
    default:
      return r.fixed(fixedLength(type)!);
  }
}

function readRow(r: Reader, schema: Schema): Row {
  const row: Row = {};
  const counts = new Map<string, number>();
  for (const f of schema) {
    if ("count" in f) {
      const at = r.position;
      const upper = r.i32();
      if (upper < -1 || upper > 100_000)
        throw new SchemaError(`Zähler ${f.count} = ${upper} bei ${at}`);
      counts.set(f.count, upper + 1);
    } else if ("list" in f) {
      const n = counts.get(f.list);
      if (n === undefined) throw new SchemaError(`Liste ${f.list} ohne vorheriges Zählfeld`);
      row[f.list] = Array.from({ length: n }, () => readRow(r, f.of));
    } else if ("repeat" in f) {
      row[f.name] = Array.from({ length: f.repeat }, () => readRow(r, f.of));
    } else {
      row[f.name] = readScalar(r, f.type);
    }
  }
  return row;
}

function writeRow(w: Writer, schema: Schema, row: Row): void {
  for (const f of schema) {
    if ("count" in f) {
      w.i32(rows(row, f.count).length - 1);
    } else if ("list" in f) {
      for (const item of rows(row, f.list)) writeRow(w, f.of, item);
    } else if ("repeat" in f) {
      const items = rows(row, f.name);
      if (items.length !== f.repeat) {
        throw new SchemaError(`${f.name}: ${items.length} statt ${f.repeat} Einträge`);
      }
      for (const item of items) writeRow(w, f.of, item);
    } else {
      const v = row[f.name];
      const n = fixedLength(f.type);
      if (f.type === "str" || n !== null) {
        if (typeof v !== "string") throw new SchemaError(`${f.name}: String erwartet`);
        const b = encodeCp1252(v);
        if (n === null) w.i32(b.length);
        else if (b.length !== n) throw new SchemaError(`${f.name}: ${b.length} statt ${n} Zeichen`);
        w.bytes(b);
      } else {
        if (typeof v !== "number") throw new SchemaError(`${f.name}: Zahl erwartet`);
        if (f.type === "i16") w.i16(v);
        else if (f.type === "i32") w.i32(v);
        else w.f32(v);
      }
    }
  }
}

function rows(row: Row, name: string): Row[] {
  const v = row[name];
  if (!Array.isArray(v)) throw new SchemaError(`${name}: Liste erwartet`);
  return v;
}

/** Liest `bytes` restlos nach `schema`; übrige Bytes sind ein Fehler. */
export function readSchema(bytes: Uint8Array, schema: Schema): Row {
  const r = new Reader(bytes);
  const row = readRow(r, schema);
  if (r.position !== bytes.length) {
    throw new SchemaError(`${bytes.length - r.position} Byte nach dem Ende des Schemas`);
  }
  return row;
}

export function writeSchema(row: Row, schema: Schema): Uint8Array {
  const w = new Writer();
  writeRow(w, schema, row);
  return w.result();
}

export interface SchemaCoverage {
  /** Bytes in Feldern mit Namen. */
  readonly named: number;
  /** Bytes in Feldern, deren Name mit `unknown` beginnt (Lage bekannt, Bedeutung offen). */
  readonly unknown: number;
  /** Bytes in Zählfeldern und Stringlängen (Struktur). */
  readonly structure: number;
}

/**
 * Zählt, wie viele Bytes einer geparsten Datei auf benannte Felder entfallen.
 * Das ist die Metrik aus der Spec (`opaque`): hier gibt es keine ungeparsten
 * Restblobs mehr, „opak“ sind Felder, deren Bedeutung offen ist.
 */
export function schemaCoverage(row: Row, schema: Schema): SchemaCoverage {
  let named = 0;
  let unknown = 0;
  let structure = 0;
  const walk = (r: Row, s: Schema): void => {
    for (const f of s) {
      if ("count" in f) {
        structure += 4;
      } else if ("list" in f) {
        for (const item of rows(r, f.list)) walk(item, f.of);
      } else if ("repeat" in f) {
        for (const item of rows(r, f.name)) walk(item, f.of);
      } else {
        const v = r[f.name];
        let size: number;
        if (f.type === "str") {
          structure += 4;
          size = encodeCp1252(v as string).length;
        } else {
          size = fixedLength(f.type) ?? (f.type === "i16" ? 2 : 4);
        }
        if (f.name.startsWith("unknown")) unknown += size;
        else named += size;
      }
    }
  };
  walk(row, schema);
  return { named, unknown, structure };
}
