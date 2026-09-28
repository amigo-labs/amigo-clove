import type { DovezLevel } from "@clove/formats";
import { ENV_SLOTS, EnvList, type EnvSlot, type Vtx } from "./envDraw";
import { newSpecial, type EnvWorld, type Hint, type SpecialState } from "./envHost";
import { stepSpecial } from "./special";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, idiv, vbInt } from "./vb";

export type { EnvWorld, Hint } from "./envHost";

/**
 * Umgebungseffekte von DoveZ: `SpielMoveHintergrund` (`0x50D490`),
 * `SpielRegen` (`0x536970`), `SpielSchnee` (`0x537150`), `SpielWasser`
 * (`0x533390`), `SpielHupe` (`0x533150`) und `OverlayEffekte` (`0x538260`)
 * mit `MakeSomeNoise` (`0x4FEBC0`); die Spezialabläufe (`SpielSpezial`)
 * liegen in `special.ts`. Befund: `docs/measurements/dovez-runtime.md`
 * („Hintergründe“, „Wetter“, „Wasser“, „Overlays“, „Spezialabläufe“).
 *
 * Wie bei den Effekten rechnet der Port wie ein Rechner, der jeden Tick
 * zeichnet (`Me.4FC` immer gesetzt): alle `Rnd`, die das Original nur beim
 * Zeichnen zieht, laufen hier jeden Tick. Gezeichnet wird über
 * Befehlslisten (`envDraw.ts`), die der Renderer auf einen nie gelöschten
 * Backbuffer abspielt.
 */

export const STAR_COUNT = 101;
/** Schleier-, Schnee- und Wolkendatensätze `Me.10E4` (Index `3·i + j`). */
export const VEIL_COUNT = 60;

/** Stern bzw. Fleck `Me.10C0[i]` (0x1C): Modi 2 und 6 x/y/Tempo/Farbe, Modi 4 und 5 Phase und Frequenzen. */
export interface Star {
  x: number;
  y: number;
  speed: number;
  phase: number;
  /** Modi 2/6: Grauwert r, g, b; Modi 4/5: fx, fy, Alpha. */
  r: number;
  g: number;
  b: number;
}

