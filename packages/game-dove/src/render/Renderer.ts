import { fxFloor } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { Container, Texture } from "pixi.js";
import {
  BEAM_KINDS,
  BEAM_MAX,
  GREEN_SIZES,
  EXPLOSION_SIZE,
  EXTRA_ART,
  EXTRA_SIZE,
  FIELD_H,
  INVULN_DONE,
  METEOR_SIZE,
  SCREEN_W,
  SHIP_H,
  SHIP_W,
  STAR_GROUPS,
} from "../sim/constants";
import { roundHalfEven } from "../sim/math";
import { BAND_SIZE, DECO_RECT, SCRIPT_TEXTS } from "../sim/scripts";
import { levelMessages } from "../levelMessages";
import type { World } from "../sim/world";
import { GLYPH_W, glyph } from "./font";
import { FrameCache } from "./FrameCache";
import { Particles } from "./Particles";
import { SpritePool } from "./SpritePool";

const HUD_Y = FIELD_H;

/**
 * Zeichnet den Weltzustand in der Reihenfolge der Original-Hauptschleife:
 * Hintergrund, Sterne, Objekte, Schiff, Extras, Landschaft, Gegner, Schüsse,
 * Explosionen, HUD. Liest die Simulation nur, verändert sie nie.
 */
export class Renderer {
  readonly root = new Container();
  private readonly field = new Container();
  private readonly frames: FrameCache;
  private readonly pools: Record<string, SpritePool> = {};
  private readonly particles: Particles;
  private readonly feinde: string;
  private readonly landschaft: string;
  private shakeSeed = 1;
  /** Ticks seit Levelbeginn (Blinken der Beam-Anzeige). */
  private ticks = 0;

  constructor(
    textures: TextureRegistry,
    private readonly world: World,
    /** Sprache der Skripttexte: Deutsch (`Me.350` gesetzt) oder Englisch. */
    private readonly german = true,
    /** Bewegungsarme Darstellung (Einstellung der Shell): kein Bildschirmwackeln. */
    private readonly calm: () => boolean = () => false,
    /**
     * HTML-HUD der Shell: Konsole und Anzeigen entfallen, die Texte im Spielfeld
     * (Skripttexte, Scan-Meldungen in Level 7) zeigt die Shell (`levelMessages`).
     */
    private readonly modernHud: () => boolean = () => false,
    /** Skripttext mit den belegten Tasten (Namen in ASCII für die 8-px-Schrift). */
    private readonly scriptLine: (index: number) => string | undefined = (i) =>
      SCRIPT_TEXTS[i]?.[german ? 0 : 1],
  ) {
    this.frames = new FrameCache(textures);
    const n = world.level.number;
    this.feinde = `image/feinde${n}`;
    this.landschaft = `image/landschaft${n}`;
    this.root.addChild(this.field);
    for (const name of [
      "background",
      "starsBack",
      "objects",
      "deco",
      "starsFront",
      "ship",
      "extras",
      "tiles",
      "meteors",
      "enemies",
      "boss",
      "bands",
      "shots",
      "laser",
      "eshots",
      "orbiters",
      "beam",
      "explosions",
    ]) {
      const layer = new Container();
      this.field.addChild(layer);
      this.pools[name] = new SpritePool(layer);
    }
    const particleLayer = new Container();
    this.field.addChild(particleLayer);
    this.particles = new Particles(particleLayer);
    const hud = new Container();
    this.root.addChild(hud);
    this.pools["hud"] = new SpritePool(hud);
  }

  /** Alle Bild-IDs, die dieser Renderer braucht. */
  static imageIds(world: World): string[] {
    const n = world.level.number;
    const ids = [
      "image/ss",
      "image/konsole",
      "image/explosion",
      "image/text",
      `image/feinde${n}`,
      `image/landschaft${n}`,
    ];
    if (!world.level.starfield) ids.push(`image/${world.level.background}`);
    if (world.level.meteorContour.length > 0) ids.push("image/metroid");
    return ids;
  }

  private tex(id: string, x: number, y: number, w: number, h: number): Texture {
    return this.frames.get(id, x, y, w, h);
  }

