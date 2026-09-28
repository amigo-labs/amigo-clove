import type { AtlasJson, AtlasSprite } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { Container, Graphics, Rectangle, Texture } from "pixi.js";
import type { DrawList, DrawSlot } from "../sim/effects";
import type { Enemy } from "../sim/enemies";
import { LAYER_COUNT } from "../sim/layers";
import type { Surface } from "../sim/surfaces";
import { idiv } from "../sim/vb";
import type { World } from "../sim/world";
import { SpriteBatch } from "./SpriteBatch";

/**
 * Zeichnet den DoveZ-Weltzustand in der Reihenfolge von `SpielLoop`:
 * Hintergrund → Ebenen 0, 1, 2, 5 (je mit ihren Animationen) → Abgas →
 * Spielerschüsse Ebene 0 → Funken 0 → Power-ups → Schiff → Gegner (mit den
 * Linien und Trümmern ihrer Todeszustände) → Blasen → Animationen 4 →
 * Landschaft 3 → Spielerschüsse 1 → Animationen 3 → Funken 1 → große
 * Partikel → Gegnerschüsse → Punkte-Popups → Ebene 6 → Wackeln → HUD.
 * Die Effekte kommen als Zeichenlisten aus der Simulation (`sim/effects.ts`).
 */

interface AtlasRef {
  readonly json: AtlasJson;
}

/** HUD-Positionen (links oben) je Element, 1 Spieler. */
const HUD_1P = {
  score: [743, 578],
  energy: [152, 556],
  speed: [623, 565],
  power: [587, 566],
  extra: [647, 569],
} as const;
/** 2 Spieler: je Spieler eine Zeile mit den kleinen `interface3_*`-Bildern. */
const HUD_2P = [
  {
    score: [740, 565],
    energy: [158, 548],
    speed: [626, 565],
    power: [582, 566],
    extra: [659, 566],
  },
  {
    score: [740, 581],
    energy: [158, 575],
    speed: [626, 581],
    power: [594, 583],
    extra: [659, 583],
  },
] as const;
/** Waffenfeld von Schiff 0 (vier Partikel-Slots). */
const PARTICLE_SLOTS = [
  [385, 559],
  [385, 577],
  [460, 559],
  [460, 577],
] as const;

/** Balken-Textur (`Balken.bmp`, 128²) für `Linie` und `Blitz`. */
const BAR = "balken";
/** Farbverlauf einer Linie in so vielen Stücken. */
const GRADIENT_STEPS = 4;

export class Renderer {
  readonly root = new Container();
  /** Spielfeld (ohne HUD); das Wackeln verschiebt es. */
  private readonly field = new Container();
  private readonly batches = new Map<string, SpriteBatch>();
  private readonly frames = new Map<string, Texture>();
  private readonly overlay = new Graphics();
  /** HUD (`SpielDisplay`) über dem Spielfeld, nicht gewackelt, nicht abgeblendet. */
  private readonly hud: SpriteBatch;
  private readonly bgFill = new Graphics();
  /** Abblende-Schwarz über dem Spielfeld (Alpha je Frame). */
  private readonly fade = new Graphics().rect(0, 0, 800, 550).fill(0x000000);
  private frameNo = 0;

  constructor(
    private readonly textures: TextureRegistry,
    private readonly world: World,
    /** Level-Atlas zuerst, dann `spiel`, `standart`. */
    private readonly atlases: readonly AtlasRef[],
  ) {
    this.root.addChild(this.field);
    this.field.addChild(this.bgFill);
    for (const name of [
      "background",
      "layer0",
      "anim0",
      "layer1",
      "anim1",
      "layer2",
      "anim2",
      "layer5",
      "anim5",
      "fx:gate0",
      "fx:exhaust",
      "shots0",
      "fx:sparks0",
      "specials",
      "player",
      "enemies",
      "fx:enemies",
      "fx:bubbles",
      "anim4",
      "layer3",
      "shots1",
      "anim3",
      "fx:sparks1",
      "fx:big",
      "eshots",
      "fx:popups",
      "fx:gate1",
      "layer6",
      "anim6",
      "fx:flash",
    ]) {
      const c = new Container();
      this.field.addChild(c);
      this.batches.set(name, new SpriteBatch(c));
    }
    this.field.addChild(this.overlay);
    this.root.addChild(this.fade);
    const hud = new Container();
    this.root.addChild(hud);
    this.hud = new SpriteBatch(hud);
  }

