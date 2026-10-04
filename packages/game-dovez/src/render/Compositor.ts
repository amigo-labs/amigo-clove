import { followResolution } from "@clove/pixi-kit";
import { Container, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from "pixi.js";
import type { Capture, Copy, EnvList, RenderTarget } from "../sim/envDraw";
import { StripMesh, type StripTexture } from "./StripMesh";

/**
 * Backbuffer wie im Original: DoveZ löscht ihn nie (`RenderStart`/`Flip`
 * ohne Clear), Hintergrund 3 und die Beam-/Nova-Spuren legen nur einen
 * Schleier über das vorige Bild, Wasser und Flucht verschieben Streifen des
 * bisherigen Bildes, Glühen, Gewitter und Standbild erfassen es in
 * Render-Ziele. Hier ist er eine dauerhafte `RenderTexture`, in die jeder
 * Frame seine Ebenen ohne Löschen zeichnet; zwischen den Ebenen laufen die
 * Erfassungs- und Kopierbefehle der Umgebung (`sim/envDraw.ts`).
 */

/** Erfassen mit aufgelöstem Überblit-Bild (`a_kreis3`). */
export type PlanCapture = Capture & { readonly tex?: StripTexture | undefined };
export type PlanItem = Container | PlanCapture | Copy;

const W = 800;
const H = 600;

export class Compositor {
  /** Backbuffer `Me.1E4`, bilinear gelesen (Erfassen in `blur`). */
  readonly bb = RenderTexture.create({ width: W, height: H, scaleMode: "linear" });
  /** `Me.770` `blur` (64×64, gestreckt bilinear gezeichnet) und `Me.774` Standbild (`blur3`). */
  private readonly targets: Record<RenderTarget, RenderTexture> = {
    blur: RenderTexture.create({ width: 64, height: 64, scaleMode: "linear" }),
    lens: RenderTexture.create({ width: 64, height: 64, scaleMode: "linear" }),
    still: RenderTexture.create({ width: W, height: H, scaleMode: "nearest" }),
  };
  /** Kopie für `BltFast` Backbuffer → Backbuffer. */
  private readonly tmp = RenderTexture.create({ width: W, height: H, scaleMode: "nearest" });
  private readonly run = new Container();
  private readonly one = new Container();
  private readonly frames = new Map<string, Texture>();
  private readonly copies: Sprite[] = [];
  private readonly meshes: StripMesh[] = [];
  private meshesUsed = 0;
  private readonly runs: Container[] = [];
  private runsUsed = 0;

  constructor(private readonly pixi: Renderer) {}

  /** Render-Ziel als Streifen-Textur (`@blur`, `@still`). */
  targetTexture(t: RenderTarget): StripTexture {
    return { id: `@${t}`, texture: this.targets[t], frame: [0, 0, 1, 1], wrap: false };
  }

  /**
   * Zu Framebeginn: Streifen- und Ebenen-Pools zurücksetzen. In HD folgen
   * Backbuffer, Standbild und Kopie der Auflösung des Renderers; `blur` und
   * `lens` bleiben 64 × 64 wie im Original (der Weichzeichner lebt davon).
   */
  begin(): void {
    followResolution(this.pixi, this.bb, true);
    followResolution(this.pixi, this.targets.still, true);
    followResolution(this.pixi, this.tmp, false);
    this.meshesUsed = 0;
    for (let i = 0; i < this.runsUsed; i++) this.runs[i]!.removeChildren();
    this.runsUsed = 0;
  }

  /** Befehlsliste in Ebenen (je eine Folge von Streifen-Meshes) und Erfassen/Kopieren zerlegen. */
  expand(
    list: EnvList,
    resolve: (key: string) => StripTexture | undefined,
    out: PlanItem[],
    /** Deckkraft der gezeichneten Ebenen (bewegungsarme Darstellung schwächt Blitze ab). */
    alpha = 1,
  ): void {
    let run: Container | undefined;
    let mesh: StripMesh | undefined;
    // Mesh-Wechsel bei anderer Textur oder anderem Mischmodus (ohne Schlüssel-String je Streifen)
    let keyId = "";
    let keyAdditive = false;
    for (const c of list.cmds) {
      if (c.op !== "strip") {
        mesh?.finish();
        mesh = undefined;
        run = undefined;
        if (c.op === "capture" && c.overlay) out.push({ ...c, tex: resolve(c.overlay) });
        else out.push(c);
        continue;
      }
      const tex = resolve(c.key);
      if (!tex) continue;
      if (!run) {
        run = this.runs[this.runsUsed] ?? new Container();
        this.runs[this.runsUsed++] = run;
        run.alpha = alpha;
        out.push(run);
      }
      if (!mesh || tex.id !== keyId || c.additive !== keyAdditive) {
        mesh?.finish();
        mesh = this.meshes[this.meshesUsed] ?? new StripMesh();
        this.meshes[this.meshesUsed++] = mesh;
        mesh.reset(tex, c.additive);
        run.addChild(mesh.mesh);
        keyId = tex.id;
        keyAdditive = c.additive;
      }
      mesh.add(c);
    }
    mesh?.finish();
  }

  /** Den Plan auf den Backbuffer spielen: Ebenen gesammelt, Befehle dazwischen. */
  play(plan: readonly PlanItem[]): void {
    const pending: Container[] = [];
    const flush = () => {
      if (pending.length === 0) return;
      for (const c of pending) this.run.addChild(c);
      this.pixi.render({ container: this.run, target: this.bb, clear: false });
      this.run.removeChildren();
      pending.length = 0;
    };
    for (const item of plan) {
      if (item instanceof Container) pending.push(item);
      else {
        flush();
        if (item.op === "capture") this.capture(item);
        else this.copy(item);
      }
    }
    flush();
  }

  private frame(x: number, y: number, w: number, h: number): Texture {
    const id = `${x},${y},${w},${h}`;
    let t = this.frames.get(id);
    if (!t) {
      t = new Texture({ source: this.bb.source, frame: new Rectangle(x, y, w, h) });
      this.frames.set(id, t);
    }
    return t;
  }

  /** `blur.Blt(blur.rect, Backbuffer, src)` bzw. `Me.774.BltFast(…)`: Ausschnitt gestreckt ins Ziel. */
  private capture(c: PlanCapture): void {
    const target = this.targets[c.target];
    const [x, y, w, h] = c.src;
    const s = new Sprite(this.frame(x, y, w, h));
    if (c.target !== "still") s.scale.set(64 / w, 64 / h);
    this.one.addChild(s);
    this.pixi.render({ container: this.one, target, clear: true });
    this.one.removeChildren();
    s.destroy();
    if (c.tex) {
      // `BltFast(0, 0, a_kreis3, Farbschlüssel)`: das Bild deckt das ganze Ziel
      const o = new Sprite(c.tex.texture);
      o.width = target.width;
      o.height = target.height;
      this.one.addChild(o);
      this.pixi.render({ container: this.one, target, clear: false });
      this.one.removeChildren();
      o.destroy();
    }
  }

  /**
   * `BltFast` Backbuffer → Backbuffer über eine Kopie (WebGL liest und schreibt
   * nicht dieselbe Textur). Kopiert wird nur der Bereich der Quellrechtecke, per
   * GPU-Kopie statt eines Vollbilds über einen Sprite.
   */
  private copy(c: Copy): void {
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const [sx, sy, w, h] of c.rects) {
      x0 = Math.min(x0, Math.floor(sx));
      y0 = Math.min(y0, Math.floor(sy));
      x1 = Math.max(x1, Math.ceil(sx + Math.max(1, w)));
      y1 = Math.max(y1, Math.ceil(sy + Math.max(1, h)));
    }
    // die GPU-Kopie zählt in Pixeln des Ziels (in HD ein Vielfaches)
    const r = this.bb.source.resolution;
    x0 = Math.max(0, x0) * r;
    y0 = Math.max(0, y0) * r;
    x1 = Math.min(W, x1) * r;
    y1 = Math.min(H, y1) * r;
    if (x1 > x0 && y1 > y0)
      this.pixi.renderTarget.copyToTexture(
        this.bb,
        this.tmp,
        { x: x0, y: y0 },
        { width: x1 - x0, height: y1 - y0 },
        { x: x0, y: y0 },
      );
    c.rects.forEach(([sx, sy, w, h, dx, dy], i) => {
      let s = this.copies[i];
      if (!s) {
        s = new Sprite(new Texture({ source: this.tmp.source, frame: new Rectangle(0, 0, 1, 1) }));
        this.copies.push(s);
      }
      const t = s.texture;
      t.frame.x = sx;
      t.frame.y = sy;
      t.frame.width = Math.max(1, w);
      t.frame.height = Math.max(1, h);
      t.updateUvs();
      s.position.set(dx, dy);
      this.one.addChild(s);
    });
    this.pixi.render({ container: this.one, target: this.bb, clear: false });
    this.one.removeChildren();
  }

  destroy(): void {
    for (const m of this.meshes) m.destroy();
    for (const s of this.copies) s.destroy({ texture: true });
    for (const t of this.frames.values()) t.destroy(false);
    this.bb.destroy(true);
    this.tmp.destroy(true);
    this.targets.blur.destroy(true);
    this.targets.lens.destroy(true);
    this.targets.still.destroy(true);
  }
}