  private pool(name: string): SpritePool {
    return this.pools[name]!;
  }

  private text(s: string, x: number, y: number): void {
    const hud = this.pool("hud");
    let cx = x;
    for (const ch of s) {
      const g = glyph(ch);
      if (g) {
        hud.put(this.tex("image/text", g[0], g[1], GLYPH_W, 12), cx, y);
        cx += GLYPH_W;
      }
    }
  }

  /**
   * Ein Tick der Darstellung: Funken, Wackeln und Blinken laufen im Takt der
   * Simulation. Je Anzeigebild liefen sie auf 144 Hz mehr als doppelt so schnell
   * wie auf 60 Hz, und das Bild hinge davon ab, wie sich die Ticks auf die Bilder
   * verteilen.
   */
  tick(): void {
    const w = this.world;
    this.particles.consume(w.effects);
    w.effects.length = 0;
    this.particles.step();
    if (w.shake > 0 && !this.calm())
      this.shakeSeed = (Math.imul(this.shakeSeed, 1103515245) + 12345) | 0;
    this.ticks++;
  }

  render(): void {
    const w = this.world;
    const lvl = w.level;
    for (const p of Object.values(this.pools)) p.begin();

    // Hintergrund: Bild mit Umbruch oder Sternenfeld
    if (!lvl.starfield) {
      const off = fxFloor(w.bgOffset);
      const bg = this.tex(`image/${lvl.background}`, 0, 0, SCREEN_W, FIELD_H);
      this.pool("background").put(bg, -off, 0);
      this.pool("background").put(bg, SCREEN_W - off, 0);
    } else {
      for (const [from, to, , grey] of STAR_GROUPS) {
        const pool = this.pool(from === 0 ? "starsFront" : "starsBack");
        const tint = (grey << 16) | (grey << 8) | grey;
        for (let i = from; i <= to; i++)
          pool.put(Texture.WHITE, fxFloor(w.starX[i]!), w.starY[i]!, tint).setSize(1, 1);
      }
    }

    for (let i = 0; i < w.objects.capacity; i++) {
      if (!w.objects.active[i]) continue;
      const o = lvl.objects[w.objType[i]!]!;
      this.pool("objects").put(
        this.tex(this.landschaft, o.l, o.t, o.w, o.h),
        roundHalfEven(w.objX[i]!),
        w.objY[i]!,
      );
    }

    for (let i = 0; i < w.deco.capacity; i++) {
      if (!w.deco.active[i]) continue;
      const d = this.tex("image/ss", DECO_RECT.sx, DECO_RECT.sy, DECO_RECT.w, DECO_RECT.h);
      this.pool("deco").put(d, w.decoX[i]!, w.decoY[i]!);
    }

    if (!w.dead && ((w.invuln & 1) === 0 || w.invuln === INVULN_DONE)) {
      const ship = this.pool("ship");
      ship.put(this.tex("image/ss", 10, SHIP_H * w.tilt, SHIP_W, SHIP_H), w.px, w.py);
      if (w.speed > 2) ship.put(this.tex("image/ss", 3, 8 * w.flame - 8, 6, 8), w.px - 6, w.py + 9);
    }

    for (let i = 0; i < w.extras.capacity; i++) {
      if (!w.extras.active[i]) continue;
      const [ax] = EXTRA_ART[w.extraArt[i]!]!;
      const t = this.tex("image/ss", ax, w.extraFrame[i]! * EXTRA_SIZE, EXTRA_SIZE, EXTRA_SIZE);
      this.pool("extras").put(t, w.extraX[i]!, w.extraY[i]!);
    }

    for (let i = 0; i < w.tiles.capacity; i++) {
      if (!w.tiles.active[i]) continue;
      const t = lvl.tiles[w.tileType[i]!]!;
      this.pool("tiles").put(
        this.tex(this.landschaft, t.l, t.t, t.w, t.h),
        w.tileX[i]!,
        w.tileY[i]!,
      );
    }

    for (let i = 0; i < w.meteors.capacity; i++) {
      if (!w.meteors.active[i]) continue;
      this.pool("meteors").put(
        this.tex("image/metroid", 0, 0, METEOR_SIZE, METEOR_SIZE),
        w.metX[i]!,
        w.metY[i]!,
      );
    }

    for (let i = 0; i < w.enemies.capacity; i++) {
      if (!w.enemies.active[i]) continue;
      const e = lvl.enemies[w.enType[i]!]!;
      const t = this.tex(this.feinde, e.l, e.t + w.enFrame[i]! * e.h, e.w, e.h);
      this.pool("enemies").put(t, roundHalfEven(w.enX[i]!), roundHalfEven(w.enY[i]!));
    }

    // Bremsbänder (Level 7) und Windzonen (Level 8): Darstellung geschätzt
    for (let i = 0; i < w.bands.capacity; i++) {
      if (!w.bands.active[i]) continue;
      const band = this.pool("bands").put(Texture.WHITE, w.bandX[i]!, w.bandY[i]!, 0x6688ff);
      band.setSize(BAND_SIZE.w, BAND_SIZE.h);
      band.alpha = 0.25;
    }
    for (let i = 0; i < w.winds.capacity; i++) {
      if (!w.winds.active[i]) continue;
      const x0 = w.windX[i]!;
      const width = w.windW[i]!;
      const drift = (w.tick * w.windS[i]!) % 410;
      for (let k = 0; k < 24; k++) {
        const x = x0 + ((k * 53) % width);
        const y = (((k * 97 + drift) % 410) + 410) % 410;
        const streak = this.pool("bands").put(Texture.WHITE, x, y, 0xaaccff);
        streak.setSize(1, 6);
        streak.alpha = 0.6;
      }
    }

    // Boss: bis zu drei Teile aus dem Gegner-Atlas, dazu tödliche Strahlen (Farbe geschätzt)
    for (let p = 0; p < 3; p++) {
      const type = w.bossType[p]!;
      if (type < 0 || !w.bossVisible[p]) continue;
      const e = lvl.enemies[type]!;
      const t = this.tex(this.feinde, e.l, e.t + w.bossFrame[p]! * e.h, e.w, e.h);
      this.pool("boss").put(t, w.bossX[p]!, w.bossY[p]!);
    }
    for (let b = 0; b < 3; b++) {
      if (w.bossBeamW[b]! <= 0) continue;
      this.pool("boss")
        .put(Texture.WHITE, w.bossBeamX[b]!, w.bossBeamY[b]!, 0xaaddff)
        .setSize(w.bossBeamW[b]!, w.bossBeamH[b]!);
    }
    for (let i = 0; i < w.shots.capacity; i++) {
      if (!w.shots.active[i]) continue;
      let t: Texture;
      switch (w.shotType[i]) {
        case 0:
          t = this.tex("image/ss", 0, 63, 7, 7);
          break;
        case 1:
          t = this.tex("image/ss", 0, 57, 7, 6);
          break;
        case 2: {
          const g = GREEN_SIZES[w.shotSize[i]!]!;
          t = this.tex("image/ss", g.sx, g.sy, g.w, g.h);
          break;
        }
        default:
          t = this.tex("image/ss", 0, 90, 7, 7);
      }
      this.pool("shots").put(t, w.shotX[i]!, w.shotY[i]!);
    }
    // Blauer Laser: Kern hell, Rand dunkel (Farbwerte des Originals unbekannt, geschätzt)
    for (let k = 0; k < w.laserRows; k++) {
      const from = w.laserFrom[k]!;
      const len = w.laserTo[k]! - from;
      if (len <= 0) continue;
      const tint = [0xc8e4ff, 0x5a8cff, 0x1e3cc8][w.laserTier[k]!]!;
      this.pool("laser").put(Texture.WHITE, from, w.laserY[k]!, tint).setSize(len, 1);
    }
    for (let i = 0; i < w.eshots.capacity; i++) {
      if (!w.eshots.active[i]) continue;
      this.pool("eshots").put(
        this.tex("image/ss", w.eshotSX[i]!, w.eshotSY[i]!, w.eshotW[i]!, w.eshotH[i]!),
        w.eshotX[i]!,
        w.eshotY[i]!,
      );
    }
    if (w.orbVisible) {
      const orb = this.tex("image/ss", 0, 48, 9, 9);
      for (let k = 0; k < w.orbCount; k++) this.pool("orbiters").put(orb, w.orbX[k]!, w.orbY[k]!);
    }
    if (w.beam) {
      const b = BEAM_KINDS[w.beam]!;
      this.pool("beam").put(this.tex("image/ss", b.sx, b.sy, b.w, b.h), w.beamX, w.beamY);
    }
    for (let i = 0; i < w.explosions.capacity; i++) {
      if (!w.explosions.active[i]) continue;
      const f = w.expFrame[i]! - 1;
      const t = this.tex(
        "image/explosion",
        (f % 8) * EXPLOSION_SIZE,
        Math.floor(f / 8) * EXPLOSION_SIZE,
        EXPLOSION_SIZE,
        EXPLOSION_SIZE,
      );
      this.pool("explosions").put(t, w.expX[i]!, w.expY[i]!);
    }

    this.particles.draw();

    // Bildschirmwackeln bei großen Abschüssen (Amplitude geschätzt, reine Darstellung)
    if (w.shake > 0 && !this.calm()) {
      this.field.position.set(((this.shakeSeed >> 8) % 3) - 1, ((this.shakeSeed >> 12) % 3) - 1);
    } else {
      this.field.position.set(0, 0);
    }

    // HUD und Texte im Spielfeld; mit dem HTML-HUD zeigt beides die Shell
    const modern = this.modernHud();
    if (!modern) this.drawHud(w);
    if (!modern) {
      for (const m of levelMessages(w)) {
        if (m.at) this.text(m.text, m.at.x, m.at.y);
      }
      const script = this.scriptLine(w.scriptText);
      if (script) {
        const lines = wrap(script, 76);
        lines.forEach((line, k) =>
          this.text(line, Math.floor((SCREEN_W - line.length * GLYPH_W) / 2), 20 + 14 * k),
        );
      }
    }

    for (const p of Object.values(this.pools)) p.end();
  }