  /** Alle Seiten-IDs der Atlanten. */
  static pageIds(atlases: readonly AtlasRef[]): string[] {
    return [...new Set(atlases.flatMap((a) => a.json.pages))];
  }

  private sprite(key: string): { atlas: AtlasRef; s: AtlasSprite } | undefined {
    for (const atlas of this.atlases) {
      const s = atlas.json.sprites[key];
      if (s) return { atlas, s };
    }
    return undefined;
  }

  /** Textur eines Atlas-Sprites, optional mit Ausschnitt (x, y, w, h im BMP). */
  private texture(key: string, rx = 0, ry = 0, rw = -1, rh = -1): Texture | undefined {
    const id = `${key}|${rx},${ry},${rw},${rh}`;
    let t = this.frames.get(id);
    if (t) return t;
    const found = this.sprite(key);
    if (!found) return undefined;
    const { atlas, s } = found;
    const w = rw < 0 ? s.w : Math.min(rw, s.w - rx);
    const h = rh < 0 ? s.h : Math.min(rh, s.h - ry);
    if (w <= 0 || h <= 0) return undefined;
    const page = atlas.json.pages[s.page]!;
    t = new Texture({
      source: this.textures.get(page).source,
      frame: new Rectangle(s.x + rx, s.y + ry, w, h),
    });
    this.frames.set(id, t);
    return t;
  }

  private surfaceTexture(s: Surface | undefined): Texture | undefined {
    if (!s || !s.key) return undefined;
    return this.texture(s.key, s.rect.x, s.rect.y, s.rect.w, s.rect.h);
  }

  private batch(name: string): SpriteBatch {
    return this.batches.get(name)!;
  }

  draw(): void {
    const w = this.world;
    this.frameNo++;
    for (const b of this.batches.values()) b.begin();
    this.hud.begin();
    this.overlay.clear();
    this.drawBackground();
    for (let l = 0; l < LAYER_COUNT; l++) this.drawTiles(l);
    for (let l = 0; l < LAYER_COUNT; l++) this.drawAnims(l);
    this.drawPlayerShots(0, "shots0");
    this.drawPlayerShots(1, "shots1");
    this.drawSpecials();
    this.drawPlayers();
    this.drawEnemies();
    this.drawEnemyShots();
    for (const [slot, list] of Object.entries(w.fx.lists)) this.drawList(slot as DrawSlot, list);
    this.field.position.set(-w.fx.shakeX, -w.fx.shakeY);
    // Abblenden in den letzten 50 Ticks
    const left = w.level.levelLength - w.tick;
    this.fade.alpha = left < 50 ? (50 - left) / 50 : 0;
    this.drawHud();
    for (const b of this.batches.values()) b.end();
    this.hud.end();
  }

  private drawBackground(): void {
    const w = this.world;
    this.bgFill.clear();
    const color = w.background === 5 ? 0x6b87b3 : w.background === 3 ? 0x999aad : 0x000000;
    this.bgFill.rect(0, 0, 800, 550).fill(color);
    if (w.background !== 1) return;
    const key = w.level.background.toLowerCase().replace(/\.bmp$/, "");
    const t = this.texture(key);
    if (!t) return;
    const b = this.batch("background");
    const x = Math.trunc(w.backgroundX);
    b.put(t, x, 0);
    if (x !== 0) b.put(t, x + 800, 0);
  }

  private drawTiles(l: number): void {
    const w = this.world;
    const layer = w.layers[l]!;
    const b = this.batch(`layer${l}`);
    if (!b) return;
    for (let i = 0; i <= layer.highWater; i++) {
      const t = layer.tiles[i]!;
      if (!t.active) continue;
      const s = w.surfaces[t.group]?.[w.groupFrames[t.group]?.frame ?? 0];
      const tex = this.surfaceTexture(s);
      if (tex) b.put(tex, Math.floor(t.x), Math.floor(t.y));
    }
  }

