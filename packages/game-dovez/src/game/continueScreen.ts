import { cint, f32 } from "../sim/vb";
import { NOT_RANKED, addHighscore, type HighscoreEntry } from "./highscore";

/**
 * Continue-Bildschirm (`Continue` `0x521790`), reine Logik ohne Pixi:
 * Countdown 9 → 0 (je Schritt 28 Durchläufe à 40 ms), Bestätigen, Beschleunigen
 * mit Esc/D/Q, danach die Ausschaltanimation („alter Fernseher“, 72 Durchläufe).
 * Jeder Durchlauf zieht die Zufallszahlen des Originals in dessen Reihenfolge
 * aus dem **Spiel-`Rnd`** (Annahme: jeder Durchlauf gezeichnet, kein
 * Bildauslassen) und liefert, was `continueView.ts` zeichnet.
 * Befund: `docs/measurements/dovez-runtime.md` („Continue“).
 */

/** Takt der Schleife (`Wait 40`, 25 Durchläufe/s). */
export const CONTINUE_MS = 40;
/** Durchläufe je Countdown-Schritt. */
export const STEP_PASSES = 28;

export interface Rnd {
  next(): number;
}

/** Tasten von Spieler 1 in diesem Durchlauf (Zustände, keine Flanken). */
export interface ContinueKeys {
  /** `TasteOK`: Feuer/Beam (nur ohne Levelausflug), Leertaste, Enter. */
  readonly ok: boolean;
  /** `TasteZurück`: Waffe wechseln, Beam-Modus, Esc. */
  readonly back: boolean;
  /** Das Spielfenster hat den Fokus (`GetFocus() = hWnd`); ohne zählen keine Tasten. */
  readonly focus: boolean;
}

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ContinueNormalPass {
  readonly kind: "normal";
  /** ② schwarzer Hauch α 0,1 über dem zuletzt gesetzten `weiss`-Rechteck (10 %). */
  readonly haze: Rect | undefined;
  /** 101 Schneeflocken 2×2 (x, y abwechselnd), weiß α 0,8 additiv. */
  readonly flakes: readonly number[];
  /** Senkrechte 1×600-Streifen (x), weiß α 0,8 additiv. */
  readonly stripes: readonly number[];
  /** Angezeigte Ziffer und ihre Zeile (zittert in den ersten 15 Durchläufen). */
  readonly digit: number;
  readonly digitY: number;
  /** ⑨ Bildriss um diese Zeile (10 %). */
  readonly tear: number | undefined;
  readonly blurAlpha: number;
}

export interface ContinueOffPass {
  readonly kind: "off";
  /** Phase 1: das Bild schrumpft zur Mitte (Zielrechteck, leer beim 50. Durchlauf). */
  readonly shrink: Rect | undefined;
  /** Phase 2: waagerechter Leuchtstrich `a_kreis2`. */
  readonly glow: Rect | undefined;
  readonly blurAlpha: number;
}

export type ContinuePass = ContinueNormalPass | ContinueOffPass;

export class ContinueLogic {
  /** Countdown `n`, Start 9. */
  count = 9;
  /** Unterzähler `sub`. */
  sub = 0;
  /** Countdown abgelaufen → Ausschaltanimation (`fertig`). */
  finishing = false;
  /** Zeile der Bildstörung `v`. */
  row = 0;
  /** Ergebnis, sobald die Schleife endet: `true` weiter, `false` Game Over. */
  result: boolean | undefined;
  /** `Me.70C`: Rechteck des schrumpfenden Bildes. */
  private readonly shrink: Rect = { x1: 0, y1: 0, x2: 800, y2: 600 };
  /** `Me.6FC`: Rechteck des Leuchtstrichs. */
  private readonly glow: Rect = { x1: 400, y1: 300, x2: 400, y2: 300 };
  /** Zuletzt gesetztes Rechteck von `weiss` (Start: das Abdunkeln des Spielbilds). */
  private weiss: Rect = { x1: 0, y1: 0, x2: 800, y2: 600 };

  constructor(private readonly rnd: Rnd) {}

  /** Ein Durchlauf; danach ist `result` gesetzt, wenn die Schleife endet. */
  step(keys: ContinueKeys): ContinuePass {
    const pass = this.finishing ? this.off() : this.normal(keys);
    // #176: das ganze Bild vergröbert darüber, ①
    const blurAlpha = f32(this.rnd.next() / 2 + 0.1);
    return { ...pass, blurAlpha };
  }