  /** Konsole mit Tempo, Pod, Options, Bombe, Waffe, Beam-Ladung, Punkten und Schiffen. */
  private drawHud(w: World): void {
    const hud = this.pool("hud");
    hud.put(this.tex("image/konsole", 0, 0, SCREEN_W, 70), 0, HUD_Y);
    const g = Math.max(0, Math.min(80, w.gauge));
    hud.put(this.tex("image/ss", g, 100, 80 - g, 26), 241 + g, 450);
    hud.put(this.tex("image/ss", 94, 0, 6, 37), 373 + w.pod, 415);
    if (w.optionCount >= 1) hud.put(this.tex("image/ss", 50, 20, 21, 20), 465, 425);
    if (w.optionCount >= 2) hud.put(this.tex("image/ss", 50, 20, 21, 20), 346, 425);
    if (w.bomb) hud.put(this.tex("image/ss", 71, 20, 21, 20), 465, 457);
    if (w.colour > 0) {
      const icon = ([undefined, [50, 0], [71, 0], [50, 40]] as const)[w.colour as 1 | 2 | 3];
      for (let k = 0; k <= w.stage; k++)
        hud.put(this.tex("image/ss", icon[0], icon[1], 21, 20), 385 + 21 * k, 457);
    }
    // Beam-Anzeige: Füllung RGB(c+20, 0, 0), bei voller Ladung blinkend
    if (w.charge > 0) {
      const full = w.charge >= BEAM_MAX;
      const blink = full && Math.floor(this.ticks / 5) % 2 === 0;
      const tint = blink ? 0xff8080 : Math.min(255, w.charge + 20) << 16;
      hud.put(Texture.WHITE, 520, 413, tint).setSize(w.charge >> 1, 10);
    }
    this.text(`Score:${w.shownScore}`, 50, 414);
    this.text(`Ships:${w.lives}`, 540, 460);
  }

  destroy(): void {
    this.particles.destroy();
    this.root.destroy({ children: true });
    this.frames.clear();
  }
}

/** Zeilenumbruch an Wortgrenzen für die 8-px-Schrift. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
