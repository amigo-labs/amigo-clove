import { cint, f32, vbInt } from "../../sim/vb";
import { DEFAULT_NAME, type HighscoreEntry, NAME_MAX } from "../highscore";
import { type Lang, isCyrillic } from "../lang";

/**
 * Regeln des Hauptmenüs (`MenuLoop` `0x559630`), die das HTML-Menü vom Original
 * übernimmt: Bonuslevel, Pegelschritte, Spiel-IDs und Namen. Ohne Pixi und ohne
 * Seitenlogik — Seiten und Zeichnen macht die Shell.
 */

export interface Rnd {
  next(): number;
}

/** Bonuslevel (`Lvl` auf Seite 40), freigeschaltet je geschafftem Durchgang. */
export const BONUS_LEVELS = ["Level8-1 Jungle", "Spacestation Bonus", "Level Bleistift"] as const;
/** Einträge der Bonusseite; sie heißen in jeder Sprache gleich. */
export const BONUS_ENTRIES = ["JUNGLE", "SPACE", "STIFT"] as const;

/** Freigeschaltete Bonuslevel: einer je Durchgang, höchstens drei. */
export function bonusCount(passes: number): number {
  return Math.max(0, Math.min(passes, BONUS_LEVELS.length));
}

/** Anzeige eines Pegels (1/100 dB): `CLng((v + 5000) / 50)`, 0 dB = 100. */
export function volumeLevel(v: number): string {
  return String(cint((v + 5000) / 50));
}

/** OK auf Sound/Sprache: +250; unter −5000 → −4500; über 0 → −10000 (stumm). */
export function volumeStep(v: number): number {
  let w = v + 250;
  if (w < -5000) w = -4500;
  if (w > 0) w = -10000;
  return w;
}

/** Stumm (`-10000`) und die Stufen −4500 … 0 von `volumeStep`. */
export const VOLUME_MUTE = -10000;
const VOLUME_LOW = -4500;
const VOLUME_STEP = 250;
/** Höchste Stufe des Reglers (0 dB); Stufe 0 ist stumm. */
export const VOLUME_STEPS = -VOLUME_LOW / VOLUME_STEP + 1;

/** Pegel (1/100 dB) → Reglerstufe 0…`VOLUME_STEPS`; Zwischenwerte runden auf die nächste Stufe. */
export function volumeIndex(v: number): number {
  if (v < -5000) return 0;
  return Math.max(1, Math.min(VOLUME_STEPS, Math.round((v - VOLUME_LOW) / VOLUME_STEP) + 1));
}

/** Reglerstufe → Pegel; dieselben Werte, die `volumeStep` durchläuft. */
export function volumeOfIndex(i: number): number {
  return i <= 0 ? VOLUME_MUTE : VOLUME_LOW + (Math.min(i, VOLUME_STEPS) - 1) * VOLUME_STEP;
}

/** Musikpegel: OK +5, über 100 zurück auf 0 — der Regler nimmt dieselben Schritte. */
export const MUSIC_STEP = 5;

/**
 * Spiel-IDs nach der Namenseingabe (`[ebp-0x28]`, Enter): je Spieler
 * `CLng(Int(Rnd · 10000) + Durchgänge · 10000)`, neu gezogen, solange die ID in
 * der Highscoreliste steht oder beide Spieler dieselbe haben. `last` sind die
 * IDs des letzten Spiels der Sitzung (Vergleich gegen den anderen Spieler).
 */
export function newPlayerIds(
  rnd: Rnd,
  players: 1 | 2,
  passes: number,
  highscores: readonly HighscoreEntry[],
  last: readonly number[] = [],
): number[] {
  const ids = [last[0] ?? 0, last[1] ?? 0];
  const taken = (id: number) => highscores.some((e) => e.id === id);
  for (let p = 0; p < players; p++) {
    do {
      ids[p] = cint(vbInt(f32(rnd.next()) * 10000) + passes * 10000);
    } while (taken(ids[p]!) || ids[0] === ids[1]);
  }
  return ids.slice(0, players);
}

/**
 * Name aus der Eingabe (`KeyAscii`): Zeichen ab 32, ANSI bis 255, auf Russisch
 * dazu die kyrillischen Buchstaben (CP1251); höchstens 16; leer → „Bruce“.
 */
export function playerName(input: string, lang: Lang): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 && (c <= 255 || (lang === "ru" && isCyrillic(c)))) out += ch;
    if (out.length >= NAME_MAX) break;
  }
  return out.trim() === "" ? DEFAULT_NAME : out;
}

/**
 * `MakeSomeNoise` (`0x4FEBC0`): je Kachel (4 × 3, spaltenweise) Ausschnitt
 * (sx, sy)–(sx2, sy2) im 256²-Bild `noise`, gespiegelt je nach Vorzeichen; 48 `Rnd`.
 * Bleibt für die Start-Logos (`LogoGlitch`).
 */
export function rollNoise(rnd: Rnd): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const sx = cint(rnd.next() * 255);
    const sy = cint(rnd.next() * 255);
    const sx2 = cint((vbInt(rnd.next() * 2) * 2 - 1) * 255 + sx);
    const sy2 = cint((vbInt(rnd.next() * 2) * 2 - 1) * 255 + sy);
    out.push([sx, sy, sx2, sy2]);
  }
  return out;
}
