import type { AtlasJson, AtlasSprite } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type Renderer as PixiRenderer,
} from "pixi.js";
import type { DrawList, DrawSlot, Quad } from "../sim/effects";
import { type Lang, hintPrefix } from "../game/lang";
import type { EnvSlot } from "../sim/envDraw";
import { DeathState, type Enemy } from "../sim/enemies";
import { LAYER_COUNT } from "../sim/layers";
import type { Surface } from "../sim/surfaces";
import { cint, idiv } from "../sim/vb";
import type { World } from "../sim/world";
import { Compositor, type PlanItem } from "./Compositor";
import { paintList } from "./paintList";
import { SpriteBatch } from "./SpriteBatch";
import type { StripTexture } from "./StripMesh";

/**
 * Zeichnet den DoveZ-Weltzustand in der Reihenfolge von `SpielLoop`:
 * Hintergrund → Ebenen 0, 1, 2, 5 (je mit ihren Animationen) → Abgas →
 * Spielerschüsse Ebene 0 → Funken 0 → Power-ups → Schiff → Gegner (mit den
 * Linien und Trümmern ihrer Todeszustände) → Blasen → Animationen 4 →
 * Landschaft 3 → Spielerschüsse 1 → Animationen 3 → Funken 1 → große
 * Partikel → Gegnerschüsse → Punkte-Popups → Hupe → Regen → Ebene 6 →
 * Wasser → Wetter → Spezial → Overlays → Wackeln → HUD.
 * Die Effekte kommen als Zeichenlisten aus der Simulation (`sim/effects.ts`,
 * Umgebung `sim/envDraw.ts`); alles bis auf Abblende und HUD geht wie im
 * Original in einen nie gelöschten Backbuffer (`Compositor`).
 */

interface AtlasRef {
  readonly json: AtlasJson;
}

