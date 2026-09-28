import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { LOG_ROWS, PREVIEW, type PausePass } from "./pauseScreen";
import { GdiText } from "./gdi";
import type { ScreenTargets } from "./screenTargets";

export interface PauseTexts {
  readonly menu: readonly [string, string];
  readonly title: string;
  readonly log: readonly string[];
}

/**
 * Zeichnet einen Pause-Durchlauf (ZEICHNEN #106–#229) in den Backbuffer:
 * Schwarz → Spielbild halb so groß in die Vorschau → Abtaststrich bzw.
 * Linsenstörung → `pausescreen` (Schwarz durchsichtig) → Menü, Titel,
 * Funkprotokoll → Einblendung aus dem Spielbild.
 */
export class PauseView {
  private readonly root = new Container();
  private readonly preview: Sprite;
  /** Pro Durchlauf neu gefüllt: Zeilenkopien, Balken, Rauschen, Linien. */
  private readonly dynamic = new Container();
  private readonly frames: Texture[] = [];
  private readonly menu: [GdiText, GdiText];
  private readonly fade: Sprite;

  constructor(
    private readonly t: ScreenTargets,
    private readonly balken: Texture | undefined,
    screen: Texture | undefined,
    private readonly texts: PauseTexts,
  ) {
    const bg = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
    this.preview = new Sprite(t.shot);
    this.preview.position.set(PREVIEW.x1, PREVIEW.y1);
    this.preview.scale.set(0.5, 0.5);
    this.root.addChild(bg, this.preview, this.dynamic);
    if (screen) this.root.addChild(new Sprite(screen));
    this.menu = [new GdiText(26, 0xffffff), new GdiText(21, 0xffffff)];
    this.root.addChild(this.menu[0].text, this.menu[1].text);
    const title = [
      [0x104010, 118, 33],
      [0x104010, 122, 37],
      [0x40ff40, 120, 35],
    ] as const;
    for (const [c, x, y] of title)
      this.root.addChild(new GdiText(20, c).set(texts.title, x, y).text);
    for (let i = 0; i < LOG_ROWS; i++)
      this.root.addChild(new GdiText(18, 0x40ff40).set(texts.log[i] ?? "", 135, 412 + 20 * i).text);
    this.fade = new Sprite(t.shot);
    this.root.addChild(this.fade);
  }

  /** Teilbild von `shot` (Rechteck x1, y1, x2, y2) gestreckt nach (x1, y1)–(x2, y2). */
  private blit(sx1: number, sy1: number, sx2: number, sy2: number, d: Rectangle): void {
    if (d.width <= 0 || d.height <= 0) return;
    const tex = new Texture({
      source: this.t.shot.source,
      frame: new Rectangle(sx1, sy1, sx2 - sx1, sy2 - sy1),
    });
    this.frames.push(tex);
    const s = new Sprite(tex);
    s.position.set(d.x, d.y);
    s.width = d.width;
    s.height = d.height;
    this.dynamic.addChild(s);
  }

  /** `Balken`-Rechteck, weiß α 0,1 additiv (optional gedreht um die Mitte). */
  private bar(x: number, y: number, w: number, h: number, vertical = false): void {
    if (!this.balken) return;
    const s = new Sprite(this.balken);
    s.blendMode = "add";
    s.alpha = 0.1;
    s.anchor.set(0.5);
    s.position.set(x + w / 2, y + h / 2);
    if (vertical) {
      s.rotation = Math.PI / 2;
      s.scale.set(h / this.balken.width, w / this.balken.height);
    } else s.scale.set(w / this.balken.width, h / this.balken.height);
    this.dynamic.addChild(s);
  }

  draw(pass: PausePass): void {
    for (const c of this.dynamic.removeChildren()) c.destroy();
    for (const f of this.frames.splice(0)) f.destroy(false);
    const { x1, y1, x2 } = PREVIEW;
    const pos = pass.pos;
    const y0 = pos + y1;
    if (!pass.lens) {
      // Zeile der Vorschau 2 px nach rechts, heller Abtaststrich
      if (y0 < PREVIEW.y2) this.blit(0, 2 * pos, 796, 2 * pos + 2, new Rectangle(290, y0, 398, 1));
      this.bar(x1, y0 - 1, x2 - x1, 3);
    } else {
      const amp = pass.lens.amp;
      this.blit(0, 2 * (pos - 20), 800, 2 * (pos - 2), new Rectangle(x1, y0 - 20, 400, 20 - amp));
      this.blit(0, 2 * (pos + 2), 800, 2 * (pos + 20), new Rectangle(x1, y0 + amp, 400, 20 - amp));
      this.blit(0, 2 * (pos - 2), 800, 2 * (pos + 2), new Rectangle(x1, y0 - amp, 400, 2 * amp));
      this.bar(x1, y0 - amp, 400, 2 * amp);
      const dots = new Graphics();
      for (let i = 0; i < pass.noise.length; i += 4) {
        const color = pass.noise[i + 3] === 1 ? 0xffffff : 0x000000;
        dots.rect(pass.noise[i]!, pass.noise[i + 1]!, pass.noise[i + 2]!, 1).fill(color);
      }
      this.dynamic.addChild(dots);
      pass.lines.forEach((x, k) => {
        this.bar(x + x1 - 3, y1, 6, 300, true);
        const dark = new Graphics().rect(x1, y1, 400, 300).fill(0x000000);
        dark.alpha = pass.flicker[k] ?? 0;
        this.dynamic.addChild(dark);
      });
    }
    const [resume, exit] = this.texts.menu;
    this.menu[0].setHeight(26 - 5 * pass.sel);
    this.menu[0].set(resume, 118, 89);
    this.menu[1].setHeight(21 + 5 * pass.sel);
    this.menu[1].set(exit, 118, 120);
    this.fade.visible = pass.fade !== undefined;
    this.fade.alpha = pass.fade ?? 0;
    this.t.draw(this.root, this.t.back, true);
  }

  destroy(): void {
    for (const f of this.frames.splice(0)) f.destroy(false);
    this.root.destroy({ children: true });
  }
}
