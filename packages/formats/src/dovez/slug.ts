/**
 * Asset-Namen aus DoveZ-Dateinamen: klein, Endung weg, Leerzeichen → `_`,
 * alles außer a–z, 0–9, `_`, `-` → `-`. Leerzeichen und Bindestrich bleiben
 * unterscheidbar — `Sound.d2p` enthält `D phy green.wav` **und**
 * `d-phy green.wav`. Pipeline und Engine bilden IDs mit derselben Funktion
 * (`Level1-1 Skyfight.dlp` → `level1-1_skyfight`).
 */
export function dovezSlug(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/ /g, "_")
    .replace(/[^a-z0-9_-]/g, "-");
}

/** Schlüssel eines Sprites/einer Kontur im Atlas: Dateiname klein, ohne Endung. */
export function dovezSpriteKey(fileName: string): string {
  return fileName.toLowerCase().replace(/\.(bmp|r)$/, "");
}
