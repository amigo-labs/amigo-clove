import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { cint } from "../sim/vb";
import type { ContinuePass } from "./continueScreen";
import { GdiText } from "./gdi";
import type { ScreenTargets } from "./screenTargets";

/**
 * Zeichnet einen Continue-Durchlauf in den Backbuffer der Bildschirme
 * (`ScreenTargets.back`) in der Reihenfolge des Originals: Spielbild (30 %
 * abgedunkelt) → Hauch, Schnee, Streifen (D3D) → GDI-Texte → Bildriss →
 * Blur. Beim Ausschalten wird nichts gelöscht, nur um 15 % abgedunkelt.
 */
export class ContinueView {
  private readonly shotSprite: Sprite;
  private readonly fx = new Container();
  private readonly plain = new Graphics();
  private readonly additive = new Graphics();
  private readonly glow: Sprite | undefined;
  private readonly texts = new Container();
  private readonly title: GdiText[];
  private readonly digit: GdiText[];
  private readonly tear = new Container();

  constructor(
    private readonly t: ScreenTargets,
    kreis: Texture | undefined,
    ranks: readonly { readonly text: string; readonly player: number }[],
  ) {
    this.shotSprite = new Sprite(t.shot);
    this.additive.blendMode = "add";
    this.additive.alpha = 0.8;
    this.fx.addChild(this.plain, this.additive);
    if (kreis) this.glow = new Sprite(kreis);
    this.title = [0x000000, 0x000000, 0xffffff].map((c) => new GdiText(128, c));
    this.title[0]!.set("Continue", 78, 198);
    this.title[1]!.set("Continue", 82, 202);
    this.title[2]!.set("Continue", 80, 200);
    this.digit = [0x000000, 0x000000, 0xffffff].map((c) => new GdiText(128, c));
    this.texts.addChild(...this.title.map((g) => g.text), ...this.digit.map((g) => g.text));
    for (const r of ranks) {
      const shadow = new GdiText(24, 0x000000);
      const main = new GdiText(24, 0xffffff);
      const x = 400 - Math.trunc(cint(main.width(r.text)) / 2);
      shadow.set(r.text, x - 1, 489 + 20 * r.player);
      main.set(r.text, x, 490 + 20 * r.player);
      this.texts.addChild(shadow.text, main.text);
    }
  }

  draw(pass: ContinuePass): void {
    const t = this.t;
    const plain = this.plain.clear();
    const add = this.additive.clear();
    if (pass.kind === "normal") {
      this.shotSprite.position.set(0, 0);
      this.shotSprite.scale.set(1, 1);
      t.draw(this.shotSprite, t.back, true);
      plain.alpha = 0.1;
      const h = pass.haze;
      if (h) plain.rect(h.x1, h.y1, h.x2 - h.x1, h.y2 - h.y1).fill(0x000000);
      for (let i = 0; i < pass.flakes.length; i += 2)
        add.rect(pass.flakes[i]!, pass.flakes[i + 1]!, 2, 2).fill(0xffffff);
      for (const x of pass.stripes) add.rect(x, 0, 1, 600).fill(0xffffff);
      t.draw(this.fx, t.back);
      const d = String(pass.digit);
      this.digit[0]!.set(d, 618, pass.digitY - 2);
      this.digit[1]!.set(d, 622, pass.digitY + 2);
      this.digit[2]!.set(d, 620, pass.digitY);
      t.draw(this.texts, t.back);
      if (pass.tear !== undefined) this.drawTear(pass.tear);
    } else {
      plain.alpha = 0.15;
      plain.rect(0, 0, 800, 600).fill(0x000000);
      t.draw(this.fx, t.back);
      const s = pass.shrink;
      if (s && s.x2 > s.x1 && s.y2 > s.y1) {
        this.shotSprite.position.set(s.x1, s.y1);
        this.shotSprite.scale.set((s.x2 - s.x1) / 800, (s.y2 - s.y1) / 600);
        t.draw(this.shotSprite, t.back);
      }
      const g = pass.glow;
      if (g && this.glow) {
        this.glow.position.set(g.x1, g.y1);
        this.glow.width = g.x2 - g.x1;
        this.glow.height = g.y2 - g.y1;
        t.draw(this.glow, t.back);
      }
    }
    t.blurOver(pass.blurAlpha);
  }

  /** ⑨ Zeilen v−1 und v+1 um 7 px, Zeile v um 15 px nach rechts (im Backbuffer). */
  private drawTear(v: number): void {
    const t = this.t;
    t.copyBack();
    for (const c of this.tear.removeChildren()) c.destroy({ texture: true });
    for (const [row, dx, w] of [
      [v - 1, 7, 793],
      [v + 1, 7, 793],
      [v, 15, 785],
    ] as const) {
      if (row < 0 || row >= 600) continue;
      const tex = new Texture({ source: t.tmp.source, frame: new Rectangle(0, row, w, 1) });
      const s = new Sprite(tex);
      s.position.set(dx, row);
      this.tear.addChild(s);
    }
    t.draw(this.tear, t.back);
  }

  destroy(): void {
    for (const c of this.tear.removeChildren()) c.destroy({ texture: true });
    this.tear.destroy();
    this.fx.destroy({ children: true });
    this.texts.destroy({ children: true });
    this.shotSprite.destroy();
    this.glow?.destroy();
  }
}
