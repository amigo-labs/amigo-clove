import type { DovezRoute, DovezRouteOp } from "@clove/formats";
import {
  COS_DEG,
  SIN_DEG,
  cint,
  degIndex,
  f32,
  vbInt,
  winkel,
  winkelInGrad,
  type VbRnd,
} from "./vb";

/**
 * Der Routen-Interpreter `DoRoute` (`DoveZ.exe` `0x4ACC70`, Sprungtabelle
 * `0x4B5458`): ein Bytecode mit 45 Befehlen, der Gegner, Gegnerteile und
 * Gegnerschüsse bewegt. Zeilengetreu portiert, Befund und Adressen:
 * `docs/formats/dovez-level-dat.md` („Routen“).
 *
 * Ein Aufruf von `stepRoute` ist ein Tick: Befehle laufen, bis einer „nachgibt“
 * (SetPos, MoveTo*, Step, Wait, Goto ohne Label). Effekte außerhalb der
 * Bewegung (Waffen, Partikel, Töne, Ebenen …) meldet der Interpreter über
 * `RouteHost.effect`; die Engine (M8) führt sie aus.
 */

export const Op = {
  SetPos: 0,
  MoveToAndDie: 1,
  MoveTo: 2,
  MoveToAccel: 3,
  Step: 4,
  Wait: 5,
  SetSpeed: 6,
  SetPartFrame: 7,
  Fire: 8,
  Set: 9,
  Random: 10,
  Label: 11,
  Goto: 12,
  If: 13,
  Else: 14,
  EndIf: 15,
  IfHitsLandscape: 16,
  SetGlobal: 17,
  GetGlobal: 18,
  SpawnAnimL4: 19,
  Div: 20,
  Mul: 21,
  PolarVec: 22,
  AngleDeg: 23,
  SetLayerSpeed: 24,
  SetLayerScroll: 25,
  AddLens: 26,
  SetPartProp: 27,
  SetInt: 28,
  PlaySound: 29,
  StopSound: 30,
  SetRumble: 31,
  Nop: 32,
  SpawnBigParticle: 33,
  Lightning: 34,
  For: 35,
  Next: 36,
  AddBubble: 37,
  AddFunction: 38,
  SpawnAnim: 39,
  Distance: 40,
  AddFade: 41,
  SetSpecial: 42,
  SetTarget: 43,
  IfPartDestroyed: 44,
} as const;

export const OP_NAMES: readonly string[] = [
  "SetPos",
  "MoveToAndDie",
  "MoveTo",
  "MoveToAccel",
  "Step",
  "Wait",
  "SetSpeed",
  "SetPartFrame",
  "Fire",
  "Set",
  "Random",
  "Label",
  "Goto",
  "If",
  "Else",
  "EndIf",
  "IfHitsLandscape",
  "SetGlobal",
  "GetGlobal",
  "SpawnAnimL4",
  "Div",
  "Mul",
  "PolarVec",
  "AngleDeg",
  "SetLayerSpeed",
  "SetLayerScroll",
  "AddLens",
  "SetPartProp",
  "SetInt",
  "PlaySound",
  "StopSound",
  "SetRumble",
  "Nop",
  "SpawnBigParticle",
  "Lightning",
  "For",
  "Next",
  "AddBubble",
  "AddFunction",
  "SpawnAnim",
  "Distance",
  "AddFade",
  "SetSpecial",
  "SetTarget",
  "IfPartDestroyed",
];

/** Variablencodes in Argumenten (`Var`, `0x4AC970`); Beträge darunter sind Literale. */
export const VAR = {
  local7: 32748,
  local0: 32755,
  tick: 32756,
  speed: 32757,
  y: 32758,
  x: 32759,
  spawnY: 32760,
  spawnTick: 32761,
  playerY: 32762,
  playerX: 32763,
  screenH: 32764,
  screenW: 32765,
  negHeight: 32766,
  negWidth: 32767,
  hp: 32768,
  playersMinus1: 32769,
  reg0: 32770,
  reg13: 32783,
  playerA8: 32784,
} as const;

