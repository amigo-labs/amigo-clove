export const MUSIC_CONVERTER_VERSION = 1;

/** Tracker-Module bleiben unverändert; `libopenmpt.js` spielt sie zur Laufzeit. */
export function convertMusic(
  module: Uint8Array,
  ext: string,
): { bytes: Uint8Array; format: "xm" | "it" } {
  const format = ext.toLowerCase();
  if (format !== "xm" && format !== "it") throw new Error(`unbekanntes Modulformat .${ext}`);
  return { bytes: module, format };
}
