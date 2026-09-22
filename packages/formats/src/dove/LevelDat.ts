import { decodeCp1252, encodeCp1252 } from "../text/cp1252";

/**
 * DOVE `Data/LevelN.dat` — Parser **und** Serializer.
 *
 * Invariante, von den Tests über alle 12 Level geprüft:
 * `serializeLevelDat(parseLevelDat(bytes))` ist byte-identisch zu `bytes`.
 * Format-Dokumentation: `docs/formats/dove-level-dat.md`.
 */

export interface Rect {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

/** Sektion 1 und 2: benanntes Rechteck im Atlas (`landschaftN.spr` bzw. `backgroundN.spr`). */
export interface NamedRect {
  readonly name: string;
  readonly rect: Rect;
}

export interface EnemyFrame {
  /**
   * Zwei Frame-Header-Werte. In 221 von 319 Frames sind sie genau die erste und
   * letzte belegte Konturzeile, bei Platzhaltern `-1, -1`; die restliche
   * Semantik ist offen, daher bewusst roh.
   */
  readonly header: readonly [number, number];
  /**
   * `(h+1)` Zeilenpaare `left, right` relativ zu `rect.l`, verschachtelt.
   * Leere Zeilen haben `left > right`. Die letzte Zeile ist ein Off-by-one des
   * Original-Editors und ragt ins nächste Frame — für die Kollision ignorieren,
   * für den Round-Trip behalten.
   */
  readonly spans: Int16Array;
}

export interface EnemyDef {
  readonly name: string;
  readonly rect: Rect;
  /** Fünf unbelegte Parameter. Benannte Accessoren gehören in die Engine, nicht hierher. */
  readonly params: readonly [number, number, number, number, number];
  readonly frames: readonly EnemyFrame[];
}

export interface MovePattern {
  readonly name: string;
  readonly flags: readonly [boolean, boolean];
  readonly values: readonly [number, number];
  /** Wegpunkte ohne den Terminator. */
  readonly waypoints: readonly (readonly [number, number])[];
  /**
   * Zweiter Wert des Terminators `-1, <end>`. Meist 0; in 5 Patterns
   * (z. B. Level 2 „unten“: 98) ungleich 0 — Semantik offen, vermutlich ein
   * Ausflug-Y oder Sprungziel.
   */
  readonly end: number;
}

/**
 * Opcodes der `;op a b!`-Tokens im Event-Stream.
 *
 * Record-Referenzen (Tile, Gegner, Hintergrundobjekt) sind **1-basiert**: der
 * höchste vorkommende Wert ist jeweils genau die Anzahl der Records. Pattern
 * `1…n` verweisen 1-basiert auf Sektion 4, Pattern `0` und `-1…-7` auf
 * eingebaute Bewegungsarten der Engine (Level 0 hat keine Patterns und nutzt nur 0).
 */
export const EventOp = {
  /** `;0 <tile> <y>!` — Landschafts-Tile platzieren (Wand) */
  Tile: 0,
  /** `;1 <gegner> <pattern>!` — aktuellen Gegnertyp + Pattern setzen (spawnt nicht) */
  SelectEnemy: 1,
  /** `;2 <art> <y>!` — Extra spawnen, `art` ∈ {−2…3} ≙ Schild, Bombe, Option, Rot, Grün, Blau */
  Extra: 2,
  /** `;3 0 0!` — 0–8× pro Level, vermutlich Checkpoint (Liesmich 0.17: „Checkpoints wurden eingeführt“) */
  Marker: 3,
  /** `;4 <obj> <y>!` — Hintergrundobjekt spawnen */
  BackgroundObject: 4,
} as const;

export type LevelEvent =
  | { readonly kind: "command"; readonly op: number; readonly a: number; readonly b: number }
  | { readonly kind: "spawn"; readonly y: number };

export interface DoveLevel {
  /** Zeilenende der Quelldatei; die Originale verwenden durchgängig eines. */
  readonly eol: "\n" | "\r\n";
  readonly tiles: readonly NamedRect[];
  readonly backgroundObjects: readonly NamedRect[];
  readonly enemies: readonly EnemyDef[];
  readonly patterns: readonly MovePattern[];
  /** Levellänge in Ticks (in allen 12 Leveln 32000). */
  readonly length: number;
  /**
   * `length + 1` Event-Zeilen (VB6 `0 To length`), eine pro Tick, meist leer.
   * Die letzte ist in allen Originalen leer.
   */
  readonly events: readonly (readonly LevelEvent[])[];
  /** Name des Hintergrundbilds ohne Endung, z. B. `background1`. */
  readonly background: string;
}

export class LevelDatError extends Error {
  override name = "LevelDatError";
}

const SEPARATOR = '"*"';
const SPAWN_MARK = "§"; // Byte 0xA7
const INT = /^-?\d+$/;
const COMMAND = /^;(-?\d+) (-?\d+) (-?\d+)!/;
const SPAWN = new RegExp(`^(-?\\d+)${SPAWN_MARK}`);

class Lines {
  private pos = 0;
  constructor(private readonly lines: readonly string[]) {}

