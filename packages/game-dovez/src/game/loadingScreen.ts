import type { AtlasJson, GameHost } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { type Application, Container, Graphics, Sprite, type Texture } from "pixi.js";
import { SIN_DEG, cint } from "../sim/vb";
import { GdiText, atlasTexture } from "./gdi";
import { okKey, pauseKey } from "./input";
import type { Scene } from "./scene";

/**
 * Ladebildschirm von `LadeDaten` (`0x4C72C0`), zwei Varianten:
 *
 * - **Bild** (Kampagne, `take<n>` aus `Loading.d2p`, auf 800 × 600 gestreckt):
 *   Balken (290, 480)…(290 + 220·p) 6 px, Verlauf Schwarz → RGB(137, 190, 255),
 *   weißer Rahmen (290, 476)–(510, 484), „nn%“ (System 16 bei 410 − 5·Len, 455),
 *   „Loading“ (System 18 bei 376, 490); danach „Press any key to start!“
 *   (System 24, Grau 129…255 pulsierend, 294, 470) bis `TasteOK` oder Esc,
 *   dann Loslassen von Esc abwarten. Kein deutscher Text.
 * - **Mosaik** (`Loadingscreen.bmp`, Einzellevel und Epilog): 90 % Schwarz,
 *   blaue und weiße Bänder, drei Leuchtkreise, Logo (200, 120), „nn%“
 *   (System 32 bei 395 − 5·Len, 405); ohne Tastendruck.
 *
 * `p` ist im Original der Anteil der geladenen Bildgruppen, im Port der
 * geladenen Bytes. „System“ ist eine Rasterschrift, `OUT_TT_ONLY_PRECIS`
 * erzwingt eine TrueType-Ersatzschrift — hier Arial wie bei den anderen GDI-Texten.
 */
const byte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);

export class LoadingScene implements Scene {
  private readonly root = new Container();
  private readonly back: Sprite;
  private readonly fx = new Container();
  private readonly bar = new Graphics();
  private readonly percent: GdiText;
  private readonly loading = new GdiText(18, 0xffffff);
  private readonly press = new GdiText(24, 0xffffff);
  private readonly sprites: Sprite[] = [];
  private readonly owned: Texture[] = [];
  private p = 0;
  private ready = false;
  /** Sinuszähler des Pulsierens (`k`, je Anzeigebild ein Grad). */
  private k = 0;
  private waitRelease = false;

  constructor(
    private readonly host: GameHost,
    private readonly app: Application,
    textures: TextureRegistry,
    standart: AtlasJson,
    private readonly image: Texture,
    private readonly mosaic: boolean,
  ) {
    this.back = new Sprite(image);
    this.back.width = 800;
    this.back.height = 600;
    this.percent = new GdiText(mosaic ? 32 : 16, 0xffffff);
    this.root.addChild(this.back, this.fx);
    if (mosaic) {
      const tex = (key: string) => {
        const t = atlasTexture(textures, standart, key);
        if (t) this.owned.push(t);
        return t;
      };
      const weiss = tex("weiss");
      const balken = tex("balken");
      const kreis = tex("a_kreis2");
      const logo = tex("logo");
      const add = (t: Texture | undefined, blend: "normal" | "add") => {
        const s = new Sprite(t);
        s.blendMode = blend;
        this.sprites.push(s);
        this.fx.addChild(s);
        return s;
      };
      if (weiss) add(weiss, "normal");
      if (balken) {
        add(balken, "add");
        add(balken, "add");
      }
      if (kreis) for (let i = 0; i < 3; i++) add(kreis, "add");
      if (logo) {
        const s = add(logo, "normal");
        s.position.set(200, 120);
      }
    } else {
      this.fx.addChild(this.bar, this.loading.text);
      this.loading.set("Loading", 376, 490);
    }
    this.fx.addChild(this.percent.text);
    this.press.text.visible = false;
    this.root.addChild(this.press.text);
    app.stage.addChild(this.root);
    this.draw();
  }

