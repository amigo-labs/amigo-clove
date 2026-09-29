import { DrawList } from "./effects";
import type { Vtx } from "./envDraw";
import type { SpecialEnv } from "./envHost";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, vbInt } from "./vb";

/**
 * `SpielSpezial(pass)` (`0x538CF0`): Level-Spezialabläufe, gesetzt von Route
 * op 42 (`SetSpecial`). Pass 0 läuft nach Ebene 0 (nur Typ 2 und 3), Pass 1
 * nach Ebene 6, Wasser und Wetter. Nur wenn aktiv und nicht in der Nova.
 *
 * | Typ | Level | Wirkung |
 * |---|---|---|
 * | 0 | Tutorial | Startsequenz: Schiffe steigen auf, fliegen ein, weiße Blende, Checkpoint |
 * | 1 | Tutorial, Skyfight, 7-4, Jungle | Tastenhinweis „Drücke: …“ (300 Ticks) |
 * | 2 | Tutorial | Glühen der oberen Bildhälfte |
 * | 3 | 1-2, 3-2, 4-2 | Gewitter mit Blitz (Neusaat über `Blitz`) |
 * | 4 | 7-3 | Verzerrung des Bildes |
 * | 5 | Epilog | Abflug mit Triebwerksglut |
 * | 6 | 7-4 | Zeitsprung 300 Ticks vor Levelende, Glühen und Unschärfe |
 * | 7 | 7-5 | Flucht: Explosionen, Blitze, Donner, Schmelzen, Rauschen |
 */

export function stepSpecial(env: SpecialEnv, pass: 0 | 1): void {
  const s = env.special;
  if (!s.active || env.w.nova) return;
  if (pass === 0) {
    if (s.type === 2) tutorialGlow(env);
    else if (s.type === 3) storm0(env);
    return;
  }
  switch (s.type) {
    case 0:
      tutorialStart(env);
      return;
    case 1:
      keyHint(env);
      return;
    case 3:
      storm1(env);
      return;
    case 4:
      distortion(env);
      return;
    case 5:
      epilogue(env);
      return;
    case 6:
      timeJump(env);
      return;
    case 7:
      escape(env);
      return;
  }
}

/** Weißer Schleier über dem Spielfeld (Pass 1). */
function white(env: SpecialEnv, a: number): void {
  env.lists.special1.rect("weiss", 0, 0, 800, 550, 1, 1, 1, a);
}

/** Typ 0 (Pass 1): Startsequenz des Tutorials, 200 Ticks. */
function tutorialStart(env: SpecialEnv): void {
  const s = env.special;
  const w = env.w;
  const rnd = w.rnd;
  const fx = w.fx;
  if (s.fresh) {
    for (const p of w.players) {
      p.exitState = 5;
      p.x = 190;
      p.y = (4 - p.index) * 200;
      p.rotation = 270;
      p.histX.fill(-64);
      p.histY.fill(-64);
    }
    s.counter = 201;
    s.fresh = false;
  }
  s.counter--;
  const t = s.counter;
  if (t <= 0) {
    for (const p of w.players) {
      p.exitState = 0;
      p.rotation = 0;
    }
    s.active = false;
    w.saveCheckpoint();
    white(env, 1);
    env.blenden();
    return;
  }
  if (t < 45) {
    for (const p of w.players) {
      p.rotation = 0;
      p.y = 64 * p.index + 260;
      p.tilt = 2;
      p.x = f32((COS_DEG[degIndex(2 * t)] ?? 0) * 170 - 70);
      const r1 = rnd.next();
      const r2 = rnd.next();
      fx.addBig(p.x - 10, p.y + 22, -5 * r1, 4 * r2 - 2, 1, 1, 1, 20, 0, 4, 10, 10);
      for (let k = 0; k <= cint(t / 10); k++) flame(env, p.x - 24, p.y, -10, 5, 1);
    }
    if (t < 11) white(env, (11 - t) / 10);
    return;
  }
  for (const p of w.players) {
    p.y = f32(p.y - 10);
    const r1 = rnd.next();
    const r2 = rnd.next();
    fx.addBig(p.x + 27, p.y, 4 * r1 - 2, 5 * r2 + 10, 1, 1, 1, 10, 0, 10, 10, 10);
    for (let k = 0; k <= 5; k++) {
      const q1 = rnd.next();
      const q2 = rnd.next();
      const q3 = rnd.next();
      const q4 = rnd.next();
      const q5 = rnd.next();
      fx.addBig(
        32 * q1 + p.x,
        p.y + 48,
        8 * q2 - 4,
        5 * q3 + 10,
        1,
        0.3 * q4 + 0.3,
        0.5 * q5,
        32,
        0,
        5,
        16,
        1,
      );
    }
    const spark = rnd.next() < 0.1;
    if (spark && p.y < 400) {
      const q1 = rnd.next();
      const q2 = rnd.next();
      fx.addBig(p.x + 27, p.y, 20 * q1 - 10, 20 * q2 - 10, 1, 0.5, 0.2, 10, 0, 20, 16, 20);
    }
    if (p.y === 400) {
      if (env.soundOn) {
        w.sound("speed");
        w.sound("speed");
      }
      fx.shake = 15;
    }
  }
  if (t > 190) white(env, (t - 190) / 10);
  // t = 200: `Me.BCC[0..1] = −1`, `Me.B8C.+1C/+50 = 0` — Bedeutung offen, entfällt
}