  get line(): number {
    return this.pos + 1;
  }

  peek(): string | undefined {
    return this.lines[this.pos];
  }

  next(): string {
    const l = this.lines[this.pos];
    if (l === undefined) throw this.error("unerwartetes Dateiende");
    this.pos++;
    return l;
  }

  done(): boolean {
    return this.pos >= this.lines.length;
  }

  error(message: string): LevelDatError {
    return new LevelDatError(`Zeile ${this.pos + 1}: ${message}`);
  }

  int(): number {
    const l = this.next();
    if (!INT.test(l))
      throw new LevelDatError(`Zeile ${this.pos}: Ganzzahl erwartet, '${l}' gefunden`);
    return Number(l);
  }

  str(): string {
    const l = this.next();
    if (!isString(l)) {
      throw new LevelDatError(`Zeile ${this.pos}: String erwartet, '${l}' gefunden`);
    }
    return l.slice(1, -1);
  }

  bool(): boolean {
    const l = this.next();
    if (l === "#TRUE#") return true;
    if (l === "#FALSE#") return false;
    throw new LevelDatError(`Zeile ${this.pos}: Boolean erwartet, '${l}' gefunden`);
  }

  separator(): void {
    const l = this.next();
    if (l !== SEPARATOR)
      throw new LevelDatError(`Zeile ${this.pos}: '"*"' erwartet, '${l}' gefunden`);
  }

