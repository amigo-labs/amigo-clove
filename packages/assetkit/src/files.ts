import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Dateien in `root/dir`, deren Name auf `pattern` passt, sortiert, als `dir/<name>`. */
export function listFiles(root: string, dir: string, pattern: RegExp): string[] {
  return readdirSync(join(root, dir))
    .filter((f) => pattern.test(f))
    .toSorted()
    .map((f) => `${dir}/${f}`);
}

/** JSON-Ausgabe eines Konverters: kompakt, mit Zeilenende, UTF-8. */
export function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}