/** Triebwerksglut nach links (5 `Rnd`): `x`, `y + 8·r1`, vx `vx − 5·r2`, vy `8·r3 − 4`, orange, 48 px. */
function flame(
  env: SpecialEnv,
  x: number,
  y: number,
  vx: number,
  life: number,
  grow: number,
): void {
  const rnd = env.w.rnd;
  const r1 = rnd.next();
  const r2 = rnd.next();
  const r3 = rnd.next();
  const r4 = rnd.next();
  const r5 = rnd.next();
  env.w.fx.addBig(
    x,
    8 * r1 + y,
    vx - 5 * r2,
    8 * r3 - 4,
    1,
    0.3 * r4 + 0.3,
    0.5 * r5,
    48,
    0,
    life,
    16,
    grow,
  );
}

/** Typ 1 (Pass 1): Tastenhinweis, 300 Ticks, Grauwert blendet in 63 Ticks ein und aus. */
function keyHint(env: SpecialEnv): void {
  const s = env.special;
  if (s.fresh) {
    s.counter = 0;
    s.fresh = false;
  }
  s.counter++;
  const t = s.counter;
  if (t > 300) {
    s.active = false;
    return;
  }
  if (t < 63) s.p[1] = 4 * t;
  if (t > 237) s.p[1] = 4 * (300 - t);
  env.hint = { action: s.p[0] ?? 0, grey: s.p[1] ?? 0 };
}

/** Typ 2 (Pass 0): obere Bildhälfte in 21 additiven, wachsenden Lagen (Tutorial). */
function tutorialGlow(env: SpecialEnv): void {
  const s = env.special;
  if (s.fresh) {
    s.fresh = false;
    s.counter = 0;
  }
  if (s.counter < 100) s.counter++;
  if (env.w.background === 0) return;
  const out = env.lists.special0;
  out.capture("blur", 0, 0, 800, 275);
  for (let k = 0; k <= 100; k += 5)
    out.rect("@blur", -k, -k, 800 + k, 275 + k, 1, 1, 1, s.counter / 1000, true, [0, 0, 64, 64]);
  env.captureBlur = true;
}

/**
 * Typ 3, Pass 0: Gewitter. In Ruhe dunkelt ein Schleier das Bild ab, je Tick
 * mit 0,5 % ein Blitz bei zufälligem x (mit Ton zweimal Donner mit
 * Zufallsfrequenz); 49 Ticks lang dann Lichtkegel, zwei gesäte Blitze und
 * ein Glühen aus dem erfassten Bild.
 */
