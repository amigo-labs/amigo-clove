import { FixedStepLoop, type GameHost } from "@clove/core";
import {
  type Application,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Rectangle,
  Sprite,
  Texture,
  TilingSprite,
} from "pixi.js";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, vbInt, type VbRnd } from "../../sim/vb";
import { rollNoise } from "./menuLogic";
import { pauseKey } from "../input";
import type { Scene } from "../scene";
import type { ScreenTargets } from "../screenTargets";

/**
 * Start-Logos `ShowLogo(paket, datei, a, b, c, d)` (`0x553730`): Intergenies
 * (42, 30, 0, −1) mit Glitch-Vorspann und `FadeOut(0, True)`, Toxeen und
 * Clockwork (40, 30, 0, 0) mit Einblenden und Zoom-Tunnel. Esc (`TastePause`)
 * beendet jede Phase am Schleifenkopf, ohne Loslassen abzuwarten.
 */

/** `MakeSomeNoise(α)`: 4 × 3 Kacheln `noise` mit zufälligem, gespiegeltem Ausschnitt (48 `Rnd`). */
export class NoiseLayer {
  readonly root = new Container();
  private readonly tiles: TilingSprite[] = [];

  constructor(noise: Texture | undefined) {
    for (let i = 0; i < 12; i++) {
      const t = new TilingSprite({ texture: noise ?? Texture.EMPTY, width: 256, height: 256 });
      t.position.set(256 * Math.trunc(i / 3), 256 * (i % 3));
      this.tiles.push(t);
      this.root.addChild(t);
    }
  }

  set(tiles: readonly (readonly [number, number, number, number])[], alpha: number): void {
    this.tiles.forEach((t, i) => {
      const r = tiles[i];
      t.visible = !!r && alpha > 0;
      if (!r) return;
      const [sx, sy, sx2, sy2] = r;
      const kx = 256 / (sx2 - sx || 1);
      const ky = 256 / (sy2 - sy || 1);
      t.tileScale.set(kx, ky);
      t.tilePosition.set(-sx * kx, -sy * ky);
      t.alpha = Math.min(1, alpha);
    });
  }
}

const GRID = 20;
const sinD = (a: number) => SIN_DEG[degIndex(a)] ?? 0;

/**
 * `RenderVerzerrt` (`0x552FB0`) mit n = 20: Gitter über (0, 0)–(800, 600),
 * Texturkoordinaten `(i/n − pu·D, j/n − pv·D)` mit
 * `D = sin 9i° · cos 9i° · sin 9j° · cos 9j°` (Tabellen in Grad).
 */
class Warp {
  readonly mesh: Mesh;
  private readonly uvs = new Float32Array((GRID + 1) * (GRID + 1) * 2);
  private readonly frame: Rectangle;
  private readonly size: { w: number; h: number };

  constructor(logo: Texture, additive: boolean) {
    const n = GRID;
    const positions = new Float32Array((n + 1) * (n + 1) * 2);
    const indices: number[] = [];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const v = j * (n + 1) + i;
        positions[2 * v] = (800 / n) * i;
        positions[2 * v + 1] = (600 / n) * j;
        if (i < n && j < n) indices.push(v, v + 1, v + n + 1, v + 1, v + n + 2, v + n + 1);
      }
    this.frame = logo.frame;
    this.size = { w: logo.source.width, h: logo.source.height };
    const geometry = new MeshGeometry({
      positions,
      uvs: this.uvs,
      indices: new Uint32Array(indices),
    });
    this.mesh = new Mesh({ geometry, texture: new Texture({ source: logo.source }) });
    this.mesh.alpha = 0.33;
    this.mesh.blendMode = additive ? "add" : "normal";
  }

  set(pu: number, pv: number): void {
    const n = GRID;
    const f = this.frame;
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const dd =
          (SIN_DEG[degIndex(9 * i)] ?? 0) *
          (SIN_DEG[degIndex(9 * j)] ?? 0) *
          (COS_DEG[degIndex(9 * i)] ?? 0) *
          (COS_DEG[degIndex(9 * j)] ?? 0);
        const u = i / n - pu * dd;
        const v = j / n - pv * dd;
        const k = 2 * (j * (n + 1) + i);
        this.uvs[k] = (f.x + u * f.width) / this.size.w;
        this.uvs[k + 1] = (f.y + v * f.height) / this.size.h;
      }
    this.mesh.geometry.uvs = this.uvs;
  }

  destroy(): void {
    this.mesh.texture.destroy(false);
    this.mesh.destroy({ children: true });
  }
}

/** Glitch-Vorspann (nur Intergenies): 91 Durchläufe à `Wait 31`. */
export class LogoGlitch implements Scene {
  private readonly loop = new FixedStepLoop(31);
  private readonly pass = new Container();
  private readonly shown = new Container();
  private readonly warps: Warp[];
  private readonly noise: NoiseLayer;
  private readonly bands: Sprite[] = [];
  private t = 0;
  private cnt = 0;
  private k1 = 0;
  private k2 = 0;