  private normal(keys: ContinueKeys): Omit<ContinueNormalPass, "blurAlpha"> {
    const rnd = this.rnd;
    const haze = rnd.next() > 0.9 ? { ...this.weiss } : undefined;
    const flakes: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const x = cint(f32(rnd.next() * 800));
      const y = cint(f32(rnd.next() * 600));
      flakes.push(x, y);
      this.weiss = { x1: x, y1: y, x2: x + 2, y2: y + 2 };
    }
    const stripes: number[] = [];
    for (let i = 0; i <= 2; i++) {
      if (rnd.next() > 0.7) {
        const x = cint(f32(rnd.next() * 791));
        stripes.push(x);
        this.weiss = { x1: x, y1: 0, x2: x + 1, y2: 600 };
      }
    }
    if (keys.focus) {
      if (keys.ok) this.result = true;
      if (keys.back) this.sub += 9;
    }
    this.sub++;
    if (this.sub >= STEP_PASSES) {
      this.sub = 0;
      this.count--;
      if (this.count === 0) this.finishing = true;
    }
    let digitY = 200;
    if (this.sub < 15) digitY = cint(f32(f32(200 + f32(rnd.next() * 20)) - 10));
    this.row = cint(this.row + rnd.next() * 4);
    if (this.row > 599) this.row = (this.row % 598) + 1;
    const tear = rnd.next() > 0.9 ? this.row : undefined;
    return { kind: "normal", haze, flakes, stripes, digit: this.count, digitY, tear };
  }

  private off(): Omit<ContinueOffPass, "blurAlpha"> {
    this.weiss = { x1: 0, y1: 0, x2: 800, y2: 600 };
    const s = this.shrink;
    const g = this.glow;
    if (s.x1 < 400) {
      s.x1 += 8;
      s.y1 += 6;
      s.x2 -= 8;
      s.y2 -= 6;
      Object.assign(g, { x1: 400, y1: 300, x2: 400, y2: 300 });
      return { kind: "off", shrink: { ...s }, glow: undefined };
    }
    if (g.x1 < -150) {
      this.sub++;
      if (this.sub === 15) this.result = false;
      return { kind: "off", shrink: undefined, glow: undefined };
    }
    this.sub = 0;
    g.x1 -= 80;
    g.y1 -= 2;
    g.x2 += 80;
    g.y2 += 2;
    return { kind: "off", shrink: undefined, glow: { ...g } };
  }
}

/** Spieler, wie `Continue` ihn für den Highscore-Eintrag liest. */
export interface ContinuePlayer {
  readonly name: string;
  readonly score: number;
  readonly id: number;
}

/**
 * #3–#7: `AddHighscore` mit dem vollen Stand je Spieler. Kommt Spieler 2 vor
 * Spieler 1, rückt dessen Platz um eins.
 */
export function continueRanks(
  list: readonly HighscoreEntry[],
  players: readonly ContinuePlayer[],
): { list: HighscoreEntry[]; ranks: number[] } {
  let out = [...list];
  const ranks: number[] = [];
  for (const p of players) {
    const r = addHighscore(out, p.name, p.score, p.id);
    out = r.list;
    ranks.push(r.rank);
  }
  if (players.length === 2 && ranks[1]! <= ranks[0]!) ranks[0]!++;
  return { list: out, ranks };
}

/** Rang-Zeilen (Arial 24, zentriert um x = 400, y = 490 + 20·p), nur Platz 1…10. */
export function rankTexts(
  names: readonly string[],
  ranks: readonly number[],
  german: boolean,
): { readonly text: string; readonly player: number }[] {
  const out: { text: string; player: number }[] = [];
  ranks.forEach((rank, p) => {
    if (rank >= NOT_RANKED) return;
    const name = names[p] ?? "";
    out.push({
      text: german ? `${name} landet auf Platz ${rank}!` : `${name} ranked at place ${rank}!`,
      player: p,
    });
  });
  return out;
}

/** Was „Continue“ an der Welt ändert (Felder von `World`). */
export interface ContinueTarget {
  lives: number;
  score: number[];
  extraLifeAt: number;
  musicVolume: number;
  musicStep: number;
  readonly playersMinus1: number;
}

/**
 * SpielLoop nach „ja“ (#271–#297): Leben 4 (2P 7), Punkte `\ 3` je Spieler,
 * Extraleben-Schwelle 3, Levelmusik blendet von 0 in 20 Ticks ein. Danach
 * zieht der normale Neustart (`World.respawn`) ein Leben ab → 3 bzw. 6.
 */
export function applyContinue(w: ContinueTarget): void {
  w.lives = w.playersMinus1 === 0 ? 4 : 7;
  w.score = w.score.map((s, p) => (p <= w.playersMinus1 ? Math.trunc(s / 3) : s));
  w.extraLifeAt = 3;
  w.musicVolume = 0;
  w.musicStep = 5;
}
