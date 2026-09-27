import { decodeCp1252 } from "../text/cp1252";

/**
 * DoveZ-Paketformat (`.dlp`, `.dfp`, `.d2p` — alle identisch): kein Magic, kein
 * Verzeichnis, nur eine Kette von zlib-Blöcken bis zum Dateiende.
 *
 * ```
 * Record := u32 uncompressedSize, u32 compressedSize, byte[compressedSize] zlib (RFC 1950)
 * Datei  := ( Record(Dateiname, CP1252) Record(Dateiinhalt) )*
 * ```
 *
 * Die Dekompression wird hereingereicht: `node:zlib` in der Pipeline,
 * `DecompressionStream("deflate")` im Browser (`inflateWeb`).
 */

export class ContainerError extends Error {
  override name = "ContainerError";
}

export interface ContainerRecord {
  /** Größe nach dem Entpacken laut Header. */
  readonly size: number;
  /** Der zlib-Strom (Sicht auf die Quellbytes). */
  readonly compressed: Uint8Array;
}

/** Zerlegt die Datei in Records; wirft bei abgeschnittenen Daten oder ungerader Anzahl. */
export function containerRecords(bytes: Uint8Array): ContainerRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: ContainerRecord[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new ContainerError(`Record-Header bei ${offset} abgeschnitten`);
    }
    const size = view.getUint32(offset, true);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > bytes.length) {
      throw new ContainerError(
        `Record bei ${offset}: ${length} Byte angekündigt, Datei endet vorher`,
      );
    }
    out.push({ size, compressed: bytes.subarray(start, start + length) });
    offset = start + length;
  }
  if (out.length % 2 !== 0) throw new ContainerError("ungerade Recordzahl (Name ohne Inhalt)");
  return out;
}

export interface ContainerEntry {
  /** Dateiname wie gespeichert (Groß-/Kleinschreibung gemischt, ohne Pfad). */
  readonly name: string;
  readonly data: Uint8Array;
}

export type Inflate = (compressed: Uint8Array) => Uint8Array;
export type InflateAsync = (compressed: Uint8Array) => Promise<Uint8Array>;

function unpack(record: ContainerRecord, data: Uint8Array): Uint8Array {
  if (data.length !== record.size) {
    throw new ContainerError(`entpackt ${data.length} statt ${record.size} Byte`);
  }
  return data;
}

function entries(
  records: readonly ContainerRecord[],
  blocks: readonly Uint8Array[],
): ContainerEntry[] {
  const out: ContainerEntry[] = [];
  for (let i = 0; i < records.length; i += 2) {
    const name = decodeCp1252(unpack(records[i]!, blocks[i]!));
    if (name.length === 0 || /[\\/\0]/.test(name)) {
      throw new ContainerError(`ungültiger Dateiname ${JSON.stringify(name)}`);
    }
    out.push({ name, data: unpack(records[i + 1]!, blocks[i + 1]!) });
  }
  return out;
}

/** Liest alle Einträge in Dateireihenfolge. */
export function readContainer(bytes: Uint8Array, inflate: Inflate): ContainerEntry[] {
  const records = containerRecords(bytes);
  return entries(
    records,
    records.map((r) => inflate(r.compressed)),
  );
}

export async function readContainerAsync(
  bytes: Uint8Array,
  inflate: InflateAsync,
): Promise<ContainerEntry[]> {
  const records = containerRecords(bytes);
  return entries(records, await Promise.all(records.map((r) => inflate(r.compressed))));
}

/** zlib-Entpacken mit der Web-Streams-API (Browser, Bun). */
export async function inflateWeb(compressed: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([compressed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
