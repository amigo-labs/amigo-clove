import type { AtlasJson } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { Container, Graphics, type Renderer, RenderTexture, Sprite, type Texture } from "pixi.js";
import { paintList } from "../../render/paintList";
import { SpriteBatch } from "../../render/SpriteBatch";
import type { Effects } from "../../sim/effects";
import { cint } from "../../sim/vb";
import { GdiText, atlasTexture } from "../gdi";
import { NoiseLayer } from "./logos";
import { type MenuDraw, MenuLogic, qbColor } from "./menuLogic";

/** Wiederverwendete GDI-Texte einer Ebene (je Bild `begin`, `text`…, `end`). */
class TextPool {
  private readonly items: GdiText[] = [];
  private used = 0;
  constructor(
    private readonly layer: Container,
    private readonly size: number,
  ) {}
  begin(): void {
    this.used = 0;
  }
  text(s: string, x: number, y: number, color: number): GdiText {
    let t = this.items[this.used];
    if (!t) {
      t = new GdiText(this.size, 0xffffff);
      this.items.push(t);
      this.layer.addChild(t.text);
    }
    this.used++;
    t.text.tint = color;
    t.text.visible = true;
    return t.set(s, x, y);
  }
  width(s: string): number {
    return (this.items[0] ?? this.probe()).width(s);
  }
  private probe(): GdiText {
    const t = new GdiText(this.size, 0xffffff);
    t.text.visible = false;
    this.items.push(t);
    this.layer.addChild(t.text);
    return t;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.text.visible = false;
  }
  destroy(): void {
    for (const t of this.items) t.destroy();
  }
}

/**
 * Zeichnung des Hauptmenüs (`MenuLoop` `0x559630`, `ShowMenu` `0x558890`,
 * `ShowList` `0x558500`) aus einem `MenuDraw` der Logik. Ebenen in der
 * Reihenfolge des Originals: Schwarz → Hangar/Vereisung → DoveZ-Logo (200, 0)
 * → [Tafel] → Punktketten → Funken → Lampen, Knöpfe, Leisten → Knopftexte
 * (Arial 36) → Tafel, Schiff → Leuchtlinien → Liste (Arial 24) → Funken,
 * Glitzer → Überblende → Rauschen.
 */
