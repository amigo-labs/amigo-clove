import type { AtlasJson } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { type Application, Container, Sprite, type Texture } from "pixi.js";
import { Compositor, type PlanItem } from "../render/Compositor";
import { paintList } from "../render/paintList";
import { SpriteBatch } from "../render/SpriteBatch";
import type { StripTexture } from "../render/StripMesh";
import { GdiText, atlasTexture } from "./gdi";
import { LOVE_TEXT, TEXT_POS, TEXT_SIZE, type LoveLogic } from "./love";

/**
 * Zeichnet einen Durchlauf des Ostereis „LOV“ in einen nie gelöschten
 * Backbuffer (`Compositor`, wie im Original): Plasma-Hintergrund, Einblendung
 * und Leuchtpunkte als D3D-Befehle, dann die GDI-Schrift „Ich liebe dich“
 * (zwei schwarze Ränder bei −1/−1 und +1/+1, der Text in Grau darüber; das
 * Original zeichnet sie zwischen `EndScene` und `BeginScene`), zuletzt die
 * Glitzerpartikel (`MoveBigPartikel`) darüber.
 */
export class LoveView {
  private readonly compositor: Compositor;
  private readonly screen: Sprite;
  private readonly owned: Texture[] = [];
  private readonly strips = new Map<string, StripTexture>();
  private readonly glitter: Texture | undefined;
  private readonly textLayer = new Container();
  private readonly text: GdiText;
  private readonly bigLayer = new Container();
  private readonly big: SpriteBatch;

  constructor(
    private readonly app: Application,
    textures: TextureRegistry,
    standart: AtlasJson,
  ) {
    this.compositor = new Compositor(app.renderer);
    for (const key of ["weiss", "a_kreis2", "glitzer"]) {
      const t = atlasTexture(textures, standart, key);
      if (!t) continue;
      this.owned.push(t);
      const s = t.source;
      const f = t.frame;
      this.strips.set(key, {
        id: `${s.uid}|${f.x},${f.y},${f.width},${f.height}`,
        texture: t,
        frame: [f.x / s.width, f.y / s.height, f.width / s.width, f.height / s.height],
        wrap: false,
      });
    }
    this.glitter = this.strips.get("glitzer")?.texture;
    // Ränder schwarz, der Text weiß mit `tint` in Grau (gleiche Texte teilen sich eine Pixi-Textur)
    const edge = [-1, 1].map((d) => {
      const g = new GdiText(TEXT_SIZE, 0x000000);
      g.set(LOVE_TEXT, TEXT_POS.x + d, TEXT_POS.y + d);
      return g;
    });
    this.text = new GdiText(TEXT_SIZE, 0xffffff).set(LOVE_TEXT, TEXT_POS.x, TEXT_POS.y);
    this.textLayer.addChild(edge[0]!.text, edge[1]!.text, this.text.text);
    this.big = new SpriteBatch(this.bigLayer);
    this.screen = new Sprite(this.compositor.bb);
    app.stage.addChild(this.screen);
  }

  private resolve = (key: string): StripTexture | undefined =>
    key === "@blur" ? this.compositor.targetTexture("blur") : this.strips.get(key);

  /** Der Durchlauf, den `logic` zuletzt gerechnet hat. */
  draw(logic: LoveLogic): void {
    const c = this.compositor;
    c.begin();
    const plan: PlanItem[] = [];
    c.expand(logic.bg, this.resolve, plan);
    c.expand(logic.fg, this.resolve, plan);
    if (logic.textGray > 0) {
      const g = logic.textGray;
      this.text.text.tint = (g << 16) | (g << 8) | g;
      plan.push(this.textLayer);
    }
    this.big.begin();
    paintList(this.big, logic.fx.lists.big, () => this.glitter, undefined);
    this.big.end();
    plan.push(this.bigLayer);
    c.play(plan);
  }

  destroy(): void {
    this.app.stage.removeChild(this.screen);
    this.screen.destroy();
    this.textLayer.destroy({ children: true });
    this.bigLayer.destroy({ children: true });
    this.compositor.destroy();
    for (const t of this.owned) t.destroy(false);
  }
}