/** Zustand des bewegten Objekts (Gegner `0x588110 + i·0xF0`, Teil oder Schuss). */
export interface RouteActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wait: number;
  /** Befehlszeiger, 0-basiert. */
  ip: number;
  speed: number;
  hp: number;
  /** L0…L7 (`Var` 32755…32748). */
  readonly locals: Float32Array;
  /** R0…R13 (`Var` 32770…32783); Teile teilen sie mit ihrem Gegner. */
  readonly regs: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly spawnY: number;
  readonly spawnTick: number;
  /** Zielspieler (0-basiert). */
  player: number;
}

export function newRouteActor(init: {
  x: number;
  y: number;
  speed: number;
  hp: number;
  width: number;
  height: number;
  spawnTick: number;
  /** `Var` 32760; Gegner: y beim Spawn, Schüsse: laufende Nummer im Emitter. */
  spawnY?: number;
  player?: number;
  regs?: Float32Array;
}): RouteActor {
  return {
    x: f32(init.x),
    y: f32(init.y),
    vx: 0,
    vy: 0,
    wait: 0,
    ip: 0,
    speed: f32(init.speed),
    hp: f32(init.hp),
    locals: new Float32Array(8),
    regs: init.regs ?? new Float32Array(14),
    width: init.width,
    height: init.height,
    spawnY: init.spawnY ?? Math.trunc(init.y),
    spawnTick: init.spawnTick,
    player: init.player ?? 0,
  };
}

/** Befehle mit Wirkung außerhalb von Position und Variablen; Argumente ausgewertet. */
export interface RouteEffect {
  readonly op: number;
  readonly args: readonly number[];
}

/** Was der Interpreter von der Welt liest; die Engine liefert es, die Debug-Ansicht simuliert es. */
export interface RouteHost {
  /** Level-Tick (`Me.584`). */
  readonly tick: number;
  /** Anzahl Spieler − 1 (`0x5882A4`). */
  readonly playersMinus1: number;
  readonly players: { x: number; y: number }[];
  /** `Me.A7C[p]+0xA8` (Tutorial: Steuerungsschema). */
  readonly playerA8: number;
  /** `Me.A64`: von allen Objekten geteilte Ganzzahlen (SetGlobal/GetGlobal). */
  readonly globals: number[];
  readonly rnd: VbRnd;
  hitsLandscape(left: number, top: number, right: number, bottom: number): boolean;
  partDestroyed(part: number): boolean;
  effect(e: RouteEffect): void;
}

/** Schutz gegen Endlosschleifen ohne Nachgeben: nach 10000 Befehlen endet die Route. */
const MAX_OPS = 10_000;

function varValue(a: RouteActor, h: RouteHost, v: number): number {
  const neg = v < 0;
  const c = Math.abs(v);
  let r: number;
  if (c < VAR.local7) r = c;
  else if (c <= VAR.local0) r = a.locals[VAR.local0 - c] ?? 0;
  else if (c === VAR.tick) r = h.tick;
  else if (c === VAR.speed) r = a.speed;
  else if (c === VAR.y) r = a.y;
  else if (c === VAR.x) r = a.x;
  else if (c === VAR.spawnY) r = a.spawnY;
  else if (c === VAR.spawnTick) r = a.spawnTick;
  else if (c === VAR.playerY) r = h.players[a.player]?.y ?? 0;
  else if (c === VAR.playerX) r = h.players[a.player]?.x ?? 0;
  else if (c === VAR.screenH) r = 550;
  else if (c === VAR.screenW) r = 800;
  else if (c === VAR.negHeight) r = -a.height;
  else if (c === VAR.negWidth) r = -a.width;
  else if (c === VAR.hp) r = a.hp;
  else if (c === VAR.playersMinus1) r = h.playersMinus1;
  else if (c <= VAR.reg13) r = a.regs[c - VAR.reg0] ?? 0;
  else if (c === VAR.playerA8) r = h.playerA8;
  else r = c; // über 32784: wieder ein Literal (`0x4ACC1A`, nur 7-4: HP-Marke 100000)
  return neg ? -r : r;
}