export class MenuView {
  readonly root = new Container();
  private readonly textures = new Map<string, Texture | undefined>();
  private readonly owned: Texture[] = [];
  private readonly hangar: Sprite;
  private readonly frozen: Sprite;
  private readonly panelBefore = new Container();
  private readonly panelAfter = new Container();
  private readonly panelA: Sprite;
  private readonly panelB: Sprite;
  private readonly dots: SpriteBatch;
  private readonly sparks0: SpriteBatch;
  private readonly sprites: SpriteBatch;
  private readonly menuTexts: TextPool;
  private readonly ship: SpriteBatch;
  private readonly lines: SpriteBatch;
  private readonly listTexts: TextPool;
  private readonly late: SpriteBatch;
  private readonly still = RenderTexture.create({ width: 800, height: 600 });
  private readonly stillSprite = new Sprite(this.still);
  private readonly noise: NoiseLayer;
  /** α der Überblende (`Me.518`); −0,05 je Durchlauf vor dem Zeichnen. */
  private stillAlpha = 0;
  private dotCache: { n: number; dots: ReturnType<typeof MenuLogic.dots> } | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly registry: TextureRegistry,
    private readonly menu: AtlasJson,
    private readonly standart: AtlasJson,
    hangar: 0 | 1,
  ) {
    const layer = () => {
      const c = new Container();
      this.root.addChild(c);
      return c;
    };
    this.root.addChild(new Graphics().rect(0, 0, 800, 600).fill(0x000000));
    this.hangar = new Sprite(this.tex(`hangar${hangar}`));
    this.frozen = new Sprite(this.tex(`hangar_frozen${hangar}`));
    this.frozen.width = 800;
    this.frozen.height = 600;
    this.root.addChild(this.hangar, this.frozen);
    const logo = new Sprite(this.tex("logo", true));
    logo.position.set(200, 0);
    this.root.addChild(logo, this.panelBefore);
    this.panelA = new Sprite(this.tex("menu_back"));
    this.panelBefore.addChild(this.panelA);
    this.dots = new SpriteBatch(layer());
    this.sparks0 = new SpriteBatch(layer());
    this.sprites = new SpriteBatch(layer());
    this.menuTexts = new TextPool(layer(), 36);
    this.root.addChild(this.panelAfter);
    this.panelB = new Sprite(this.tex("menu_back"));
    this.panelAfter.addChild(this.panelB);
    this.ship = new SpriteBatch(layer());
    this.lines = new SpriteBatch(layer());
    this.listTexts = new TextPool(layer(), 24);
    this.late = new SpriteBatch(layer());
    this.stillSprite.visible = false;
    this.root.addChild(this.stillSprite);
    this.noise = new NoiseLayer(this.tex("noise", true));
    this.root.addChild(this.noise.root);
  }

  /** Sprite eines Atlas (`menu`, mit `std` aus `standart`). */
  private tex(key: string, std = false): Texture | undefined {
    const id = `${std ? "s" : "m"}:${key}`;
    if (this.textures.has(id)) return this.textures.get(id);
    const t = atlasTexture(this.registry, std ? this.standart : this.menu, key);
    if (t) this.owned.push(t);
    this.textures.set(id, t);
    return t;
  }

  /** Überblende von einem Bild aus (nach dem Intro: der Hangar). */
  startStill(from: Texture | undefined): void {
    if (from) {
      const s = new Sprite(from);
      this.renderer.render({ container: s, target: this.still, clear: true });
      s.destroy();
    }
    this.stillAlpha = 1;
  }

  /** Ein Durchlauf der Überblende (`OverlayEffekte`: `Me.518 −= 0,05`). */
  tick(): void {
    if (this.stillAlpha > 0) this.stillAlpha = Math.max(0, this.stillAlpha - 0.05);
  }

  draw(d: MenuDraw, fx: Effects): void {
    // Hangar, ab α 1 nur noch die Vereisung
    this.hangar.visible = d.frozen < 1;
    this.frozen.alpha = Math.max(0, Math.min(1, d.frozen));
    // Tafel vor oder nach der Knopfleiste
    const panel = d.panel;
    this.panelA.visible = !!panel && d.panelFirst;
    this.panelB.visible = !!panel && !d.panelFirst;
    if (panel) {
      const s = d.panelFirst ? this.panelA : this.panelB;
      s.position.set(panel[0], panel[1]);
      s.width = Math.max(0, panel[2] - panel[0]);
      s.height = panel[3] - panel[1];
    }
    this.drawMenu(d);
    // Schiff (Seite 1)
    this.ship.begin();
    for (const f of d.ship ?? []) {
      const t = this.tex(f.key);
      if (t) this.ship.put(t, d.shipX, 310, { alpha: f.alpha });
    }
    this.ship.end();
    this.lines.begin();
    if (d.lines) paintList(this.lines, d.lines, () => undefined, this.tex("balken", true));
    this.lines.end();
    this.drawList(d);
    // Funken (Ebene 1) und Glitzer
    this.late.begin();
    const std = (key: string) => this.tex(key, true);
    paintList(this.late, fx.lists.sparks1, (q) => std(q.key), undefined);
    paintList(this.late, fx.lists.big, (q) => std(q.key), undefined);
    this.late.end();
    // Überblende und Rauschen
    this.stillSprite.visible = this.stillAlpha > 0;
    this.stillSprite.alpha = this.stillAlpha;
    this.noise.set(d.noiseTiles, d.noise);
    const sparks = fx.lists.sparks0;
    this.sparks0.begin();
    paintList(this.sparks0, sparks, (q) => std(q.key), undefined);
    this.sparks0.end();
  }

  private drawMenu(d: MenuDraw): void {
    const m = d.menu;
    const n = m.entries.length - 1;
    if (this.dotCache?.n !== n) this.dotCache = { n, dots: MenuLogic.dots(n) };
    const kreis = this.tex("a_kreis2", true);
    this.dots.begin();
    if (kreis) {
      const sx = 3 / kreis.frame.width;
      const sy = 3 / kreis.frame.height;
      const dot = (cx: number, yy: number, g: number) => {
        const x = m.x + cx - 1;
        const y = m.y + yy;
        this.dots.put(kreis, x + 1.5 - kreis.frame.width / 2, y + 1.5 - kreis.frame.height / 2, {
          red: 1,
          green: g,
          blue: g,
          scaleX: sx,
          scaleY: sy,
        });
      };
      for (const [cx, yy] of this.dotCache.dots.red) dot(cx, yy, 0);
      for (const [cx, yy] of this.dotCache.dots.white) dot(cx, yy, 1);
    }
    this.dots.end();
    this.sprites.begin();
    const put = (key: string, x: number, y: number) => {
      const t = this.tex(key);
      if (t) this.sprites.put(t, cint(x), cint(y));
    };
    for (let i = 0; i <= n; i++) {
      put(m.sel === i ? "menu_lightb" : "menu_lighta", m.x + 50, m.y + 66 + 67 * i);
      put("menu_button", m.x + 136 + (m.offsets[i] ?? 0), m.y + 83 + 67 * i);
    }
    put("menu_topg", m.x, m.y);
    put("menu_bottomg", m.x + 57, m.y + 68 + 67 * (n + 1));
    this.sprites.end();
    const t = this.menuTexts;
    t.begin();
    const grey = qbColor(8);
    t.text(m.title, cint(m.x + 75), cint(m.y + 10), grey);
    t.text(m.title, cint(m.x + 76), cint(m.y + 11), 0x000000);
    m.entries.forEach((e, i) => {
      const o = m.offsets[i] ?? 0;
      t.text(e, cint(m.x + 164 + o), cint(m.y + 89 + 67 * i), grey);
      t.text(e, cint(m.x + 165 + o), cint(m.y + 90 + 67 * i), 0x000000);
    });
    t.end();
  }

  private drawList(d: MenuDraw): void {
    const t = this.listTexts;
    t.begin();
    const l = d.list;
    if (l)
      for (const r of l.rows) {
        t.text(r.text, l.x, l.y + 20 * r.index, r.color);
        t.text(r.text, l.x + 1, l.y + 20 * r.index + 1, r.top);
      }
    const grey = qbColor(8);
    d.scores?.forEach((s, i) => {
      const n = i + 1;
      const w = cint(t.width(s));
      t.text(s, 800 - w - 6, 20 * n + 225, grey);
      t.text(s, 800 - w - 5, 20 * n + 226, grey);
    });
    t.end();
  }

  /** `Blenden`: das fertige Bild (ohne Überblende und Rauschen) erfassen. */
  capture(): void {
    this.stillSprite.visible = false;
    this.noise.root.visible = false;
    this.renderer.render({ container: this.root, target: this.still, clear: true });
    this.noise.root.visible = true;
    this.stillAlpha = 1;
  }

  destroy(): void {
    this.menuTexts.destroy();
    this.listTexts.destroy();
    this.root.destroy({ children: true });
    this.still.destroy(true);
    for (const t of this.owned) t.destroy(false);
  }
}