  private drawAnims(l: number): void {
    const w = this.world;
    const b = this.batch(`anim${l}`);
    if (!b) return;
    for (const inst of w.anims.items) {
      if (!inst.active || inst.layer !== l) continue;
      const a = w.anims.anims[inst.anim]!;
      a.tracks.forEach((track, i) => {
        const st = inst.states[i]!;
        if (!st.visible) return;
        const s = w.surfaces[track.group]?.[st.frame];
        const tex = this.surfaceTexture(s);
        if (!tex) return;
        const d3d = (w.level.groups[track.group]?.d3d ?? 0) !== 0;
        const x = inst.originX + st.x;
        const y = inst.originY + st.y;
        if (d3d) {
          b.put(tex, x, y, {
            red: st.red,
            green: st.green,
            blue: st.blue,
            alpha: st.alpha,
            scaleX: st.scaleX,
            scaleY: st.scaleY,
            rotation: st.rotation,
            additive: (a.tracks[i]!.keys[st.key]?.additive ?? 0) !== 0,
          });
        } else {
          b.put(tex, Math.floor(x), Math.floor(y), { scaleX: st.scaleX, scaleY: st.scaleY });
        }
      });
    }
  }

  private drawEnemies(): void {
    const w = this.world;
    const b = this.batch("enemies");
    for (let i = 0; i <= w.enemies.high; i++) {
      const e = w.enemies.items[i];
      if (!e?.alive) continue;
      this.drawEnemy(e, b);
    }
  }

  private drawEnemy(e: Enemy, b: SpriteBatch): void {
    const w = this.world;
    for (const p of e.parts) {
      if (!p.visible) continue;
      const s = w.enemies.surface(p);
      const tex = this.surfaceTexture(s);
      if (!tex) continue;
      const [x, y] = w.enemies.partPos(e, p);
      const d3d = (w.level.groups[p.def.group]?.d3d ?? 0) !== 0;
      const dying = e.inState;
      if (d3d) {
        const o = {
          red: p.red,
          green: p.green,
          blue: p.blue,
          alpha: p.alpha,
          rotation: p.rotation,
        };
        b.put(tex, x, y, o);
        if (p.flash > 0 && !dying) b.put(tex, x, y, { ...o, additive: true });
      } else {
        const flash = p.flash > 0 && !dying && p.def.armored === 0;
        b.put(tex, Math.floor(x), Math.floor(y), flash ? { red: 1, green: 0.5, blue: 0.5 } : {});
      }
    }
  }

  /** Zeichenliste der Effekte: gestreckte Rechtecke und Balken-Linien. */
  private drawList(slot: DrawSlot, list: DrawList): void {
    const b = this.batch(`fx:${slot}`);
    for (const q of list.quads) {
      const tex = q.surface ? this.surfaceTexture(q.surface) : this.texture(q.key);
      if (!tex) continue;
      const fw = tex.frame.width;
      const fh = tex.frame.height;
      b.put(tex, (q.x1 + q.x2) / 2 - fw / 2, (q.y1 + q.y2) / 2 - fh / 2, {
        red: q.r,
        green: q.g,
        blue: q.b,
        alpha: q.a,
        scaleX: (q.x2 - q.x1) / fw,
        scaleY: (q.y2 - q.y1) / fh,
        rotation: q.rot,
        additive: q.additive,
      });
    }
    const bar = this.texture(BAR);
    if (!bar) return;
    for (const l of list.segments) {
      const dx = l.x2 - l.x1;
      const dy = l.y2 - l.y1;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const step = len / GRADIENT_STEPS;
      for (let k = 0; k < GRADIENT_STEPS; k++) {
        const f = (k + 0.5) / GRADIENT_STEPS;
        const mix = (i: 0 | 1 | 2 | 3) => l.c1[i] + (l.c2[i] - l.c1[i]) * f;
        const cx = l.x1 + dx * f;
        const cy = l.y1 + dy * f;
        b.put(bar, cx - bar.frame.width / 2, cy - bar.frame.height / 2, {
          red: mix(0),
          green: mix(1),
          blue: mix(2),
          alpha: mix(3),
          scaleX: step / bar.frame.width,
          scaleY: (2 * l.w) / bar.frame.height,
          rotation: angle,
          additive: l.additive,
        });
      }
    }
  }