function arg(a: RouteActor, h: RouteHost, op: DovezRouteOp, k: number): number {
  const p = op.args[k];
  return p ? f32(varValue(a, h, p.a) + varValue(a, h, p.b)) : 0;
}

/** Zuweisung an einen Variablencode (`0x4B38C5`). X und Y landen in Scratch-Feldern, wirkungslos. */
function assign(a: RouteActor, h: RouteHost, code: number, value: number): void {
  const c = cint(Math.abs(code));
  const v = f32(value);
  if (c >= VAR.reg0 && c <= VAR.reg13) a.regs[c - VAR.reg0] = v;
  else if (c >= VAR.local7 && c <= VAR.local0) a.locals[VAR.local0 - c] = v;
  else if (c === VAR.hp) a.hp = v;
  else if (c === VAR.playerX || c === VAR.playerY) {
    const p = h.players[a.player];
    if (p) {
      if (c === VAR.playerX) p.x = v;
      else p.y = v;
    }
  }
}

const IF_OPENERS = new Set<number>([Op.If, Op.IfHitsLandscape, Op.IfPartDestroyed]);

/** Blocksprung für If (Tiefe 1) und Else (Tiefe 0), `0x4AE378`. */
function skipBlock(ops: readonly DovezRouteOp[], ip: number, depth: number): number {
  const last = ops.length - 1;
  let k = ip;
  if (k >= last) return k;
  do {
    k++;
    if (ops[k - 1]!.op === Op.Else) depth++;
    const c = ops[k]!.op;
    if (c === Op.Else) depth--;
    if (c === Op.EndIf) depth--;
    if (IF_OPENERS.has(c)) depth++;
  } while (k < last && depth !== 0);
  return k;
}

