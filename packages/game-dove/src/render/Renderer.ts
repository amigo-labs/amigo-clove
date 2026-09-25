import type { TextureRegistry } from "@clove/pixi-kit";
import { Container, Texture } from "pixi.js";
import {
  ESHOT,
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
import type { World } from "../sim/world";
import { GLYPH_W, glyph } from "./font";
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
  private readonly frames = new Map<string, Texture>();
  private readonly pools: Record<string, SpritePool> = {};
  private readonly particles: Particles;
  private readonly feinde: string;
  private readonly landschaft: string;
  private shakeSeed = 1;

  constructor(
    private readonly textures: TextureRegistry,
    private readonly world: World,
  ) {
    const n = world.level.number;
    this.feinde = `image/feinde${n}`;
    this.landschaft = `image/landschaft${n}`;
    this.root.addChild(this.field);
    for (const name of [
      "background",
      "starsBack",
      "objects",
      "starsFront",
      "ship",
      "extras",
      "tiles",
      "meteors",
      "enemies",
      "shots",
      "eshots",
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
    const key = `${id}:${x},${y},${w},${h}`;
    let t = this.frames.get(key);
    if (!t) {
      t = w > 0 && h > 0 ? this.textures.frame(id, x, y, w, h) : Texture.EMPTY;
      this.frames.set(key, t);
    }
    return t;
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

  render(overlay?: string): void {
    const w = this.world;
    const lvl = w.level;
    for (const p of Object.values(this.pools)) p.begin();

    // Hintergrund: Bild mit Umbruch oder Sternenfeld
    if (!lvl.starfield) {
      const off = w.bgOffset >> 16;
      const bg = this.tex(`image/${lvl.background}`, 0, 0, SCREEN_W, FIELD_H);
      this.pool("background").put(bg, -off, 0);
      this.pool("background").put(bg, SCREEN_W - off, 0);
    } else {
      for (const [from, to, , grey] of STAR_GROUPS) {
        const pool = this.pool(from === 0 ? "starsFront" : "starsBack");
        const tint = (grey << 16) | (grey << 8) | grey;
        for (let i = from; i <= to; i++)
          pool.put(Texture.WHITE, w.starX[i]! >> 16, w.starY[i]!, tint).setSize(1, 1);
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

    const shotTex = this.tex("image/ss", 0, 63, 7, 7);
    for (let i = 0; i < w.shots.capacity; i++) {
      if (w.shots.active[i]) this.pool("shots").put(shotTex, w.shotX[i]!, w.shotY[i]!);
    }
    for (let i = 0; i < w.eshots.capacity; i++) {
      if (!w.eshots.active[i]) continue;
      const k = ESHOT[w.eshotKind[i] as 1 | 2];
      this.pool("eshots").put(
        this.tex("image/ss", k.sx, k.sy, k.w, k.h),
        w.eshotX[i]!,
        w.eshotY[i]!,
      );
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

    this.particles.consume(w.effects);
    w.effects.length = 0;
    this.particles.update();

    // Bildschirmwackeln bei großen Abschüssen (Amplitude geschätzt, reine Darstellung)
    if (w.shake > 0) {
      this.shakeSeed = (Math.imul(this.shakeSeed, 1103515245) + 12345) | 0;
      this.field.position.set(((this.shakeSeed >> 8) % 3) - 1, ((this.shakeSeed >> 12) % 3) - 1);
    } else {
      this.field.position.set(0, 0);
    }

    // HUD
    const hud = this.pool("hud");
    hud.put(this.tex("image/konsole", 0, 0, SCREEN_W, 70), 0, HUD_Y);
    const g = Math.max(0, Math.min(80, w.gauge));
    hud.put(this.tex("image/ss", g, 100, 80 - g, 26), 241 + g, 450);
    this.text(`Score:${w.shownScore}`, 50, 414);
    this.text(`Ships:${w.lives}`, 540, 460);
    if (overlay) this.text(overlay, Math.floor((SCREEN_W - overlay.length * GLYPH_W) / 2), 190);

    for (const p of Object.values(this.pools)) p.end();
  }

  destroy(): void {
    this.particles.destroy();
    this.root.destroy({ children: true });
    this.frames.clear();
  }
}