function storm0(env: SpecialEnv): void {
  const s = env.special;
  const w = env.w;
  const rnd = w.rnd;
  const out = env.lists.special0;
  if (s.fresh) {
    s.fresh = false;
    s.counter = 0;
  }
  if (s.counter === 0) {
    if (w.background !== 0) out.rect("weiss", 0, 0, 800, 550, 0, 0, 0, 0.5);
    if (rnd.next() < 0.005) {
      s.counter = 1;
      s.p[1] = cint(rnd.next() * 800);
      if (env.soundOn) {
        const freq = cint(rnd.next() * 41100 + 10000);
        w.sound("thunder", freq / 44100);
        w.sound("thunder", freq / 44100);
      }
    }
    return;
  }
  if (w.background !== 0) {
    s.p[0] = cint(rnd.next() * 10000);
    const x = s.p[1] ?? 0;
    out.cross("balken", -x, 0, x, 550, 0, 0, 0, 0.8);
    out.cross("balken", x, 0, 1600 - x, 550, 0, 0, 0, 0.8);
    const bolt = new DrawList();
    w.fx.lightning(bolt, x, 0, x, 550, 50, 5, 50, 0.7, 0.7, 0.7, false, s.p[0]);
    w.fx.lightning(bolt, x, 0, x, 550, 20, 5, 50, 1, 1, 1, true, s.p[0]);
    for (const seg of bolt.segments) out.segment(seg);
    out.capture("blur", 0, 0, 800, 550);
    const a = (25 - Math.abs(s.counter - 25)) / 35;
    for (let k = 0; k <= 100; k += 25)
      out.rect("@blur", -k, -k, 800 + k, 550 + k, 1, 1, 1, a, true, [0, 0, 64, 64]);
    env.captureBlur = true;
  }
  s.counter++;
  if (s.counter === 50) s.counter = 0;
}

/** Typ 3, Pass 1: weißer Lichtschaft über dem Blitz. */
function storm1(env: SpecialEnv): void {
  const s = env.special;
  if (s.fresh || s.counter <= 0 || env.w.background === 0) return;
  const x = s.p[1] ?? 0;
  env.lists.special1.cross("balken", x - 400, 0, x + 400, 550, 1, 1, 1, 0.3);
}

/**
 * Typ 4 (Pass 1, 7-3): das Bild nach `blur`, darüber ein 20 × 20-Gitter mit
 * wogenden Texturkoordinaten, α 0,3. Näherung: die Koordinaten des
 * Originals (bis 800/257 bzw. 550/256) werden auf 0…1 umgerechnet.
 */
function distortion(env: SpecialEnv): void {
  const w = env.w;
  const out = env.lists.special1;
  const t = w.tick;
  const au = 2 * Math.sin(t / 100);
  const av = Math.sin(t / 80);
  const su = 800 / 257;
  const sv = 550 / 256;
  const vtx = (i: number, j: number): Vtx => ({
    x: 40 * i,
    y: 27.5 * j,
    u: ((su / 20) * i + 1 / 512 - S(9 * i) * au * S(9 * j) * C(9 * i) * C(9 * j)) / su,
    v: ((sv / 20) * j + 1 / 512 - S(9 * i) * av * S(9 * j) * C(36 * j)) / sv,
    r: 1,
    g: 1,
    b: 1,
    a: 0.3,
  });
  out.capture("blur", 0, 0, 800, 550);
  for (let j = 1; j <= 20; j++) {
    const v: Vtx[] = [];
    for (let i = 0; i <= 20; i++) v.push(vtx(i, j), vtx(i, j - 1));
    out.strip("@blur", v);
  }
  env.captureBlur = true;
  w.overlays.b = true;
}

/** Typ 5 (Pass 1, Epilog): die Schiffe fliegen mit Triebwerksglut davon (27 `Rnd` je Schiff). */
function epilogue(env: SpecialEnv): void {
  const s = env.special;
  const w = env.w;
  const rnd = w.rnd;
  if (s.fresh) {
    s.fresh = false;
    for (const p of w.players) {
      p.exitState = 5;
      p.invulnerable = 0;
    }
    s.counter = 500;
  }
  for (const p of w.players) {
    const r1 = rnd.next();
    const r2 = rnd.next();
    w.fx.addBig(p.x - 10, p.y + 22, -15 * r1, 4 * r2 - 2, 1, 1, 1, 20, 0, 10, 10, 10);
    for (let k = 0; k <= 4; k++) flame(env, p.x - 14, p.y, -20, 7, 2);
    p.x = f32(p.x - (SIN_DEG[degIndex(w.tick)] ?? 0) / 2);
  }
}