  constructor(
    private readonly host: GameHost,
    private readonly app: Application,
    private readonly targets: ScreenTargets,
    logo: Texture,
    noise: Texture | undefined,
    private readonly rnd: VbRnd,
  ) {
    this.pass.addChild(new Graphics().rect(0, 0, 800, 600).fill(0x000000));
    this.warps = [new Warp(logo, false), new Warp(logo, true), new Warp(logo, true)];
    for (const w of this.warps) this.pass.addChild(w.mesh);
    this.noise = new NoiseLayer(noise);
    this.pass.addChild(this.noise.root);
    this.shown.addChild(new Sprite(targets.back));
    for (let y = 90; y <= 510; y += 7) {
      const s = new Sprite(
        new Texture({ source: targets.back.source, frame: new Rectangle(0, y, 1, 7) }),
      );
      s.visible = false;
      this.bands.push(s);
      this.shown.addChild(s);
    }
    app.stage.addChild(this.shown);
  }

  frame(now: number): boolean {
    const n = this.loop.frame(now);
    for (let i = 0; i < n; i++) {
      if (pauseKey(this.host) || this.t > 90) return true;
      this.step();
    }
    return false;
  }

  private step(): void {
    const { rnd, t } = this;
    const s = sinD;
    if (this.cnt <= 0) {
      this.k1 = vbInt(rnd.next() * 360);
      this.k2 = vbInt(rnd.next() * 360);
      this.cnt = cint(rnd.next() * 10 + 5);
    } else this.cnt--;
    const [a, b, c] = this.warps as [Warp, Warp, Warp];
    a.set(s(this.k2) / 3, s(this.k1) / 2);
    b.set(s(this.k2 + t) / 4, s(this.k1 + t) / 4);
    c.set(s(2 * t), s(2 * t));
    const alpha = f32(s(2 * t) / 4 + rnd.next() * 0.3);
    this.noise.set(rollNoise(rnd), alpha);
    this.targets.draw(this.pass, this.targets.back, true);
    // Zeilenriss: Bänder um s px nach rechts (aus dem Bild vor dem Riss)
    const cc = COS_DEG[degIndex(4 * t)] ?? 0;
    this.bands.forEach((band, i) => {
      const y = 90 + 7 * i;
      let shift = cint(f32(50 - cc * 50) * s(cint((y / 600) * 180)));
      shift = cint(shift + rnd.next() * 5);
      band.visible = shift > 2;
      if (!band.visible) return;
      band.texture.frame.width = 800 - shift;
      band.texture.update();
      band.position.set(shift, y);
    });
    this.t++;
  }

  destroy(): void {
    this.app.stage.removeChild(this.shown);
    for (const b of this.bands) b.texture.destroy(false);
    this.shown.destroy({ children: true });
    for (const w of this.warps) w.destroy();
    this.pass.destroy({ children: true });
  }
}

/** Anzeige: a + b Durchläufe à `Wait 25`, Schwarzschleier α 1 → 0 in b Schritten (Intergenies ab 0). */
export class LogoShow implements Scene {
  private readonly loop = new FixedStepLoop(25);
  private readonly root = new Container();
  private readonly veil = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
  private k = 0;

  constructor(
    private readonly host: GameHost,
    private readonly app: Application,
    logo: Texture,
    private readonly hold: number,
    private readonly fadeIn: number,
    private alpha: number,
    rnd: VbRnd,
  ) {
    // `t0 = CLng(Rnd · 10000)` (Uhr für den nie benutzten Spezialeffekt)
    rnd.next();
    this.root.addChild(
      new Graphics().rect(0, 0, 800, 600).fill(0x000000),
      new Sprite(logo),
      this.veil,
    );
    this.veil.alpha = Math.max(0, alpha);
    app.stage.addChild(this.root);
  }

  frame(now: number): boolean {
    const n = this.loop.frame(now);
    for (let i = 0; i < n; i++) {
      if (pauseKey(this.host) || this.k >= this.hold + this.fadeIn) return true;
      this.veil.alpha = Math.max(0, Math.min(1, this.alpha));
      this.k++;
      if (this.k <= this.fadeIn) this.alpha = f32(this.alpha - 1 / this.fadeIn);
    }
    return false;
  }

  destroy(): void {
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
  }
}

/** Zoom-Tunnel (Toxeen, Clockwork): 50 Durchläufe à `Wait 16`. */
export class LogoTunnel implements Scene {
  private readonly loop = new FixedStepLoop(16);
  private readonly pass = new Container();
  private readonly shown: Sprite;
  private readonly logo: Sprite;
  private alpha = 0.85;
  private k = 0;

  constructor(
    private readonly host: GameHost,
    private readonly app: Application,
    private readonly t: ScreenTargets,
    logo: Texture,
  ) {
    // das letzte Anzeigebild ist der Anfang der Rückkopplung
    t.draw(app.stage, t.back, true);
    const copy = new Sprite(t.tmp);
    copy.position.set(16, 16);
    copy.width = 768;
    copy.height = 568;
    const black = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
    black.alpha = 0.1;
    this.logo = new Sprite(logo);
    this.pass.addChild(copy, black, this.logo);
    this.shown = new Sprite(t.back);
    app.stage.addChild(this.shown);
  }

  frame(now: number): boolean {
    const n = this.loop.frame(now);
    for (let i = 0; i < n; i++) {
      if (pauseKey(this.host) || this.k >= 50) return true;
      this.alpha = Math.max(0, f32(this.alpha - 0.05));
      this.logo.alpha = this.alpha;
      this.logo.visible = this.alpha > 0;
      this.t.copyBack();
      this.t.draw(this.pass, this.t.back);
      this.k++;
    }
    return false;
  }

  destroy(): void {
    this.app.stage.removeChild(this.shown);
    this.shown.destroy();
    this.pass.destroy({ children: true });
  }
}
