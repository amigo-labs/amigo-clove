import { idiv } from "../math";
import type { BossScript, World } from "../world";
import { damagePart, partHeight, partWidth, setPart, typeByName } from "./common";
import { bossRowHit, killBossPart } from "./e2";

// ------------------------------------------------------------------ Kosinus wie die x87-FPU
//
// Das Original rechnet die Pfade mit `fcos` und Doubles (`0x462385` ff.):
//   step = π / N                                  (VarDiv, Double; π = 4·Atn(1), `0x43191C`)
//   t1   = fcos(step·k) · (−half)                 (fcos in 64 Bit, fmul rundet auf 53 Bit)
//   t2   = t1 + half                              (fiadd, 53 Bit, als Double gespeichert)
//   pos  = FpI4(p0 + t2)                          (fadd, dann Runden half-even)
// JS-Doubles rechnen +, −, ·, / exakt nach IEEE 754 (ohne FMA) — plattformunabhängig. Nur
// `Math.cos` ist nicht garantiert; deshalb wird cos hier in Double-Double-Arithmetik
// (≈ 106 Bit) ausgewertet und das Produkt mit −half einmal korrekt auf ein Double gerundet.
// Das ist wichtig, weil cos(kπ/N) = ±1/2 (k = N/3, 2N/3) bei ungeradem half genau auf
// x,5 fällt: dann entscheidet der Rundungsfehler von π/N über die Rundung.
// Annahme (*mittel*): die FPU läuft mit 53-Bit-Genauigkeit (Windows-Standard, Steuerwort
// 0x27F); `fcos` selbst ist davon nicht betroffen (liefert 64 Bit).

const SPLIT = 134217729; // 2^27 + 1 (Dekker)
let hi = 0;
let lo = 0;

function twoProd(a: number, b: number): void {
  const p = a * b;
  let t = SPLIT * a;
  const ah = t - (t - a);
  const al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b);
  const bl = b - bh;
  hi = p;
  lo = ah * bh - p + ah * bl + al * bh + al * bl;
}

function quickTwoSum(a: number, b: number): void {
  const s = a + b;
  lo = b - (s - a);
  hi = s;
}

/** (ah, al) · (bh, bl) → (hi, lo). */
function ddMul(ah: number, al: number, bh: number, bl: number): void {
  twoProd(ah, bh);
  quickTwoSum(hi, lo + ah * bl + al * bh);
}

/** (ah, al) · d → (hi, lo). */
function ddMulD(ah: number, al: number, d: number): void {
  twoProd(ah, d);
  quickTwoSum(hi, lo + al * d);
}

/** (ah, al) / d → (hi, lo). */
function ddDivD(ah: number, al: number, d: number): void {
  const q1 = ah / d;
  twoProd(q1, d);
  const p = hi;
  const e = lo;
  const s = ah - p;
  const v = s - ah;
  let f = ah - (s - v) + (-p - v);
  f = f - e + al;
  quickTwoSum(q1, (s + f) / d);
}

/** (ah, al) + (bh, bl) → (hi, lo) (genaue Variante). */
function ddAdd(ah: number, al: number, bh: number, bl: number): void {
  let s = ah + bh;
  let v = s - ah;
  const s2 = ah - (s - v) + (bh - v);
  const t = al + bl;
  v = t - al;
  const t2 = al - (t - v) + (bl - v);
  quickTwoSum(s, s2 + t);
  s = hi;
  quickTwoSum(s, lo + t2);
}

/** Korrekt auf ein Double gerundetes cos(x) · m (x ∈ [0, π + ε], m ganzzahlig). */
function cosTimes(x: number, m: number): number {
  twoProd(x, x);
  const x2h = hi;
  const x2l = lo;
  let th = 1;
  let tl = 0;
  let sh = 1;
  let sl = 0;
  for (let n = 1; n < 40; n++) {
    ddMul(th, tl, x2h, x2l);
    ddDivD(hi, lo, (2 * n - 1) * (2 * n));
    th = hi;
    tl = lo;
    if (n & 1) ddAdd(sh, sl, -th, -tl);
    else ddAdd(sh, sl, th, tl);
    sh = hi;
    sl = lo;
    if (Math.abs(th) < 1e-36) break;
  }
  ddMulD(sh, sl, m);
  return hi;
}