/** HUD-Positionen (links oben) je Element, 1 Spieler. */
const HUD_1P = {
  score: [743, 578],
  beam: [170, 578],
  energy: [152, 556],
  speed: [623, 565],
  power: [587, 566],
  extra: [647, 569],
} as const;
/** 2 Spieler: je Spieler eine Zeile mit den kleinen `interface3_*`-Bildern. */
const HUD_2P = [
  {
    score: [740, 565],
    beam: [172, 560],
    energy: [158, 548],
    speed: [626, 565],
    power: [582, 566],
    extra: [659, 566],
  },
  {
    score: [740, 581],
    beam: [172, 586],
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

/** Zeichenstellen in der Reihenfolge von `SpielLoop`; `env:*` sind Umgebungslisten. */
const ORDER = [
  "env:bg",
  "layer0",
  "anim0",
  "env:special0",
  "layer1",
  "anim1",
  "layer2",
  "anim2",
  "layer5",
  "anim5",
  "fx:gate0",
  "fx:exhaust",
  "fx:weapons",
  "fx:shots0",
  "fx:sparks0",
  "specials",
  "fx:ship",
  "enemies",
  "fx:enemies",
  "fx:bubbles",
  "anim4",
  "layer3",
  "fx:particles",
  "fx:shots1",
  "anim3",
  "fx:beam",
  "nova:blits",
  "fx:nova",
  "fx:sparks1",
  "fx:big",
  "eshots",
  "fx:force",
  "fx:popups",
  "env:hupe",
  "env:rain",
  "fx:gate1",
  "layer6",
  "anim6",
  "env:water",
  "env:weather",
  "env:special1",
  "hint",
  "fx:flash",
  "env:overlay",
] as const;

export interface RendererOptions {
  /** Spielsprache (Tastenhinweis „Drücke:“/„Press:“/„Нажмите:“); ohne Angabe Deutsch. */
  readonly lang?: Lang;
  /** Tastenname einer Aktion (Index der Belegungstabelle) für Satz 0 (1P) bzw. 1/2. */
  readonly keyLabel?: (action: number, set: number) => string;
}

export class Renderer {
  readonly root = new Container();
  private readonly batches = new Map<string, SpriteBatch>();
  private readonly layers = new Map<string, Container>();
  private readonly frames = new Map<string, Texture>();
  private readonly compositor: Compositor;
  /** Backbuffer auf dem Bildschirm; das Wackeln verschiebt ihn. */
  private readonly screen: Sprite;
  /** Tastenhinweis (`SpielSpezial` Typ 1): je Zeile zwei Schatten und der Text. */
  private readonly hint = new Container();
  private readonly hintTexts: Text[] = [];
  private lastFrame = -1;
  /** HUD (`SpielDisplay`) über dem Spielfeld, nicht gewackelt, nicht abgeblendet. */
  private readonly hud: SpriteBatch;
  /** Laufband (`ShowMSGS`): Courier 12, RGB(64, 255, 64), GDI nach dem HUD. */
  private readonly ticker = new Text({
    text: "",
    style: { fill: 0x40ff40, fontSize: 12, fontFamily: "Courier New, Courier, monospace" },
  });
  /** Abblende-Schwarz über dem Spielfeld (Alpha je Frame). */
  private readonly fade = new Graphics().rect(0, 0, 800, 550).fill(0x000000);
  private frameNo = 0;
  /** Bildschirm-Overlays (Speicherbildschirm): GDI-Texte unter, Logo über der Abblende. */
  readonly underFade = new Container();
  readonly overFade = new Container();

  constructor(
    private readonly textures: TextureRegistry,
    private readonly world: World,
    /** Level-Atlas zuerst, dann `spiel`, `standart`. */
    private readonly atlases: readonly AtlasRef[],
    pixi: PixiRenderer,
    private readonly opts: RendererOptions = {},
  ) {
    this.compositor = new Compositor(pixi);
    this.screen = new Sprite(this.compositor.bb);
    this.root.addChild(this.screen);
    for (const name of ORDER) {
      if (name.startsWith("env:") || name === "hint" || name === "nova:blits") continue;
      const c = new Container();
      this.layers.set(name, c);
      this.batches.set(name, new SpriteBatch(c));
    }
    this.root.addChild(this.underFade, this.fade, this.overFade);
    const hud = new Container();
    this.root.addChild(hud);
    this.hud = new SpriteBatch(hud);
    this.ticker.position.set(575, 552);
    const clip = new Graphics().rect(575, 540, 225, 30).fill(0xffffff);
    this.ticker.mask = clip;
    this.root.addChild(clip, this.ticker);
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
    // ohne neuen Tick bleibt das Bild (der Backbuffer darf nicht erneut verschleiert werden)
    if (w.env.frame === this.lastFrame) return;
    this.lastFrame = w.env.frame;
    this.frameNo++;
    for (const b of this.batches.values()) b.begin();
    this.hud.begin();
    for (let l = 0; l < LAYER_COUNT; l++) this.drawTiles(l);
    for (let l = 0; l < LAYER_COUNT; l++) this.drawAnims(l);
    this.drawSpecials();
    this.drawEnemies();
    this.drawEnemyShots();
    for (const [slot, list] of Object.entries(w.fx.lists)) {
      if (slot !== "radio") this.drawList(this.batch(`fx:${slot as DrawSlot}`), list);
    }
    this.drawHint();
    this.screen.position.set(-w.fx.shakeX, -w.fx.shakeY);
    // Abblenden in den letzten 50 Ticks
    const left = w.level.levelLength - w.tick;
    this.fade.alpha = left < 50 && !w.nova ? (50 - left) / 50 : 0;
    this.fade.scale.y = 1;
    this.drawHud();
    this.drawCombo();
    this.drawList(this.hud, w.fx.lists.radio);
    this.ticker.text = w.radio.ticker;
    for (const b of this.batches.values()) b.end();
    this.hud.end();
    this.compose();
  }

  /**
   * Speicherbildschirm (`SaveGame`): nur `SpielMoveHintergrund` und das HUD,
   * dazu Schwarz mit `fade` über dem Spielfeld (unter `overFade` und HUD).
   */
  drawBackdrop(fade: number): void {
    const w = this.world;
    if (w.env.frame === this.lastFrame) return;
    this.lastFrame = w.env.frame;
    this.frameNo++;
    for (const b of this.batches.values()) b.begin();
    this.hud.begin();
    this.drawHint();
    this.screen.position.set(0, 0);
    this.fade.alpha = Math.max(0, Math.min(1, fade));
    this.fade.scale.y = 600 / 550;
    this.drawHud();
    this.ticker.text = w.radio.ticker;
    for (const b of this.batches.values()) b.end();
    this.hud.end();
    this.compose();
  }

  /** Ebenen und Umgebungslisten der Reihe nach in den Backbuffer (`Compositor`). */
  private compose(): void {
    const c = this.compositor;
    const lists = this.world.env.lists;
    c.begin();
    const plan: PlanItem[] = [];
    for (const name of ORDER) {
      if (name === "hint") plan.push(this.hint);
      else if (name === "nova:blits") this.novaBlits(plan);
      else if (name.startsWith("env:")) {
        const slot = name.slice(4) as EnvSlot;
        c.expand(lists[slot], (key) => this.stripTexture(key), plan);
      } else plan.push(this.layers.get(name)!);
    }
    c.play(plan);
  }

  /**
   * Bildbruch der Super-Nova (Varianten 3 und 4): `BltFast` des Backbuffers
   * auf sich selbst, erst senkrecht, dann waagerecht (`NovaState.blits`, je
   * `dx, dy, sx, sy, w, h`). Da der Backbuffer bleibt, sammeln sich die
   * Versätze wie im Original über die Ticks an.
   */
  private novaBlits(plan: PlanItem[]): void {
    for (const b of this.world.novaState.blits) {
      const rects: [number, number, number, number, number, number][] = [];
      for (let i = 0; i + 5 < b.length; i += 6)
        rects.push([b[i + 2]!, b[i + 3]!, b[i + 4]!, b[i + 5]!, b[i]!, b[i + 1]!]);
      if (rects.length > 0) plan.push({ op: "copy", rects });
    }
  }

  /** Streifen-Textur zu einem Schlüssel: Render-Ziel oder Atlas-Sprite (`@noise` mit Wiederholung). */
  private stripTexture(key: string): StripTexture | undefined {
    if (key === "@blur" || key === "@still")
      return this.compositor.targetTexture(key === "@blur" ? "blur" : "still");
    const wrap = key === "@noise";
    const t = this.texture(wrap ? "noise" : key);
    if (!t) return undefined;
    const s = t.source;
    const f = t.frame;
    return {
      // der Ausschnitt geht als Uniform an den Shader: je Bild ein eigenes Mesh
      id: `${wrap ? "~" : ""}${s.uid}|${f.x},${f.y},${f.width},${f.height}`,
      texture: t,
      frame: [f.x / s.width, f.y / s.height, f.width / s.width, f.height / s.height],
      wrap,
    };
  }

  /**
   * Tastenhinweis (`SpielSpezial` Typ 1, GDI Arial 70): „Drücke: “ + Taste,
   * zwei schwarze Schatten bei (10, y) und (12, y + 2), Text in Grau v bei
   * (11, y + 1); 1P y = 450, 2P je Spieler y = 360 und 450.
   */
  private drawHint(): void {
    const h = this.world.env.hint;
    const lines = h ? (this.world.playersMinus1 === 1 ? [1, 2] : [0]) : [];
    const need = lines.length * 3;
    while (this.hintTexts.length < need) {
      const t = new Text({
        text: "",
        style: { fontFamily: "Arial", fontSize: 70, fill: 0xffffff },
      });
      this.hintTexts.push(t);
      this.hint.addChild(t);
    }
    this.hintTexts.forEach((t, i) => (t.visible = i < need));
    if (!h) return;
    const prefix = hintPrefix(this.opts.lang ?? "de");
    lines.forEach((set, n) => {
      const y = lines.length === 2 && n === 0 ? 360 : 450;
      const text = prefix + (this.opts.keyLabel?.(h.action, set) ?? "?");
      const v = Math.max(0, Math.min(255, h.grey));
      const parts: [number, number, number][] = [
        [10, y, 0],
        [12, y + 2, 0],
        [11, y + 1, (v << 16) | (v << 8) | v],
      ];
      parts.forEach(([x, py, color], k) => {
        const t = this.hintTexts[3 * n + k]!;
        t.text = text;
        t.style.fill = color;
        t.position.set(x, py);
      });
    });
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
    // Boss-Finale: die Teile zerplatzen bei T = 500 und werden danach nicht mehr gezeichnet
    if (e.inState && e.deathState === DeathState.boss && e.stateTimer > 500) return;
    // während der Nova versteckt (Zustand −1)
    if (e.inState && e.deathState === DeathState.hidden) return;
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
  private drawList(b: SpriteBatch, list: DrawList): void {
    paintList(b, list, (q) => this.quadTexture(q), this.texture(BAR));
  }

  private quadTexture(q: Quad): Texture | undefined {
    if (q.surface)
      return q.src
        ? this.texture(
            q.surface.key,
            q.surface.rect.x + q.src[0],
            q.surface.rect.y + q.src[1],
            q.src[2],
            q.src[3],
          )
        : this.surfaceTexture(q.surface);
    return q.src ? this.texture(q.key, ...q.src) : this.texture(q.key);
  }

  private drawEnemyShots(): void {
    const w = this.world;
    const b = this.batch("eshots");
    for (const s of w.fire.shots) {
      if (!s.active || s.shockwave) continue;
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
      // Beam: gewählter Typ als Grund (nur im Wechselmodus), darüber die Ladung
      const b = w.beams[n];
      if (b) {
        if (w.qToggles) this.hudPut(`${i}_beama${b.selected}`, L.beam[0], L.beam[1]);
        const bar = this.sprite(`${i}_beam${b.type}`)?.s;
        const bw = bar ? Math.trunc(cint(bar.w * b.charge) / 165) : 0;
        if (bar && bw > 0) this.hudPut(`${i}_beam${b.type}`, L.beam[0], L.beam[1], 0, 0, bw, bar.h);
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
        if (p.shipType === 0) this.drawParticleSlots(p.selected);
        if (p.shipType === 1 && w.force.present) this.drawForceIcon();
      }
    });
  }

  /** Waffenfeld des D-Tonator: inaktiv `d0s`, gewählt `d{i+1}s`, Stufe als `extra{Sorte}`, Schild dreimal `extra0`. */
  private drawParticleSlots(selected: number): void {
    this.world.particles.forEach((r, k) => {
      const [x, y] = PARTICLE_SLOTS[k]!;
      if (!r.present) this.hudPut("d0s", x, y);
      else if (k === selected) this.hudPut(`d${k + 1}s`, x, y);
      if (!r.present) return;
      const icons = r.kind > 0 ? r.level : r.kind < 0 ? 3 : 0;
      const key = r.kind > 0 ? `extra${r.kind}` : "extra0";
      for (let j = 1; j <= icons; j++) this.hudPut(key, x + 16 * j + 3, y + 2);
    });
  }

  /** Force im HUD: Farbsymbol blass gestreckt, darüber fünf Force-Bilder mit steigendem Alpha. */
  private drawForceIcon(): void {
    const f = this.world.force;
    const icon = this.texture(`extra${f.color + 1}`);
    if (icon)
      this.hud.put(icon, 416 + 54 - icon.frame.width / 2, 555 + 20 - icon.frame.height / 2, {
        scaleX: 108 / icon.frame.width,
        scaleY: 40 / icon.frame.height,
        alpha: 0.2,
      });
    for (let k = 0; k <= 4; k++) {
      const t = this.texture(`force_0${f.level + 1}000${(f.frame + k) % 8}`);
      if (!t) continue;
      this.hud.put(t, 438 + 24 - t.frame.width / 2, 549 + 24 - t.frame.height / 2, {
        scaleX: 48 / t.frame.width,
        scaleY: 48 / t.frame.height,
        red: 0.7,
        green: 0.7,
        alpha: k / 10,
      });
    }
  }

  /** Kombo-Anzeige (nur Spieler 1): `combo` bei (730, 520), Treffer und Bonus, beim Treffer gestreckt. */
  private drawCombo(): void {
    const w = this.world;
    const S = w.comboHud;
    const cnt = w.comboHits[0] ?? 0;
    if (!((cnt > 1 || S.shown > 1) && S.timer > 0)) return;
    this.hudPut("combo", 730, 520);
    const digits = (v: number, right: number, y: number) => {
      const str = String(Math.max(0, v));
      for (let k = 1; k <= str.length; k++)
        this.hudPut(`n${str[str.length - k]}`, right - 9 * k, y);
    };
    digits(S.shown, 721, 520);
    digits(S.bonus, 800, 535);
    if (cnt !== S.shown && cnt > 0) {
      const pop = (key: string, x: number) => {
        const t = this.texture(key);
        if (!t) return;
        const h = 12 + 2 * S.timer;
        this.hud.put(t, x, 526 - t.frame.height / 2, { scaleY: h / t.frame.height });
      };
      pop("combo", 730);
      const str = String(cnt);
      for (let k = 1; k <= str.length; k++) pop(`n${str[str.length - k]}`, 721 - 9 * k);
    }
  }

  destroy(): void {
    for (const t of this.frames.values()) t.destroy(false);
    this.frames.clear();
    for (const c of this.layers.values()) c.destroy({ children: true });
    this.hint.destroy({ children: true });
    this.compositor.destroy();
    this.root.destroy({ children: true });
  }
}