/** Typ 6 (Pass 1, 7-4): Sprung 300 Ticks vor Levelende, Schiffe gesteuert, Glühen und Unschärfe. */
function timeJump(env: SpecialEnv): void {
  const s = env.special;
  const w = env.w;
  if (s.fresh) {
    s.fresh = false;
    w.tick = w.levelLength - 300;
    for (const p of w.players) p.exitState = 5;
  }
  w.overlays.a = true;
  w.overlays.b = true;
}

const S = (d: number) => SIN_DEG[degIndex(d)] ?? 0;
const C = (d: number) => COS_DEG[degIndex(d)] ?? 0;

const EXPLOSIONS = ["explosion", "explosion1", "explosion2"] as const;

/** Typ 7 (Pass 1, 7-5): die Flucht aus der explodierenden Station. */
function escape(env: SpecialEnv): void {
  const s = env.special;
  const w = env.w;
  const rnd = w.rnd;
  const fx = w.fx;
  const snd = env.soundOn;
  w.overlays.a = true;
  w.overlays.b = true;
  const t = w.tick;
  if (s.fresh) {
    s.fresh = false;
    fx.addExplosion(-20, -20, 100, 570);
    if (snd) w.loop("yellow", true);
  }
  const boom = () => {
    const r = rnd.next();
    w.sound(EXPLOSIONS[vbInt(r * 3)]!);
  };
  if (rnd.next() < 0.09 && snd) boom();
  if ((t > 20 && t < 800) || (t > 920 && t < 950)) {
    const c = cint(rnd.next());
    const r1 = rnd.next();
    const r2 = rnd.next();
    const r3 = rnd.next();
    fx.addBig(-80, 550 * r1 - 40, 4 * r2 + 3, 5 * r3 - 4, c, c / 2, c / 3, 80, 0, 50, 10, 5);
    fx.addSparks(1, 5, 0, 0, 800, 600, false);
  }
  if (t === 200 && snd) w.sound("thunder");
  if (t >= 200 && t <= 260) env.noise = f32((30 - Math.abs(t - 230)) / 50);
  const bolt = rnd.next() < 0.1;
  if (bolt && t < 800 && t > 400) {
    rnd.next();
    rnd.next();
    fx.addBig(0, 0, 0, 0, 1, 0, 0, 550, 0, 10, 0, 800);
  }
  if (t === 200 || t === 800) fx.addBig(-50, 275, 0, 0, 1, 0.1, 0, 1, 50, 250, 1, 10);
  if (t === 850) fx.addBig(-50, 275, 0, 0, 0.6, 0.7, 0.3, 1, 50, 200, 16, 10);
  if (t === 900) {
    fx.addExplosion(-20, -20, 100, 570);
    if (snd) for (let k = 0; k < 3; k++) boom();
  }
  if (t === 500) fx.shake = 100;
  if (t > 600 && t < 690) {
    // „Schmelzen“: 101 Spalten à 2 px nach unten versetzt (ohne `Me.4FC`-Prüfung)
    const rects: [number, number, number, number, number, number][] = [];
    for (let k = 0; k <= 100; k++) {
      const h = cint(rnd.next() * 10 + 3);
      const xs = cint(rnd.next() * 798);
      rects.push([xs, 0, 2, 550 - h, xs, h]);
    }
    env.lists.special1.copy(rects);
  }
  for (const p of w.players) {
    if (!(p.x < 150)) continue;
    p.energy = f32(p.energy - 0.1);
    w.vibrate?.(5, 1, p.index); // `AddForce(5, 1, p)` (`0x53C36F`)
    if (fx.shake === 0) fx.shake = 1;
  }
}