/** `FpI4` eines Doubles: Runden auf die nächste Ganzzahl, bei ,5 zur geraden. */
function fpI4(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Pfadpunkt k eines Segments (k = 0: Startpunkt p0). */
export function pathValue(p0: number, half: number, n: number, k: number): number {
  if (k === 0) return p0;
  const t1 = cosTimes((Math.PI / n) * k, -half);
  const t2 = t1 + half;
  return fpI4(p0 + t2);
}

// ------------------------------------------------------------------ Level 3

/**
 * Pfadzustand je Fisch i und Achse a (0 x, 1 y) in `bossC[(2i + a)·4 + …]`: +0 Startpunkt p0
 * (= Pfad(i, 0)), +1 half, +2 Schrittzahl N, +3 Index. Das Original legt die Punkte als Felder
 * im Objekt `Me.27E8` ab (x: +A4/+EC, y: +C8/+108); jeder Punkt ist eine reine Funktion von
 * (p0, half, N, k) und wird hier erst bei Bedarf berechnet. Endmarke −1000 ⇔ Index = N + 1.
 */
const P0 = 0;
const HALF = 1;
const N = 2;
const IDX = 3;

/** Achse eines Fisches einen Schritt weiter; liefert die neue Koordinate. */
function advance(w: World, slot: number, range: number, size: number): number {
  const c = w.bossC;
  const idx = (c[slot + IDX] as number) + 1;
  c[slot + IDX] = idx;
  if (idx === (c[slot + N] as number) + 1) {
    // Neues Segment (`0x46212D`): Start = letzter Punkt, N = Int(Rnd·100) + 50,
    // Ziel = Int(Rnd·640) − w\2 bzw. Int(Rnd·410) − h\2, half = (Ziel − Start) \ 2.
    const p0 = pathValue(
      c[slot + P0] as number,
      c[slot + HALF] as number,
      c[slot + N] as number,
      idx - 1,
    );
    const n = w.rnd.below(100) + 50;
    const target = w.rnd.below(range) - (size >> 1);
    c[slot + P0] = p0;
    c[slot + N] = n;
    c[slot + HALF] = idiv(target - p0, 2);
    c[slot + IDX] = 1;
  }
  return pathValue(
    c[slot + P0] as number,
    c[slot + HALF] as number,
    c[slot + N] as number,
    c[slot + IDX] as number,
  );
}

/**
 * Level 3 — E3 (`0x461ED0`): drei Fische „EndG<-- (16)“ (106×96, HP je 4000), die auf
 * unabhängigen x/y-Pfaden mit Kosinus-Ease schwimmen und nicht schießen. Der dritte Fisch
 * existiert nur bei Punktefaktor `Me.638` > 1,1 (`0x462A93`). Keine Todessequenz, keine
 * Punkte: sind alle HP ≤ 0, gilt das Level als geschafft.
 */
export const boss3: BossScript = {
  tick(w: World) {
    const c = w.bossC;
    if (w.bossState === 0) {
      // `0x462A93`
      const type = typeByName(w, "EndG<-- (16)");
      setPart(w, 0, type, 640, 0, 4000);
      const y0 = 205 - (partHeight(w, 0) >> 1);
      w.bossY[0] = y0;
      setPart(w, 1, type, 640, y0, 4000);
      // Fisch 3 startet links außerhalb (x = l − r). Fisch 2/3 bekommen ihre Position im
      // Original erst im nächsten Tick (bis dahin Altwerte im Datensatz) — hier der Pfadstart.
      setPart(w, 2, type, -partWidth(w, 0), y0, w.options.scoreFactor > 110 ? 4000 : 0);
      for (let i = 0; i < 3; i++) {
        c[2 * i * 4 + P0] = w.bossX[i] as number;
        c[(2 * i + 1) * 4 + P0] = y0;
        for (let a = 0; a < 2; a++) {
          c[(2 * i + a) * 4 + HALF] = 0;
          c[(2 * i + a) * 4 + N] = 0;
          c[(2 * i + a) * 4 + IDX] = 0;
        }
      }
      w.bossState = 1;
    } else {
      // `0x461F76`: nur lebende Fische bewegen sich (x zuerst, dann y) und werden gezeichnet.
      const fw = partWidth(w, 0);
      const fh = partHeight(w, 0);
      for (let i = 0; i < 3; i++) {
        if ((w.bossHP[i] as number) <= 0) continue;
        w.bossX[i] = advance(w, 2 * i * 4, 640, fw);
        w.bossY[i] = advance(w, (2 * i + 1) * 4, 410, fh);
      }
    }
    for (let i = 0; i < 3; i++) w.bossVisible[i] = (w.bossHP[i] as number) > 0 ? 1 : 0;
    // Alle tot → `Me.264` (`0x462CD0`), ohne Punkte.
    if (w.bossHP.every((hp) => hp <= 0)) w.levelDone = true;
  },

  /**
   * `0x44B44F`: Reihenfolge Fisch 2, Fisch 3, Fisch 1, jeweils nur mit HP > 0. Treffer:
   * Funken, `HP −= Schaden` (Schaden 500: Beam-Budget); HP > 0 → 0, sonst Überschuss −HP,
   * Explosionen und Sound.
   */
  hit(w, bx, by, bw, bh, damage) {
    for (let k = 0; k < 3; k++) {
      const p = k === 2 ? 0 : k + 1;
      if ((w.bossHP[p] as number) <= 0 || !bossRowHit(w, p, bx, by, bw, bh)) continue;
      damagePart(w, p, damage, bx, by);
      const hp = w.bossHP[p] as number;
      if (hp > 0) return 0;
      killBossPart(w, p);
      return -hp;
    }
    return -1;
  },
};