  /** Ladefortschritt 0…1. */
  progress(p: number): void {
    this.p = Math.max(0, Math.min(1, p));
  }

  /** Alles geladen: Bild-Variante wartet auf eine Taste, das Mosaik ist fertig. */
  finish(): void {
    this.p = 1;
    this.ready = true;
  }

  private rect(s: Sprite | undefined, x1: number, y1: number, x2: number, y2: number): void {
    if (!s) return;
    s.position.set(x1, y1);
    s.width = x2 - x1;
    s.height = y2 - y1;
  }

  private tint(s: Sprite | undefined, r: number, g: number, b: number, a: number): void {
    if (!s) return;
    s.tint = (byte(r) << 16) | (byte(g) << 8) | byte(b);
    s.alpha = Math.max(0, Math.min(1, a));
  }

  private draw(): void {
    const p = Math.fround(this.p);
    const s = `${Math.floor(p * 100)}%`;
    if (this.mosaic) {
      const [weiss, band1, band2, k1, k2, k3] = this.sprites;
      this.rect(weiss, 0, 0, 800, 600);
      this.tint(weiss, 0, 0, 0.05, 0.9);
      this.rect(band1, 0, 110, 800, 280);
      this.tint(band1, 0.2, 0.2, 1, 1);
      this.rect(band2, 0, 150, 800, 240);
      this.tint(band2, 1, 1, 1, 1);
      const d = cint(60 - p * 30);
      this.rect(k1, 150, 330, 650, 510);
      this.tint(k1, p * 0.2, p * 0.2, 1, 0.5);
      this.rect(k2, 180, 330 + d, 620, 510 - d);
      this.tint(k2, 0.4 + p * 0.2, 0.5, 1, 1);
      // der dritte Kreis folgt im Original den Bildern je Gruppe; im Port dem Byte-Fortschritt
      const q = p;
      const e = cint(q * 90);
      this.rect(k3, 330 - 1.5 * e, 420 - e, 470 + 1.5 * e, 420 + e);
      this.tint(k3, 1, 1, 1, 0.9 - q * 0.9);
      this.percent.set(s, cint(395 - s.length * 5), 405);
      return;
    }
    const g = this.bar.clear();
    const len = 220 * p;
    const steps = 16;
    if (len > 0)
      for (let i = 0; i < steps; i++) {
        const f = (i + 0.5) / steps;
        g.rect(290 + (len * i) / steps, 477, len / steps + 0.5, 6).fill(
          (byte(0.537 * f) << 16) | (byte(0.745 * f) << 8) | byte(f),
        );
      }
    g.rect(290, 476, 220, 1).fill(0xffffff);
    g.rect(290, 484, 220, 1).fill(0xffffff);
    g.rect(290, 476, 1, 9).fill(0xffffff);
    g.rect(510, 476, 1, 9).fill(0xffffff);
    this.percent.set(s, 410 - s.length * 5, 455);
  }

  frame(): boolean {
    if (!this.ready) {
      this.draw();
      return false;
    }
    if (this.mosaic) return true;
    if (this.waitRelease) return !pauseKey(this.host);
    // „Press any key to start!“: nur das Bild, der Text pulsiert
    this.fx.visible = false;
    const ok = okKey(this.host);
    const esc = pauseKey(this.host);
    if (ok || esc) {
      this.waitRelease = true;
      return !esc;
    }
    this.k = (this.k + 1) % 360;
    const v = cint((SIN_DEG[this.k] ?? 0) * 63 + 192);
    this.press.text.style.fill = (v << 16) | (v << 8) | v;
    this.press.set("Press any key to start!", 294, 470);
    this.press.text.visible = true;
    return false;
  }

  destroy(): void {
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
    for (const t of this.owned) t.destroy(false);
    // das Mosaik ist eine eigene Canvas-Textur, das Take-Bild ein Atlas-Ausschnitt
    this.image.destroy(this.mosaic);
  }
}