  private drawEnemyShots(): void {
    const w = this.world;
    const b = this.batch("eshots");
    for (const s of w.fire.shots) {
      if (!s.active) continue;
      const type = w.level.shots[s.shotType];
      const a = s.actor;
      if (!type || type.kind === 0) {
        // eingebaute Kugel (`GSchuss1/2`), Bild wechselt jeden Tick
        const tex = this.texture(w.tick % 2 === 0 ? "gschuss1" : "gschuss2");
        if (tex) b.put(tex, a.x, a.y);
        continue;
      }
      const tex = this.surfaceTexture(
        w.surfaces[type.group]?.[w.groupFrames[type.group]?.frame ?? 0],
      );
      if (!tex) continue;
      const rotation =
        type.rotate !== 0 ? (Math.atan2(a.vy || s.vy, a.vx || s.vx) * 180) / Math.PI : 0;
      b.put(tex, a.x, a.y, {
        red: type.red,
        green: type.green,
        blue: type.blue,
        rotation,
        additive: type.additive !== 0,
      });
    }
  }

  private drawPlayerShots(layer: 0 | 1, batch: string): void {
    const w = this.world;
    const b = this.batch(batch);
    const keys = ["ballschuss", "ballschuss2", "ballschuss3", "ballschuss4"];
    for (let i = 0; i <= w.playerShots[layer].high; i++) {
      const s = w.playerShots[layer].shots[i]!;
      if (!s.active) continue;
      const kind = s.type >= 0 ? s.type : Math.abs(s.type) + 1;
      const tex = this.texture(keys[kind] ?? keys[0]!);
      if (tex) b.put(tex, Math.floor(s.x), Math.floor(s.y));
    }
  }

  private drawSpecials(): void {
    const w = this.world;
    const b = this.batch("specials");
    for (const s of w.specials) {
      if (!s.active) continue;
      const key =
        s.subtype === 0
          ? `extra${s.item}${s.frame}`
          : s.subtype === 4
            ? `p2extra${s.item}${s.frame}`
            : `pow${s.item}${s.frame}`;
      const tex = this.texture(key);
      if (tex) b.put(tex, Math.round(s.x), Math.round(s.y));
    }
  }

  private drawPlayers(): void {
    const w = this.world;
    const b = this.batch("player");
    for (const p of w.players) {
      if (!p.alive) continue;
      if (p.invulnerable > 0 && p.invulnerable <= 10 && this.frameNo % 2 === 1) continue;
      const tex = this.texture(`dove${p.shipType}${p.tilt + 1}${p.animFrame + 1}`);
      if (!tex) continue;
      b.put(tex, Math.floor(p.x), Math.floor(p.y));
      if (p.invulnerable > 0)
        b.put(tex, Math.floor(p.x), Math.floor(p.y), {
          red: 0.3,
          green: 1,
          blue: 0.3,
          alpha: 0.4,
          additive: true,
        });
    }
  }

  /** Atlas-Bild mit Farbschlüssel an (x, y), optional nur der Ausschnitt (rx, ry, rw, rh). */
  private hudPut(
    key: string,
    x: number,
    y: number,
    rx = 0,
    ry = 0,
    rw = -1,
    rh = -1,
    additive = false,
  ): void {
    const t = this.texture(key, rx, ry, rw, rh);
    if (t) this.hud.put(t, x, y, { additive });
  }

  /** Ziffern `n0`–`n9` von rechts nach links; Ziffer k (0 = letzte) bei x + 4·Länge − 8k. */
  private hudNumber(v: number, x: number, y: number): void {
    const str = String(Math.max(0, Math.trunc(v)));
    for (let k = 0; k < str.length; k++) {
      this.hudPut(`n${str[str.length - 1 - k]}`, x + 4 * str.length - 8 * k, y);
    }
  }

