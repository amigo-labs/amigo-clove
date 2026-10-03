/**
 * Ein Abschnitt des Spielablaufs (Ladebild, Level, Video, Speicherbildschirm,
 * Abspann): `frame` läuft einmal je Anzeigebild und meldet `true`, sobald er
 * fertig ist; danach ruft der Ablauf `destroy`.
 */
export interface Scene {
  frame(now: number): boolean;
  /** Im letzten `frame` hat sich das Bild nicht geändert: die Stage nicht neu zeichnen. */
  readonly idle?: boolean;
  destroy(): void;
}
