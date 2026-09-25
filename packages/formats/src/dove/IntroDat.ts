import { decodeCp1252 } from "../text/cp1252";

/**
 * DOVE `Data/intro.dat` — die Story-Einleitung (`PlayIntro` `0x4916D0`).
 *
 * VB6-`Write #`-Text, ein Wert pro Zeile. Schema (`docs/measurements/dove-flow.md`):
 * Kopf, dann 11 Szenenplätze mit Hintergrund, Dauer, Sprite-Blatt, benannten
 * Rechtecken, Partikelexplosionen, Objekten mit Keyframes und (ungenutzten) Sounds.
 */
export interface IntroRect {
  readonly name: string;
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

export interface IntroExplosion {
  readonly size: number;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
}

export interface IntroKey {
  readonly t: number;
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  /** −1: x, y und Skala linear zum nächsten Keyframe interpolieren. */
  readonly lerp: number;
  /** 100 = 1:1, sonst gestreckt. */
  readonly scale: number;
  readonly frame0: number;
  readonly frames: number;
  readonly ticksPerFrame: number;
}

export interface IntroObject {
  /** Index in `rects`. */
  readonly sprite: number;
  readonly keys: readonly IntroKey[];
}

export interface IntroScene {
  readonly background: string;
  readonly duration: number;
  readonly sheet: string;
  readonly rects: readonly IntroRect[];
  readonly explosions: readonly IntroExplosion[];
  readonly objects: readonly IntroObject[];
  readonly sounds: readonly { readonly tick: number; readonly name: string }[];
}

export interface DoveIntro {
  readonly header: string;
  readonly scenes: readonly IntroScene[];
}

export class IntroDatError extends Error {
  override name = "IntroDatError";
}

export const INTRO_SCENES = 11;

function times<T>(n: number, f: () => T): T[] {
  return Array.from({ length: Math.max(0, n) }, f);
}

export function parseIntroDat(bytes: Uint8Array): DoveIntro {
  const tokens = decodeCp1252(bytes).split(/\r?\n/);
  if (tokens.at(-1) === "") tokens.pop();
  let p = 0;
  const next = (): string => {
    const t = tokens[p++];
    if (t === undefined) throw new IntroDatError(`unerwartetes Dateiende bei Token ${p}`);
    return t.trim();
  };
  const str = (): string => {
    const t = next();
    if (!t.startsWith('"') || !t.endsWith('"'))
      throw new IntroDatError(`Token ${p}: String erwartet, '${t}'`);
    return t.slice(1, -1);
  };
  const int = (): number => {
    const t = next();
    if (!/^-?\d+$/.test(t)) throw new IntroDatError(`Token ${p}: Zahl erwartet, '${t}'`);
    return Number(t);
  };
  const bool = (): boolean => {
    const t = next();
    if (t === "#TRUE#") return true;
    if (t === "#FALSE#") return false;
    throw new IntroDatError(`Token ${p}: Boolean erwartet, '${t}'`);
  };

  // Kopf: ohne Anführungszeichen gespeichert („1“), als String gelesen.
  const header = next();
  const scenes = times(INTRO_SCENES, (): IntroScene => {
    const background = str();
    const duration = int();
    const sheet = str();
    const rects = times(int(), () => ({ name: str(), l: int(), t: int(), r: int(), b: int() }));
    const explosions = times(int() + 1, () => ({ size: int(), tick: int(), x: int(), y: int() }));
    const objects = times(int(), () => {
      const sprite = int();
      const keys = times(int() + 1, () => ({
        t: int(),
        visible: bool(),
        x: int(),
        y: int(),
        lerp: int(),
        scale: int(),
        frame0: int(),
        frames: int(),
        ticksPerFrame: int(),
      }));
      return { sprite, keys };
    });
    const sounds = times(int() + 1, () => ({ tick: int(), name: str() }));
    return { background, duration, sheet, rects, explosions, objects, sounds };
  });
  if (p !== tokens.length) throw new IntroDatError(`${tokens.length - p} Tokens übrig`);
  return { header, scenes };
}