  rect(): Rect {
    return { l: this.int(), t: this.int(), r: this.int(), b: this.int() };
  }
}

function isString(l: string): boolean {
  return l.length >= 2 && l.startsWith('"') && l.endsWith('"');
}

function parseNamedRects(r: Lines): NamedRect[] {
  const out: NamedRect[] = [];
  while (r.peek() !== SEPARATOR) out.push({ name: r.str(), rect: r.rect() });
  r.separator();
  return out;
}

function parseEnemies(r: Lines): EnemyDef[] {
  const out: EnemyDef[] = [];
  while (r.peek() !== SEPARATOR) {
    const start = r.line;
    const name = r.str();
    const rect = r.rect();
    const params = [r.int(), r.int(), r.int(), r.int(), r.int()] as const;
    const rest: number[] = [];
    while (!isString(r.peek() ?? '""')) rest.push(r.int());

    // Die Framezahl steht nirgends in der Datei; sie folgt aus der Recordlänge.
    const h = rect.b - rect.t;
    if (h <= 0) throw new LevelDatError(`Zeile ${start}: Gegner '${name}' hat Höhe ${h}`);
    const frameLen = 2 + 2 * (h + 1);
    if (rest.length === 0 || rest.length % frameLen !== 0) {
      throw new LevelDatError(
        `Zeile ${start}: Gegner '${name}': ${rest.length} Konturwerte sind kein Vielfaches von ${frameLen}`,
      );
    }
    const frames: EnemyFrame[] = [];
    for (let f = 0; f < rest.length; f += frameLen) {
      const spans = Int16Array.from(rest.slice(f + 2, f + frameLen));
      spans.forEach((v, i) => {
        if (v !== rest[f + 2 + i]) {
          throw new LevelDatError(
            `Zeile ${start}: Konturwert ${rest[f + 2 + i]} passt nicht in i16`,
          );
        }
      });
      frames.push({ header: [rest[f] as number, rest[f + 1] as number], spans });
    }
    out.push({ name, rect, params, frames });
  }
  r.separator();
  return out;
}

function parsePatterns(r: Lines): MovePattern[] {
  const out: MovePattern[] = [];
  while (r.peek() !== SEPARATOR) {
    const name = r.str();
    const flags = [r.bool(), r.bool()] as const;
    const values = [r.int(), r.int()] as const;
    const waypoints: [number, number][] = [];
    let end: number;
    for (;;) {
      const x = r.int();
      const y = r.int();
      if (x === -1) {
        end = y;
        break;
      }
      waypoints.push([x, y]);
    }
    const following = r.peek();
    if (following === undefined || (!isString(following) && following !== SEPARATOR)) {
      throw r.error(`Pattern '${name}': nach dem Terminator folgt '${following}'`);
    }
    out.push({ name, flags, values, waypoints, end });
  }
  r.separator();
  return out;
}

export function parseEventLine(line: string): LevelEvent[] {
  const out: LevelEvent[] = [];
  let rest = line;
  while (rest.length > 0) {
    if (out.length > 0 && rest.startsWith(" ") && SPAWN.test(rest.slice(1))) {
      rest = rest.slice(1);
    }
    const c = COMMAND.exec(rest);
    if (c) {
      out.push({ kind: "command", op: Number(c[1]), a: Number(c[2]), b: Number(c[3]) });
      rest = rest.slice(c[0].length);
      continue;
    }
    const s = SPAWN.exec(rest);
    if (s) {
      out.push({ kind: "spawn", y: Number(s[1]) });
      rest = rest.slice(s[0].length);
      continue;
    }
    throw new LevelDatError(`unbekanntes Event-Token in '${line}' bei '${rest}'`);
  }
  // Die Rekonstruktion muss exakt dieselbe Zeile liefern, sonst ist die
  // Trennregel unvollständig — lieber hier scheitern als still normalisieren.
  if (formatEventLine(out) !== line) {
    throw new LevelDatError(`Event-Zeile '${line}' ist nicht kanonisch`);
  }
  return out;
}

/** Kommandos folgen direkt aufeinander, ein Spawn nach einem beliebigen Token bekommt ein Leerzeichen. */
export function formatEventLine(events: readonly LevelEvent[]): string {
  let out = "";
  for (const e of events) {
    if (e.kind === "command") {
      out += `;${e.op} ${e.a} ${e.b}!`;
    } else {
      out += `${out.length > 0 ? " " : ""}${e.y}${SPAWN_MARK}`;
    }
  }
  return out;
}

export function parseLevelDat(bytes: Uint8Array): DoveLevel {
  const text = decodeCp1252(bytes);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (!text.endsWith(eol)) throw new LevelDatError("Datei endet nicht mit einem Zeilenende");
  const all = text.slice(0, -eol.length).split(eol);
  if (eol === "\n" && all.some((l) => l.includes("\r"))) {
    throw new LevelDatError("gemischte Zeilenenden");
  }
  const r = new Lines(all);

  const tiles = parseNamedRects(r);
  const backgroundObjects = parseNamedRects(r);
  const enemies = parseEnemies(r);
  const patterns = parsePatterns(r);
  const length = r.int();
  const events: LevelEvent[][] = [];
  for (let i = 0; i <= length; i++) events.push(parseEventLine(r.next()));
  const background = r.str();
  if (!r.done()) throw r.error("Daten nach dem Hintergrundnamen");

  return { eol, tiles, backgroundObjects, enemies, patterns, length, events, background };
}

export function serializeLevelDat(level: DoveLevel): Uint8Array {
  const lines: string[] = [];
  const str = (s: string) => lines.push(`"${s}"`);
  const num = (n: number) => lines.push(String(n));
  const rect = (x: Rect) => lines.push(String(x.l), String(x.t), String(x.r), String(x.b));

  for (const section of [level.tiles, level.backgroundObjects]) {
    for (const e of section) {
      str(e.name);
      rect(e.rect);
    }
    lines.push(SEPARATOR);
  }
  for (const e of level.enemies) {
    str(e.name);
    rect(e.rect);
    e.params.forEach(num);
    for (const f of e.frames) {
      num(f.header[0]);
      num(f.header[1]);
      f.spans.forEach(num);
    }
  }
  lines.push(SEPARATOR);
  for (const p of level.patterns) {
    str(p.name);
    for (const flag of p.flags) lines.push(flag ? "#TRUE#" : "#FALSE#");
    p.values.forEach(num);
    for (const [x, y] of p.waypoints) {
      num(x);
      num(y);
    }
    num(-1);
    num(p.end);
  }
  lines.push(SEPARATOR);
  num(level.length);
  if (level.events.length !== level.length + 1) {
    throw new LevelDatError(`${level.events.length} Event-Zeilen, erwartet ${level.length + 1}`);
  }
  for (const line of level.events) lines.push(formatEventLine(line));
  str(level.background);

  return encodeCp1252(lines.join(level.eol) + level.eol);
}
