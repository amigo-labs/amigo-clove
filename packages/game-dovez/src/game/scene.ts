/**
 * Ein Abschnitt des Spielablaufs (Ladebild, Level, Video, Speicherbildschirm,
 * Abspann): `frame` läuft einmal je Anzeigebild und meldet `true`, sobald er
 * fertig ist; danach ruft der Ablauf `destroy`.
 */
export interface Scene {
  frame(now: number): boolean;
  destroy(): void;
}
