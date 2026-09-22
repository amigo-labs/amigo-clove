import { readdirSync } from "node:fs";
import { join } from "node:path";

export const DOVE_DATA = join(import.meta.dir, "../../../original-dove/Data");
export const DOVE_LEVELS = Array.from({ length: 12 }, (_, i) => i);

export async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(path).arrayBuffer());
}

export function doveLevelPath(n: number): string {
  return join(DOVE_DATA, `Level${n}.dat`);
}

/**
 * Pfad zu einer Grafik in `Data/Grafik/`. Die Originale mischen Groß-/Kleinschreibung
 * (`FEINDE11.spr`), Windows ignoriert das — wir lösen daher case-insensitiv auf.
 */
export function doveSpritePath(name: string): string {
  const wanted = `${name}.spr`.toLowerCase();
  const file = readdirSync(join(DOVE_DATA, "Grafik")).find((f) => f.toLowerCase() === wanted);
  if (!file) throw new Error(`Grafik ${name}.spr nicht gefunden`);
  return join(DOVE_DATA, "Grafik", file);
}

export function doveSpriteNames(): string[] {
  return readdirSync(join(DOVE_DATA, "Grafik"))
    .filter((f) => f.toLowerCase().endsWith(".spr"))
    .toSorted();
}