/** Ein Tick der Route; `true`: Objekt entfernen (Routenende, MoveToAndDie, Endlosschleife). */
export function stepRoute(route: DovezRoute, a: RouteActor, h: RouteHost): boolean {
  const ops = route.ops;
  const last = ops.length - 1;
  let forFlag = false;
  for (let n = 1; ; n++) {
    if (n >= MAX_OPS) return true;
    if (a.ip > last) return true;
    const op = ops[a.ip]!;
    const A = (k: number) => arg(a, h, op, k);
    const code = (k: number) => op.args[k]?.a ?? 0;
    switch (op.op) {
      case Op.Label:
      case Op.EndIf:
      case Op.Nop:
        a.ip++;
        continue;
      case Op.SetPos:
        a.x = A(0);
        a.y = A(1);
        a.ip++;
        return false;
      case Op.MoveToAndDie:
      case Op.MoveTo:
      case Op.MoveToAccel: {
        const tx = A(0);
        const ty = A(1);
        const accel = op.op === Op.MoveToAccel;
        if (accel && a.speed === 0) a.speed = f32(a.speed + A(2));
        const homing = [code(0), code(1)].some((c) => c === VAR.playerX || c === VAR.playerY);
        if ((a.vx === 0 && a.vy === 0) || homing) {
          const ang = winkel(tx - a.x, ty - a.y);
          a.vx = f32(Math.cos(ang) * a.speed);
          a.vy = f32(Math.sin(ang) * a.speed);
        }
        a.x = f32(a.x + a.vx);
        a.y = f32(a.y + a.vy);
        let arrived = 0;
        if (accel) {
          if (a.speed !== 0) {
            a.vx = f32(a.vx / a.speed);
            a.vy = f32(a.vy / a.speed);
          }
          a.speed = f32(A(2) + a.speed);
          if (a.speed <= 0) {
            a.speed = 0;
            arrived = 3;
          } else {
            a.vx = f32(a.vx * a.speed);
            a.vy = f32(a.vy * a.speed);
          }
        }
        if (a.vx < 0 ? a.x <= tx : a.x >= tx) arrived++;
        if (a.vy < 0 ? a.y <= ty : a.y >= ty) arrived++;
        if (arrived < 2) return false;
        if (arrived === 2) {
          a.x = tx;
          a.y = ty;
        }
        a.vx = 0;
        a.vy = 0;
        if (op.op === Op.MoveToAndDie) return true;
        a.ip++;
        return false;
      }
      case Op.Step:
        if (a.vx !== 0 || a.vy !== 0) {
          a.vx = 0;
          a.vy = 0;
          a.ip++;
          continue;
        }
        a.vx = A(0);
        a.vy = A(1);
        if (a.vx !== 0 || a.vy !== 0) {
          a.x = f32(a.x + a.vx);
          a.y = f32(a.y + a.vy);
          return false;
        }
        a.ip++;
        return false;
      case Op.Wait:
        a.wait = f32(a.wait + 1);
        if (A(0) <= a.wait) {
          a.wait = 0;
          a.ip++;
        }
        return false;
      case Op.SetSpeed:
        a.speed = A(0);
        a.ip++;
        continue;
      case Op.Set:
        assign(a, h, code(0), A(1));
        a.ip++;
        continue;
      case Op.Random:
        assign(a, h, code(0), vbInt(h.rnd.next() * A(1) + 1));
        a.ip++;
        continue;
      case Op.Goto: {
        const t = cint(A(0));
        const target = ops.findIndex((o) => o.op === Op.Label && arg(a, h, o, 0) === t);
        if (target < 0) return false;
        a.ip = target + 1;
        continue;
      }
      case Op.If:
      case Op.IfHitsLandscape:
      case Op.IfPartDestroyed: {
        let cond: boolean;
        if (op.op === Op.If) {
          const l = A(0);
          const r = A(2);
          const cmp = code(1);
          cond =
            cmp === -2
              ? l < r
              : cmp === -1
                ? l <= r
                : cmp === 0
                  ? l === r
                  : cmp === 1
                    ? l >= r
                    : cmp === 2
                      ? l > r
                      : false;
        } else if (op.op === Op.IfHitsLandscape) {
          const dx = A(0);
          const dy = A(1);
          cond = h.hitsLandscape(
            cint(a.x + dx),
            cint(a.y + dy),
            cint(a.x + dx + a.width),
            cint(a.y + dy + a.height),
          );
        } else {
          cond = h.partDestroyed(cint(A(0)));
        }
        a.vx = 0;
        a.vy = 0;
        a.ip = cond ? a.ip + 1 : skipBlock(ops, a.ip, 1) + 1;
        continue;
      }
      case Op.Else:
        a.ip = skipBlock(ops, a.ip, 0) + 1;
        continue;
      case Op.SetGlobal: {
        const i = cint(A(0));
        if (i >= 0) h.globals[i] = cint(A(1));
        a.ip++;
        continue;
      }
      case Op.GetGlobal: {
        const v = cint(h.globals[cint(A(0))] ?? 0);
        const c = Math.abs(code(1));
        const l = cint(VAR.local0 - c);
        if (l >= 0 && l <= 6) a.locals[l] = v;
        const r = cint(c - VAR.reg0);
        if (r >= 0 && r <= 13) a.regs[r] = v;
        a.ip++;
        continue;
      }
      case Op.Div: {
        const d = A(2);
        assign(a, h, code(0), d === 0 ? Infinity : A(1) / d);
        a.ip++;
        continue;
      }
      case Op.Mul:
        assign(a, h, code(0), A(1) * A(2));
        a.ip++;
        continue;
      case Op.PolarVec: {
        const d = degIndex(cint(A(2)));
        assign(a, h, code(0), COS_DEG[d]! * a.speed);
        assign(a, h, code(1), SIN_DEG[d]! * a.speed);
        a.ip++;
        continue;
      }
      case Op.AngleDeg:
        assign(a, h, code(0), winkelInGrad(A(1), A(2)));
        a.ip++;
        continue;
      case Op.SetInt:
        assign(a, h, code(0), vbInt(A(1)));
        a.ip++;
        continue;
      case Op.Distance:
        assign(a, h, code(0), Math.sqrt(A(1) ** 2 + A(2) ** 2));
        a.ip++;
        continue;
      case Op.SetTarget: {
        const p = cint(A(0));
        a.player = p >= 0 && p <= h.playersMinus1 ? p : vbInt(h.rnd.next() * (h.playersMinus1 + 1));
        a.ip++;
        continue;
      }
      case Op.For: {
        const step = A(3);
        const value = forFlag ? f32(A(0) + step) : A(1);
        assign(a, h, code(0), value);
        const from = A(1);
        const to = A(2);
        const done = from < to ? to < value : to > value;
        if (done) {
          let depth = 1;
          let k = a.ip;
          if (k < last) {
            do {
              k++;
              if (ops[k]!.op === Op.Next) depth--;
              if (ops[k]!.op === Op.For) depth++;
            } while (k < last && depth !== 0);
          }
          a.ip = k;
        }
        forFlag = false;
        a.ip++;
        continue;
      }
      case Op.Next: {
        let k = a.ip;
        if (k > 0) {
          let depth = 1;
          do {
            k--;
            if (ops[k]!.op === Op.For) depth--;
            if (ops[k]!.op === Op.Next) depth++;
          } while (k > 0 && depth !== 0);
          a.ip = k;
          forFlag = true;
          continue;
        }
        a.ip++;
        continue;
      }
      default:
        if (op.op < 0 || op.op > Op.IfPartDestroyed) return false; // unbekannt: bleibt stehen
        h.effect({ op: op.op, args: op.args.map((_, k) => A(k)) });
        a.ip++;
        continue;
    }
  }
}