/** Regentropfen `Me.10D0[i]` bzw. Schleierdatensatz `Me.10E4[i]`: x, y, vx, vy. */
export interface Mover {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Im Checkpoint gesicherter Teil (`SaveCheckPointSub`): Sterne, Tropfen, Spezial, Modus, `Me.506`. */
export interface EnvSaved {
  readonly stars: Star[];
  readonly drops: Mover[];
  readonly special: SpecialState;
  readonly background: number;
  readonly blur: boolean;
}

const mover = (): Mover => ({ x: 0, y: 0, vx: 0, vy: 0 });

/** Farbiger Vertex ohne Texturkoordinate (Wasseroberfläche aus `weiss`). */
function cv(x: number, y: number, c: readonly number[], alpha: number): Vtx {
  return { x, y, u: 0, v: 0, r: c[0]!, g: c[1]!, b: c[2]!, a: alpha };
}

/** Rampe von Glühen und Unschärfe: +0,025 bis 0,5 bzw. −0,05 bis 0 (wie das Original, ohne Klemmen). */
function ramp(on: boolean, a: number): number {
  if (on) return a < 0.5 ? f32(a + 0.025) : 0.5;
  return a > 0 ? f32(a - 0.05) : 0;
}

export class Environment {
  readonly stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
    x: 0,
    y: 0,
    speed: 0,
    phase: 0,
    r: 0,
    g: 0,
    b: 0,
  }));
  /** `Me.10CC`: Sterne neu auslegen. */
  starsInit = true;
  /** `Me.10D0` (0 bis `weatherParticles`). */
  readonly drops: Mover[];
  readonly veils: Mover[] = Array.from({ length: VEIL_COUNT }, mover);
  /** `Me.10F8`: Wetter neu auslegen (nach jedem Neustart). */
  weatherInit = true;
  /** „Wind“-Winkel in Grad (`Me.1288+0x750`), wandert zufällig. */
  wind = 0;
  /** Wasserberührungston läuft (`Me.1288+0x6C4`). */
  waterTouch = false;
  /** Hupe: Taste gehalten (`+0x6B0`), Restticks (`+0x6B4`). */
  hornHeld = false;
  hornTicks = 0;
  /** `Me.504`: `blur` muss vor dem Zeichnen neu aus dem Bild erfasst werden. */
  blurStale = true;
  /** `Me.50A`: am Ende von `OverlayEffekte` das Bild nach `blur` erfassen. */
  captureBlur = false;
  /** `Blenden` hat in diesem Tick `Me.50C` gesetzt. */
  private blend = false;
  /** Standbild-Überblendung `Me.514`/`Me.518`. */
  stillFade = false;
  stillAlpha = 0;
  /** Rauschstärke `Me.6D0`, je Tick 0, Route op 41 addiert. */
  noise = 0;
  /** Option „Ton an“ (`[0x58806E]`): zieht beim Gewitter und in der Flucht `Rnd`. */
  soundOn = true;
  /** Ersatz für `GetTickCount` (Nebel im Sternfeld): 16 ms je Tick. */
  clock = 0;
  /** Gerechnete Ticks (der Renderer zeichnet nur, wenn sich das geändert hat). */
  frame = 0;
  readonly special: SpecialState = newSpecial();
  /** Tastenhinweis dieses Ticks (`SpielSpezial` Typ 1). */
  hint: Hint | undefined;
  readonly lists = Object.fromEntries(ENV_SLOTS.map((s) => [s, new EnvList()])) as Record<
    EnvSlot,
    EnvList
  >;
  /** Atlas-Schlüssel des Hintergrundbilds (Modus 1). */
  readonly bgKey: string;

  constructor(
    readonly level: DovezLevel,
    readonly w: EnvWorld,
  ) {
    this.drops = Array.from({ length: Math.max(0, level.weatherParticles) + 1 }, mover);
    this.bgKey = level.background.toLowerCase().replace(/\.bmp$/, "");
  }

  /** Kopf von `SpielLoop`: Listen leeren, `Me.50A`, `Me.50C`, `Me.6D0` zurücksetzen. */
  beginTick(): void {
    for (const l of Object.values(this.lists)) l.clear();
    this.captureBlur = false;
    this.blend = false;
    this.noise = 0;
    this.hint = undefined;
    this.frame++;
  }

  /** `Blenden` (`0x4A9FA0`): Standbild erfassen und im nächsten Tick ausblenden. */
  blenden(): void {
    this.stillAlpha = 0;
    this.stillFade = true;
    this.blend = true;
  }

  /** Route op 41 („AddFade“): Rauschen addieren, auf 0…1 geklemmt (`0x4B3AC4`). */
  addNoise(v: number): void {
    const n = f32(v + this.noise);
    this.noise = n < 0 ? 0 : n > 1 ? 1 : n;
  }

  /** Route op 42 (`SetSpecial` `0x4B3B20`). */
  setSpecial(args: readonly number[]): void {
    const s = this.special;
    s.active = true;
    s.fresh = true;
    s.type = cint(args[0] ?? 0);
    for (let k = 0; k < 4; k++) s.p[k] = cint(args[k + 1] ?? 0);
  }

  /** `SpielSpezial(pass)` (`0x538CF0`). */
  stepSpecial(pass: 0 | 1): void {
    stepSpecial(this, pass);
  }

  save(): EnvSaved {
    return {
      stars: this.stars.map((s) => ({ ...s })),
      drops: this.drops.map((d) => ({ ...d })),
      special: { ...this.special, p: [...this.special.p] },
      background: this.w.background,
      blur: this.w.overlays.b,
    };
  }

  /** `VariabelnLösch` + `LoadCheckpoint`: Sterne aus dem Schnappschuss, Wetter neu, Stil 0. */
  load(s: EnvSaved): void {
    s.stars.forEach((x, i) => Object.assign(this.stars[i]!, x));
    s.drops.forEach((x, i) => Object.assign(this.drops[i]!, x));
    Object.assign(this.special, { ...s.special, p: [...s.special.p] });
    this.w.background = s.background;
    this.w.overlays.b = s.blur;
    this.starsInit = false;
    this.weatherInit = true;
    this.w.fx.style = 0;
  }

  // --- SpielMoveHintergrund ----------------------------------------------

  /** `SpielMoveHintergrund` (`0x50D490`), Sprungtabelle über `Me.7CC + 2`; läuft auch in der Nova. */
  moveBackground(): void {
    const w = this.w;
    const out = this.lists.bg;
    const rnd = w.rnd;
    this.clock += 16;
    switch (w.background) {
      case 1: {
        let x = f32(w.backgroundX - w.layer0Speed);
        if (x <= -800) x = f32(x + 800);
        w.backgroundX = x;
        out.rect("weiss", 0, 0, 800, 600, 0, 0, 0, 1);
        const size = w.spriteSize(this.bgKey) ?? { w: 800, h: 600 };
        const blit = (bx: number) => out.rect(this.bgKey, bx, 0, bx + size.w, size.h, 1, 1, 1, 1);
        if (x === 0) blit(0);
        else {
          blit(cint(x));
          blit(cint(x + 800));
        }
        return;
      }
      case 2:
        this.starfield();
        return;
      case 3:
        out.rect("weiss", 0, 0, 800, 550, 0.6, 0.6, 0.68, 0.5);
        w.fx.style = 1;
        return;
      case 4:
        this.plasma();
        return;
      case 5:
        this.sky();
        return;
      case 6:
        this.warp();
        return;
      case 0:
        // Beam-Spur/Nova: altes Bild bleibt, in Skyfight um 8 px nach links
        if (w.fx.style === 2) out.copy([[8, 0, 792, 600, 0, 0]]);
        out.rect("weiss", 0, 0, 800, 600, 0, 0, 0, 0.1);
        return;
      case -1:
        out.rect("weiss", 0, 0, 800, 600, 1, rnd.next() / 2, 0, 0.1);
        return;
      case -2:
        out.rect("weiss", 0, 0, 800, 600, 1, 1, 1, 0.1);
        return;
    }
  }

  /** Graustufen der Sterne nach Index: 0,25 / 0,5 / 0,75 / 1 / (i = 100) 1,25. */
  private static grey(i: number): number {
    return idiv(i, 25) / 4 + 0.25;
  }

  /** Modus 2: Sternfeld mit Nebel (`0x50E62D`). */
  private starfield(): void {
    const rnd = this.w.rnd;
    const out = this.lists.bg;
    if (this.starsInit) {
      this.stars.forEach((s, i) => {
        s.x = vbInt(rnd.next() * 800);
        s.y = vbInt(rnd.next() * 550) - 2;
        s.speed = f32(rnd.next() * 10 + 0.1);
        s.phase = 0;
        s.r = s.g = s.b = Environment.grey(i);
      });
      this.starsInit = false;
    }
    out.rect("weiss", 0, 0, 800, 600, 0, 0, 0, 1);
    const t = this.clock;
    for (let i = 0; i <= 9; i++) {
      const x = f32(Math.cos(t / 100000 + 2304 * i) * 32);
      const y = f32(Math.sin(t / 100000 + 3120 * i) * 32);
      const c = (k: number) => COS_DEG[degIndex(cint(t / 1000 + k * i))] ?? 0;
      out.rect("feuer0", x, y, x + 64, y + 64, c(643), c(9656), c(4743), 0.15);
    }
    out.capture("blur", 0, 0, 64, 64);
    out.rect("@blur", 0, 0, 800, 600, 1, 1, 1, 1, false, [0, 0, 64, 64]);
    for (const s of this.stars) {
      this.streak(s);
      s.x = f32(s.x - s.speed);
      if (s.x + 50 < 0) {
        s.x = f32(s.x + 850);
        s.y = vbInt(rnd.next() * 550) - 5;
        s.r = s.g = s.b = 1;
      }
    }
    this.blurStale = true;
  }

  /** Modus 6: Warp-Sterne, Tempo wächst mit der Levelzeit (`0x50D4FB`). */
  private warp(): void {
    const w = this.w;
    const rnd = w.rnd;
    if (this.starsInit) {
      this.stars.forEach((s, i) => {
        s.x = vbInt(rnd.next() * 800);
        s.y = vbInt(rnd.next() * 550) - 2;
        s.phase = 0;
        s.r = s.g = s.b = Environment.grey(i);
      });
      this.starsInit = false;
    }
    this.lists.bg.rect("weiss", 0, 0, 800, 600, 0, 0, 0, 1);
    this.stars.forEach((s, i) => {
      const max = idiv(i, 25) * 2 + 8;
      s.speed = idiv(w.tick - 50, 4);
      if (s.speed <= 1) s.speed = 1;
      if (s.speed > max) s.speed = max;
      this.streak(s);
      s.x = f32(s.x - s.speed);
      if (s.x + 50 < 0) {
        s.x = f32(s.x + 850);
        s.y = vbInt(rnd.next() * 550) - 5;
        s.r = s.g = s.b = 1;
      }
    });
  }

  /** Strich eines Sterns: 2 px hoch, nach rechts ausblendend (`balken`, normal). */
  private streak(s: Star): void {
    const x2 = s.x + 5 * s.speed + 2;
    const on = { r: s.r, g: s.g, b: s.b, a: 1 };
    const off = { r: s.r, g: s.g, b: s.b, a: 0 };
    this.lists.bg.strip("balken", [
      { x: s.x, y: s.y + 1, u: 0, v: 1, ...on },
      { x: s.x, y: s.y - 1, u: 0, v: 0, ...on },
      { x: x2, y: s.y + 1, u: 1, v: 1, ...off },
      { x: x2, y: s.y - 1, u: 1, v: 0, ...off },
    ]);
  }

  /** Flecken der Modi 4 und 5 auslegen (5 `Rnd` je Fleck) und je Tick bewegen. */
  private blobs(speedScale: number, speedBase: number): void {
    const rnd = this.w.rnd;
    if (this.starsInit) {
      for (const s of this.stars) {
        s.phase = f32(rnd.next() * 100);
        s.speed = f32(rnd.next() * speedScale + speedBase);
        s.r = f32(rnd.next() * 2 - 1);
        s.g = f32(rnd.next() * 2 - 1);
        s.b = f32(rnd.next() / 10);
      }
      this.starsInit = false;
    }
    for (const s of this.stars) {
      s.phase = f32(s.speed + s.phase);
      s.x = f32(32 * Math.sin(s.phase * s.r));
      s.y = f32(32 * Math.sin(s.phase * s.g));
    }
  }

  /** Modus 5: Himmel mit Wolken und Abendrot (`0x50D9C4`, Skyfight), 32-Bit-Zweig. */
  private sky(): void {
    const w = this.w;
    const out = this.lists.bg;
    this.blobs(0.02, 0.04);
    out.rect("weiss", 0, 0, 64, 64, 0.1, 0.2, 0.6, 1);
    for (const s of this.stars) out.rect("feuer0", s.x, s.y, s.x + 64, s.y + 64, 1, 1, 1, s.b);
    out.capture("blur", 0, 0, 64, 64);
    out.rect("@blur", 0, 0, 800, 550, 1, 1, 1, 1, false, [0, 0, 64, 64]);
    const t = w.tick;
    out.rect("balken", 0, 200 - t / 10, 800, 900 + t / 10, 1, 0.5, 0.25, (2 * t) / w.levelLength);
    this.blurStale = true;
    w.fx.style = 2;
  }

  /** Modus 4: rotes Plasma (`0x50E0A6`, nur Speicherbildschirm). */
  private plasma(): void {
    const out = this.lists.bg;
    this.blobs(0.05, 0);
    out.rect("weiss", 0, 0, 800, 600, 0, 0, 0, 1);
    for (const s of this.stars) out.rect("a_kreis2", s.x, s.y, s.x + 64, s.y + 64, 1, 0, 0, s.b);
    out.capture("blur", 0, 0, 64, 64);
    out.rect("@blur", 0, 0, 800, 600, 1, 1, 1, 1, false, [0, 0, 64, 64]);
    this.blurStale = true;
  }

  // --- Wetter --------------------------------------------------------------

  /** `SpielRegen` (`0x536970`): Tropfen mit Spritzern; ab 500 übernimmt `SpielSchnee`. */
  rain(): void {
    const w = this.w;
    const n = this.level.weatherParticles;
    if (w.nova || n <= 0) return;
    if (n >= 500) {
      w.fx.style = 3;
      return;
    }
    const rnd = w.rnd;
    const out = this.lists.rain;
    const water = 545 - this.level.waterHeight;
    for (const d of this.drops) {
      if (d.x === 0 && d.y === 0) {
        d.x = vbInt(rnd.next() * 800) + 1;
        d.y = vbInt(rnd.next() * 550) + 1;
        d.vx = (vbInt(rnd.next() * 3) - 1) / 2;
        d.vy = vbInt(rnd.next() * 3) + 8;
      }
      d.y = f32(d.vy + d.y);
      d.x = f32(d.vx + d.x);
      let z = 0;
      if (d.x < 0 || d.x > 800 || d.y > 550) z = 1;
      else if (d.y > water) z = 2;
      for (const p of w.players) {
        if (z === 0 && p.x + 64 > d.x && p.y + 54 > d.y && p.x < d.x + d.vx && p.y + 17 < d.y + 15)
          z = 2;
      }
      if (z === 0 && w.terrain(cint(d.x), cint(d.y), cint(d.x + d.vx), cint(d.y + 19))) z = 2;
      if (z === 2) {
        if (w.background > 0) {
          for (let k = 0; k <= 6; k++) {
            const vx = vbInt(rnd.next() * 3) - 1;
            w.fx.addSpark1(0, d.x + d.vx, d.y + 9, vx, -2, 0.7, 0.7, 0.7, 1, 5);
          }
        }
        z = 1;
      }
      if (z > 0) {
        d.x = vbInt(rnd.next() * 800) + 1;
        d.y = -15;
        d.vx = (vbInt(rnd.next() * 3) - 1) / 2;
        d.vy = vbInt(rnd.next() * 3) + 8;
      } else if (w.background > 0)
        out.cross("balken", d.x - 2, d.y, d.x + 2, d.y + 19, 1, 1, 1, 0.2);
    }
  }

  /**
   * `SpielSchnee` (`0x537150`): Stil 1 Schnee (Eis), 2 Wolken (Himmel), 3
   * Regenschleier (Starkregen); jeder Stil dreht zuerst den Windwinkel (1 `Rnd`).
   */
  snow(): void {
    const w = this.w;
    const style = w.fx.style;
    if (w.nova || style <= 0 || w.background <= 0) return;
    if (style !== 1 && style !== 2 && style !== 3) return;
    const rnd = w.rnd;
    const out = this.lists.weather;
    this.wind = f32(this.wind + rnd.next() * 3);
    while (this.wind >= 360) this.wind = f32(this.wind - 360);
    const sin = SIN_DEG[degIndex(cint(this.wind))] ?? 0;
    const init = this.weatherInit;
    if (style === 1) {
      for (let j = 0; j <= 2; j++) {
        for (let i = 0; i <= 19; i++) {
          const c = this.veils[3 * i + j]!;
          const home = () => {
            c.x = (i % 5) * 256;
            c.vx = (2 * j - 6) / 2;
            c.vy = (7 - 2 * j) / 2 + 2;
          };
          if (init) {
            home();
            c.y = idiv(i, 5) * 256;
          }
          if (c.y >= 768) {
            home();
            c.y = f32(c.y - 1024);
          }
          c.x = f32(c.vx + c.x - ((3 - j) * sin) / 2);
          c.y = f32(c.vy + c.y);
          out.rect(`schnee${j + 1}`, c.x, c.y, c.x + 256, c.y + 256, 1, 1, 1, 0.8, true);
        }
      }
    } else if (style === 2) {
      for (let j = 0; j <= 2; j++) {
        for (let i = 0; i <= 19; i++) {
          const c = this.veils[3 * i + j]!;
          if (init) {
            c.x = f32(rnd.next() * 800);
            c.y = f32(rnd.next() * 600 - 50);
            c.vx = f32(-5 - rnd.next() * 10);
            c.vy = f32(rnd.next() - 0.5);
          }
          if (c.x < -(300 + 20 * j)) {
            c.x = 800;
            c.y = f32(rnd.next() * 600 - 50);
            c.vx = f32(-5 - rnd.next() * 10);
            c.vy = f32(rnd.next() - 0.5);
          }
          c.x = f32(c.vx + c.x);
          c.y = f32(c.vy + c.y);
          out.rect("feuer0", c.x, c.y - 50, c.x + 300 + 50 * j, c.y + 100, 1, 1, 1, 0.3);
        }
      }
    } else {
      for (let j = 0; j <= 1; j++) {
        for (let i = 0; i <= 19; i++) {
          const c = this.veils[3 * i + j]!;
          if (init) {
            c.x = ((i % 5) - j) * 256;
            c.y = idiv(i, 5) * 256;
            c.vx = 4 * j - 7;
            c.vy = 2 * j + 7;
          }
          if (this.soundOn) w.loop("rain", true);
          if (c.x < -256) c.x = f32(c.x + 1280);
          if (c.x > 1024) c.x = f32(c.x - 1280);
          if (c.y >= 768) {
            c.y = f32(c.y - 1024);
            c.vx = 4 * j - 7;
            c.vy = 2 * j + 7;
          }
          c.x = f32(c.vx + c.x - j * sin);
          c.y = f32(c.vy + c.y);
          out.rect("regen1", c.x, c.y, c.x + 256, c.y + 256, 1, 1, 1, 0.4, true);
        }
      }
    }
    this.weatherInit = false;
  }

  // --- Wasser ----------------------------------------------------------------

  /**
   * `SpielWasser` (`0x533390`): Wellenverzerrung des Bildes, Oberfläche,
   * Blasen und Spritzer an Schiffen, Drohnen, Force, Gegnern und Beam,
   * Schwebeteilchen. Im Original alles nur beim Zeichnen.
   */
  water(): void {
    const w = this.w;
    const W = this.level.waterHeight;
    if (w.nova || W <= 0) return;
    const rnd = w.rnd;
    const out = this.lists.water;
    const t = w.tick;
    const line = 550 - W;
    if (W > 100) {
      const rects: [number, number, number, number, number, number][] = [];
      let y = line;
      do {
        const h = 550 - y <= 15 ? 550 - y : cint(rnd.next() * 5) + 10;
        const s = SIN_DEG[degIndex(y + 2 * t)] ?? 0;
        const o = W === 550 ? cint(s * 5) : cint((idiv(550 - y - W, 50) + 1) * s);
        if (o < 0) rects.push([-o, y, 800 + o, h, 0, y]);
        if (o > 0) rects.push([0, y, 800 - o, h, o, y]);
        y += h;
      } while (y !== 550);
      out.copy(rects);
    }
    if (w.background === 0) return;
    this.surface(W);
    if (W !== 550) {
      this.touches(W);
    } else {
      for (const p of w.players) {
        if (rnd.next() < 0.01) {
          const f = rnd.next();
          const n = cint(rnd.next() * 10 + 8);
          w.fx.addBubble(64 * f + p.x, p.y + 10, n);
        }
      }
    }
    if (t % 3 === 0) {
      const lv = this.level;
      for (let k = 0; k <= idiv(W, 20); k++) {
        const r1 = rnd.next();
        const r2 = rnd.next();
        const r3 = rnd.next();
        const r4 = rnd.next();
        // Blau aus top.g, wie im Original
        w.fx.addBig(
          r1 * 784,
          (W - 50) * r2 + line + 45,
          2 * r3 - 1,
          -r4,
          lv.waterTopRed,
          lv.waterTopGreen,
          lv.waterTopGreen,
          4,
          0,
          50,
          1,
          0,
        );
      }
    }
  }

  /** Wasseroberfläche: zwei Bänder aus `weiss`, je zwei wogende Hälften. */
  private surface(W: number): void {
    const lv = this.level;
    const t = this.w.tick;
    const a = 6 * (COS_DEG[degIndex(2 * t)] ?? 0);
    const b = 6 * (SIN_DEG[degIndex(2 * t)] ?? 0);
    const top = [lv.waterTopRed, lv.waterTopGreen, lv.waterTopBlue] as const;
    const bottom = [lv.waterBottomRed, lv.waterBottomGreen, lv.waterBottomBlue] as const;
    const out = this.lists.water;
    const l1 = 543 - W;
    const l2 = 550 - W;
    // v0 unten links, v1 oben links, v2 unten rechts, v3 oben rechts
    out.strip("weiss", [
      cv(0, l2 - a, top, 0.4),
      cv(0, l1 - a, top, 0),
      cv(400, l2 - b, top, 0.4),
      cv(400, l1 - b, top, 0),
    ]);
    out.strip("weiss", [
      cv(400, l2 - b, top, 0.4),
      cv(400, l1 - b, top, 0),
      cv(800, l2 - a, top, 0.4),
      cv(800, l1 - a, top, 0),
    ]);
    out.strip("weiss", [
      cv(0, 550, bottom, 0.4),
      cv(0, l2 - a, top, 0.4),
      cv(400, 550, bottom, 0.4),
      cv(400, l2 - b, top, 0.4),
    ]);
    out.strip("weiss", [
      cv(400, 550, bottom, 0.4),
      cv(400, l2 - b, top, 0.4),
      cv(800, 550, bottom, 0.4),
      cv(800, l2 - a, top, 0.4),
    ]);
  }

  /** Berührungen der Wasserlinie (nur bei `W ≠ 550`). */
  private touches(W: number): void {
    const w = this.w;
    const rnd = w.rnd;
    const fx = w.fx;
    const line = 550 - W;
    /** Spritzer (additive Glut) bei `scale · Rnd + off`, Tempo ±0,5. */
    const splash = (scale: number, off: number, y: number, size: number, life: number) => {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      fx.addBig(scale * r1 + off, y, r2 - 0.5, r3 - 0.5, 1, 1, 1, size, 0, life, 1, 0);
    };
    for (const p of w.players) {
      let touch = false;
      if (line < p.y + 54) {
        if (rnd.next() < 0.01) {
          const f = rnd.next();
          const n = cint(rnd.next() * 10 + 8);
          fx.addBubble(64 * f + p.x, p.y + 10, n);
        }
        if (line > p.y + 17) {
          const r1 = rnd.next();
          const r2 = rnd.next();
          const r3 = rnd.next();
          fx.addBig(
            64 * r1 + p.x - 16,
            542 - W,
            r2 / 2 - 0.25,
            r3 / 2 - 0.25,
            1,
            1,
            1,
            16,
            0,
            40,
            1,
            0,
          );
          touch = true;
        }
      }
      if (touch) {
        if (!this.waterTouch && this.soundOn) w.loop("water_touch", true);
        this.waterTouch = true;
      } else {
        if (this.waterTouch && this.soundOn) w.loop("water_touch", false);
        this.waterTouch = false;
      }
    }
    if (w.playersMinus1 === 1 || w.players[0]?.shipType === 0) {
      for (const d of w.particles) {
        if (d.present && d.y + 8 < line && line < d.y + 24) splash(16, d.x, 542 - W, 16, 10);
      }
    }
    const f = w.force;
    if (f.present && f.y + 8 < line && line < f.y + 55) splash(32, f.x, 534 - W, 32, 3);
    const en = w.enemies;
    for (let i = 0; i <= en.high; i++) {
      const e = en.items[i];
      if (!e?.alive || e.def.solid !== 0) continue;
      const a = e.actor;
      if (!(line < a.y + a.height)) continue;
      if (rnd.next() < 0.01) {
        const n = cint(rnd.next() * 10 + 8);
        fx.addBubble(a.x + a.width - 10, a.y + 10, n);
      }
      if (line > a.y) {
        for (let k = 0; k <= idiv(a.width, 65); k++) splash(a.width, a.x - 16, 534 - W, 32, 20);
      }
    }
    for (const b of w.beams) {
      if (!b.running || b.type !== 0 || !(line < b.width + b.originY)) continue;
      for (let k = 0; k <= 1; k++) {
        const r1 = rnd.next();
        const r2 = rnd.next();
        const n = cint(rnd.next() * 10 + 8);
        fx.addBubble(r1 * 25 + b.tipX, (r2 * b.width) / 2 + b.tipY, n);
      }
      if (line > b.tipY) {
        for (let k = 0; k <= 1; k++) splash(25, b.tipX - 16, 534 - W, 32, 10);
      }
    }
  }

  // --- Hupe -----------------------------------------------------------------

  /** `SpielHupe` (`0x533150`): F11 hupt 40 Ticks lang (nur Spieler 1, auch in der Nova). */
  hupe(): void {
    const w = this.w;
    const p = w.players[0];
    if (this.hornTicks > 0) {
      this.hornTicks--;
      if (p)
        this.lists.hupe.rect("hupe", p.x + 55, p.y - 32, p.x + 183, p.y + 96, 1, 1, 1, 1, true);
    }
    if (w.horn) {
      if (!this.hornHeld) {
        this.hornHeld = true;
        if (this.hornTicks === 0) {
          this.hornTicks = 40;
          if (this.soundOn) w.sound("hupe");
        }
      }
    } else this.hornHeld = false;
  }

  // --- OverlayEffekte ---------------------------------------------------------

  /**
   * `OverlayEffekte(Me.6EC)` (`0x538260`): Glühen (`Me.508`, additiv,
   * vergrößert) und Unschärfe (`Me.506`) aus dem auf 64×64 erfassten Bild
   * mit Rückkopplung, Standbild-Überblendung (`Blenden`), Checkpoint- bzw.
   * Wiedergeburts-Überblendung des Standbilds, Erfassen für den nächsten
   * Tick, dann das Rauschen.
   */
  overlay(): void {
    const w = this.w;
    const o = w.overlays;
    const out = this.lists.overlay;
    const fetch = () => {
      if (this.blurStale) out.capture("blur", 0, 0, 800, 550);
      this.captureBlur = true;
      this.blurStale = false;
    };
    o.alphaA = ramp(o.a, o.alphaA);
    if (o.alphaA > 0) {
      fetch();
      out.rect("@blur", -50, -50, 850, 600, 1, 1, 1, o.alphaA, true, [0, 0, 64, 64]);
    }
    o.alphaB = ramp(o.b, o.alphaB);
    if (o.alphaB > 0) {
      fetch();
      out.rect("@blur", 0, 0, 800, 550, 1, 1, 1, o.alphaB, false, [0, 0, 64, 64]);
    }
    if (!o.a && !o.b) this.blurStale = true;
    const still = (a: number) =>
      out.rect("@still", 0, 0, 800, 550, 1, 1, 1, a, false, [0, 0, 800, 550]);
    if (this.stillFade) {
      if (this.stillAlpha === 0) this.stillAlpha = 1;
      else {
        this.stillAlpha = f32(this.stillAlpha - 0.05);
        if (this.stillAlpha <= 0) {
          this.stillAlpha = 0;
          this.stillFade = false;
        }
        still(this.stillAlpha);
      }
    }
    const capture = w.stillCapture || this.blend;
    const c = w.checkpoint;
    if (c.triggered && c.flashStep !== 0 && !capture) {
      c.flashAlpha = f32(c.flashAlpha + c.flashStep);
      if (c.flashAlpha <= 0) {
        c.flashStep = 0;
        c.flashAlpha = 0;
      }
      still(c.flashAlpha);
    }
    if (this.captureBlur) out.capture("blur", 0, 0, 800, 550);
    if (capture) out.capture("still", 0, 0, 800, 550);
    this.makeSomeNoise(this.noise);
  }

  /** `MakeSomeNoise(α)` (`0x4FEBC0`): 4 × 3 Kacheln `noise` mit zufälligem, gespiegeltem Ausschnitt, 48 `Rnd`. */
  private makeSomeNoise(alpha: number): void {
    if (!(alpha > 0)) return;
    const rnd = this.w.rnd;
    const out = this.lists.overlay;
    for (let gx = 0; gx <= 3; gx++) {
      for (let gy = 0; gy <= 2; gy++) {
        const sx = cint(rnd.next() * 255);
        const sy = cint(rnd.next() * 255);
        const sx2 = cint((vbInt(rnd.next() * 2) * 2 - 1) * 255 + sx);
        const sy2 = cint((vbInt(rnd.next() * 2) * 2 - 1) * 255 + sy);
        out.rect(
          "@noise",
          256 * gx,
          256 * gy,
          256 * (gx + 1),
          256 * (gy + 1),
          1,
          1,
          1,
          alpha,
          false,
          [sx, sy, sx2, sy2],
        );
      }
    }
  }
}
