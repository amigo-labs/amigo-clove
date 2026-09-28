import {
  Container,
  Matrix,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  type Renderer as PixiRenderer,
} from "pixi.js";

/**
 * Bildbruch der Super-Nova (Varianten 3 und 4, `§5.5a`): Das Original blittet
 * den Backbuffer streifenweise auf sich selbst (`BltFast`), erst senkrecht,
 * dann waagerecht. Der Port rendert alles, was vor `SpielNova` gezeichnet
 * wurde, in eine Textur, legt darüber die senkrechten Streifen, rendert das
 * in eine zweite Textur und zeigt diese mit den waagerechten Streifen an
 * Stelle der verdeckten Ebenen. *Näherung:* Im Original sammeln sich die
 * Versätze über die Ticks an (kein Flip bei Hintergrund ≤ 0, „Schmelzen“);
 * der Port bricht jedes Bild neu aus dem ungestörten Spielfeld.
 */

const W = 800;
const H = 600;
const IDENTITY = new Matrix();

export class NovaScreen {
  /** Ergebnis im Spielfeld, direkt vor der Nova-Zeichenliste. */
  private readonly layer = new Container();
  /** Zwischenbild aus Durchgang 1 (senkrechte Streifen). */
  private readonly stage = new Container();
  private readonly passA = RenderTexture.create({ width: W, height: H });
  private readonly passB = RenderTexture.create({ width: W, height: H });
  private readonly pool = new Map<Container, Sprite[]>();
  private hidden: Container[] = [];
  /** Selbst angelegte Ausschnitt-Texturen (werden beim Ersetzen zerstört). */
  private readonly owned = new Set<Texture>();

  constructor(
    private readonly pixi: PixiRenderer,
    private readonly field: Container,
    before: Container,
  ) {
    field.addChildAt(this.layer, field.getChildIndex(before));
    this.layer.visible = false;
  }

  /** Je Frame nach dem Füllen der Ebenen: `blits` = [senkrecht, waagerecht] je `dx, dy, sx, sy, w, h`. */
  apply(blits: readonly [readonly number[], readonly number[]]): void {
    for (const c of this.hidden) c.visible = true;
    this.hidden = [];
    this.layer.visible = false;
    if (blits[0].length === 0 && blits[1].length === 0) return;
    const kids = this.field.children;
    const at = kids.indexOf(this.layer);
    const upper = kids.slice(at + 1).filter((c) => c.visible);
    for (const c of upper) c.visible = false;
    this.pixi.render({
      container: this.field,
      target: this.passA,
      clear: true,
      transform: IDENTITY,
    });
    for (const c of upper) c.visible = true;
    this.compose(this.stage, this.passA, blits[0]);
    this.pixi.render({ container: this.stage, target: this.passB, clear: true });
    this.compose(this.layer, this.passB, blits[1]);
    this.layer.visible = true;
    this.hidden = kids.slice(0, at).filter((c) => c.visible);
    for (const c of this.hidden) c.visible = false;
  }

  /** Ganzes Bild, darüber die Streifen (Quelle → Ziel) aus demselben Bild. */
  private compose(into: Container, source: RenderTexture, blits: readonly number[]): void {
    let sprites = this.pool.get(into);
    if (!sprites) this.pool.set(into, (sprites = []));
    const n = blits.length / 6 + 1;
    while (sprites.length < n) {
      const s = new Sprite();
      sprites.push(s);
      into.addChild(s);
    }
    sprites.forEach((s, i) => {
      s.visible = i < n;
      if (!s.visible) return;
      const old = s.texture;
      if (i === 0) {
        s.texture = source;
        s.position.set(0, 0);
      } else {
        const [dx, dy, sx, sy, bw, bh] = blits.slice(6 * (i - 1), 6 * i) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        s.texture = new Texture({ source: source.source, frame: new Rectangle(sx, sy, bw, bh) });
        this.owned.add(s.texture);
        s.position.set(dx, dy);
      }
      if (this.owned.delete(old)) old.destroy(false);
    });
  }

  destroy(): void {
    for (const t of this.owned) t.destroy(false);
    this.owned.clear();
    this.passA.destroy(true);
    this.passB.destroy(true);
    this.stage.destroy({ children: true });
  }
}
