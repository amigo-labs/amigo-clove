import { type AtlasJson, FixedStepLoop, type GameHost } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { type Application, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { SpriteBatch } from "../render/SpriteBatch";
import { type DrawList, Effects, type EffectWorld } from "../sim/effects";
import type { VbRnd } from "../sim/vb";
import { atlasTexture } from "./gdi";
import { pauseKey } from "./input";
import type { Scene } from "./scene";
import type { ScreenTargets } from "./screenTargets";

/**
 * Abspann `ShowCredits` (`0x5566C0`): `credits` (500 × 3000, Atlas `logo`)
 * bei (150, 600 − t) auf Schwarz, 1 px je Durchlauf, `Wait 25` → 40 Hz,
 * t = 0…3600 (≈ 90 s). Alle 3 Durchläufe glitzern die hellen Pixel (Blau ≥ 128,
 * jede 6. Spalte) der Bildzeilen an y = 3 und y = 600 (`Add1BigPartikel`
 * Art 14); zu 10 % je Durchlauf ein goldener, wachsender Funke (1 `Rnd`,
 * bei Treffer 3 weitere). Weiche schwarze Kanten (`balken`) oben und unten.
 * Esc beendet sofort, ohne Loslassen abzuwarten. Musik `Enhaced Credits.ogg`.
 */

export const CREDITS_MS = 25;
const W = 500;
const H = 3000;
const X = 400 - Math.trunc(W / 2);

const QUIET: Omit<EffectWorld, "tick"> = {
  gravity: 0,
  groups: [],
  surfaces: [],
  terrain: () => false,
  sound: () => {},
};

export class CreditsLogic {
  /** `Me.584`. */
  t = 0;
  readonly fx: Effects;

  constructor(
    private readonly rnd: VbRnd,
    /** Helligkeit des Pixels (x, Zeile) im Abspannbild. */
    private readonly bright: (x: number, row: number) => boolean,
  ) {
    // `VariabelnLösch`: leere Pools
    this.fx = new Effects(rnd, 0);
  }

  /** Ein Durchlauf; `false`, wenn die Schleife am Kopf endet (Esc oder Bild durch). */
  step(esc: boolean): boolean {
    if (esc || this.t > H + 600) return false;
    const { fx, rnd, t } = this;
    fx.beginTick();
    if (t % 3 === 0) {
      for (const k of [3, 600]) {
        const row = t + k - 600;
        if (row < 0 || row >= H) continue;
        for (let x = 0; x < W; x += 6)
          if (this.bright(x, row)) fx.addBig(X + x - 30, k - 30, 0, 0, 1, 1, 1, 60, 3, 12, 14, 0);
      }
    }
    if (rnd.next() < 0.1) {
      const r1 = rnd.next();
      const r2 = rnd.next();
      const r3 = rnd.next();
      fx.addBig(r1 * 800, r2 * 600, 0, 0, 1, 0.7, 0.2, 0, 8, 20, 14, r3 * 10);
    }
    fx.moveBig({ ...QUIET, tick: t });
    this.t++;
    return true;
  }
}

/** Helligkeitsmaske des Abspannbilds aus seiner Atlasseite (Blau-Byte ≥ 128). */
export async function creditsMask(
  host: GameHost,
  atlas: AtlasJson,
): Promise<(x: number, row: number) => boolean> {
  const s = atlas.sprites["credits"];
  const page = s && atlas.pages[s.page];
  if (!s || !page) return () => false;
  try {
    const bytes = await host.assets.bytes(page);
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const canvas = host.canvas.ownerDocument.createElement("canvas");
    canvas.width = s.w;
    canvas.height = s.h;
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bitmap, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    bitmap.close();
    const data = g.getImageData(0, 0, s.w, s.h).data;
    return (x, row) => (data[(row * s.w + x) * 4 + 2] ?? 0) >= 128;
  } catch {
    return () => false;
  }
}

export class CreditsScene implements Scene {
  private readonly loop = new FixedStepLoop(CREDITS_MS);
  private readonly root = new Container();
  private readonly image: Sprite;
  private readonly batch: SpriteBatch;
  private readonly owned: Texture[] = [];
  private readonly glitter: Texture | undefined;
  private readonly shown: Sprite;

  constructor(
    private readonly host: GameHost,
    private readonly app: Application,
    private readonly t: ScreenTargets,
    textures: TextureRegistry,
    logo: AtlasJson,
    standart: AtlasJson,
    private readonly logic: CreditsLogic,
  ) {
    const tex = (atlas: AtlasJson, key: string) => {
      const x = atlasTexture(textures, atlas, key);
      if (x) this.owned.push(x);
      return x;
    };
    this.root.addChild(new Graphics().rect(0, 0, 800, 600).fill(0x000000));
    this.image = new Sprite(tex(logo, "credits"));
    this.root.addChild(this.image);
    const layer = new Container();
    this.root.addChild(layer);
    this.batch = new SpriteBatch(layer);
    this.glitter = tex(standart, "glitzer");
    const balken = tex(standart, "balken");
    for (const y of [-50, 550]) {
      const edge = new Sprite(balken);
      edge.tint = 0x000000;
      edge.position.set(0, y);
      edge.width = 800;
      edge.height = 100;
      this.root.addChild(edge);
    }
    this.shown = new Sprite(t.back);
    app.stage.addChild(this.shown);
  }

  frame(now: number): boolean {
    const n = this.loop.frame(now);
    let drawn = false;
    for (let i = 0; i < n; i++) {
      const t = this.logic.t;
      if (!this.logic.step(pauseKey(this.host))) return true;
      this.image.position.set(X, 600 - t);
      this.paint(this.logic.fx.lists.big);
      drawn = true;
    }
    if (drawn) this.t.draw(this.root, this.t.back, true);
    return false;
  }

  private paint(list: DrawList): void {
    const b = this.batch;
    b.begin();
    const tex = this.glitter;
    if (tex)
      for (const q of list.quads) {
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
    b.end();
  }

  destroy(): void {
    this.app.stage.removeChild(this.shown);
    this.shown.destroy();
    this.root.destroy({ children: true });
    for (const x of this.owned) x.destroy(false);
  }
}