  /**
   * `SpielDisplay` (`0x510E10`): Grundbild bei (0, 525), Lebensziffer,
   * je Spieler Punkte, Energie-, Beam-, Tempo- und Schussstärke-Anzeige,
   * Extrawaffe und das Waffenfeld. Tabellen: `docs/measurements/dovez-runtime.md` („HUD“).
   */
  private drawHud(): void {
    const w = this.world;
    const two = w.playersMinus1 === 1;
    const set = two ? 3 : (w.players[0]?.shipType ?? 0);
    const i = `interface${set}`;
    const black = this.texture("weiss");
    if (black) {
      this.hud.put(black, 399, 574, { red: 0, green: 0, blue: 0, scaleX: 400, scaleY: 25 });
      this.hud.put(black, 41, 569, { red: 0, green: 0, blue: 0, scaleX: 42, scaleY: 30 });
    }
    this.hudPut(`${i}_grund`, 0, 525);
    const lives = Math.min(Math.max(w.lives, 0), 9);
    this.hudPut(`leben${lives}`, 122, 555);
    if (!two) this.hudPut(`${i}_spec1`, 122, 562, 0, 0, -1, -1, true);
    if (w.lifePulse > 0) {
      const g = 2 * (25 - idiv(w.lifePulse, 2));
      const glow = this.texture("a_kreis2");
      if (glow) {
        this.hud.put(glow, 122 - 2 * g + (15 + 4 * g) / 2 - 32, 555 - g + (35 + 2 * g) / 2 - 32, {
          scaleX: (15 + 4 * g) / 64,
          scaleY: (35 + 2 * g) / 64,
          alpha: (w.lifePulse * 0.5) / 50,
          additive: true,
        });
      }
      const digit = this.texture(`leben${lives}`);
      if (digit && w.lifePulse > 25) {
        const g2 = w.lifePulse - 25;
        this.hud.put(
          digit,
          122 - g2 + (15 + 2 * g2) / 2 - 7.5,
          555 - g2 + (35 + 2 * g2) / 2 - 17.5,
          {
            scaleX: (15 + 2 * g2) / 15,
            scaleY: (35 + 2 * g2) / 35,
          },
        );
      }
    }
    w.players.forEach((p, n) => {
      const L = two ? HUD_2P[n]! : HUD_1P;
      this.hudNumber(w.shownScore[n] ?? 0, L.score[0], L.score[1]);
      const energy = this.sprite(`${i}_energy`)?.s;
      if (energy) {
        const right = Math.max(0, Math.min(energy.w, idiv(p.energy * energy.w, p.maxEnergy)));
        if (right > 0) this.hudPut(`${i}_energy`, L.energy[0], L.energy[1], 0, 0, right, energy.h);
      }
      if (!two) {
        this.hudPut(`${i}_spec0`, 175, 559, 0, 0, -1, -1, true);
        this.hudPut(`${i}_spec0`, 195, 582, 0, 0, -1, -1, true);
      }
      const gauge = this.sprite(`${i}_s`)?.s;
      if (gauge) {
        const top = Math.max(0, Math.min(gauge.h, gauge.h - idiv((p.speed - 4) * gauge.h, 6)));
        if (top < gauge.h)
          this.hudPut(`${i}_s`, L.speed[0], L.speed[1] + top, 0, top, gauge.w, gauge.h - top);
      }
      const power = this.sprite(`${i}_p`)?.s;
      if (power && p.shotPower >= 2) {
        const right = idiv(power.w, 4 - Math.min(p.shotPower, 3));
        this.hudPut(`${i}_p`, L.power[0], L.power[1], 0, 0, right, power.h);
      }
      if (p.extraWeapon > 0) {
        this.hudPut(
          two ? `interface3_extra${p.extraWeapon - 1}` : `interface_extra${p.extraWeapon - 1}`,
          L.extra[0],
          L.extra[1],
        );
      }
      if (!two) {
        this.hudPut(`${i}_spec2`, 648, 567, 0, 0, -1, -1, true);
        // Partikel-Slots von Schiff 0 (Zweitwaffen folgen): leer
        if (p.shipType === 0) for (const [x, y] of PARTICLE_SLOTS) this.hudPut("d0s", x, y);
      }
    });
  }

  destroy(): void {
    for (const t of this.frames.values()) t.destroy(false);
    this.frames.clear();
    this.root.destroy({ children: true });
  }
}