const VAR_NAMES = new Map<number, string>([
  [VAR.tick, "TICK"],
  [VAR.speed, "SPEED"],
  [VAR.y, "Y"],
  [VAR.x, "X"],
  [VAR.spawnY, "SPAWNY"],
  [VAR.spawnTick, "SPAWNTICK"],
  [VAR.playerY, "PLY"],
  [VAR.playerX, "PLX"],
  [VAR.screenH, "550"],
  [VAR.screenW, "800"],
  [VAR.negHeight, "-H"],
  [VAR.negWidth, "-W"],
  [VAR.hp, "HP"],
  [VAR.playersMinus1, "NPL1"],
  [VAR.playerA8, "PLA8"],
]);

function termName(v: number): string {
  const c = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  // Single-Literale ohne Binärrest (0.1 statt 0.10000000149011612)
  if (c < VAR.local7) return String(Number(v.toPrecision(7)));
  if (c <= VAR.local0) return `${sign}L${VAR.local0 - c}`;
  if (c >= VAR.reg0 && c <= VAR.reg13) return `${sign}R${c - VAR.reg0}`;
  const n = VAR_NAMES.get(c);
  if (!n) return `${sign}?${c}`;
  return sign && n.startsWith("-") ? n.slice(1) : sign + n;
}

/** Ein Argument lesbar: `X+10`, `-W`, `L0`, `3.5`. */
export function formatRouteArg(p: { readonly a: number; readonly b: number }): string {
  const a = termName(p.a);
  if (p.b === 0) return a;
  const b = termName(p.b);
  return b.startsWith("-") ? `${a}${b}` : `${a}+${b}`;
}

/** `MoveTo PLX, 275`; Vergleichsoperatoren von `If` als Symbol. */
export function formatRouteOp(op: DovezRouteOp): string {
  const name = OP_NAMES[op.op] ?? `Op${op.op}`;
  if (op.op === Op.If && op.args.length === 3) {
    const cmp = ["<", "<=", "==", ">=", ">"][(op.args[1]!.a as number) + 2] ?? "?";
    return `If ${formatRouteArg(op.args[0]!)} ${cmp} ${formatRouteArg(op.args[2]!)}`;
  }
  return op.args.length ? `${name} ${op.args.map(formatRouteArg).join(", ")}` : name;
}
