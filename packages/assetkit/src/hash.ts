import { createHash } from "node:crypto";

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Hash über kanonisch serialisierte Optionen (Schlüssel sortiert). */
export function optionsHash(options: Record<string, unknown>): string {
  const keys = Object.keys(options).toSorted();
  return sha256(JSON.stringify(keys.map((k) => [k, options[k]]))).slice(0, 16);
}
