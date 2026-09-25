import { Container } from "pixi.js";
import { type HighscoreEntry, highscoreLine } from "../highscore";
import { Gfx, drawShip } from "../gfx";
import { type FlowEnv, type Screen } from "../screen";
import type { TitleStars } from "../stars";
import { HIGHSCORE_TEXT } from "../texts";
import { LogoAnim } from "./common";

/** Menüpunkte in Tabellenreihenfolge (`0x4AF742`). */
export const MenuItem = {
  Play: 0,
  Extra: 1,
  Tutorial: 2,
  Info: 3,
  Options: 4,
  Quit: 5,
} as const;
export type MenuItem = (typeof MenuItem)[keyof typeof MenuItem];

/** Ergebnis des Titels: Menüpunkt oder ESC (`Me.690 = 2`). */
export type TitleResult = MenuItem | "escape";

const SHIP_REST_X = 400;
const CURSOR_Y0 = 120;
const CURSOR_STEP = 42;
const HS_X = 1;
const HS_Y = 240;
/** Zeilenhöhe der Highscore-Surface (280×150, 10 Zeilen). */
const HS_LINE = 15;

/** Ebenen: Hintergrund, gekeyte Titelgrafik, Schiff. */
const L_BG = 0;
const L_KEYED = 1;
const L_SHIP = 2;

/**
 * Titelbildschirm (Schleife ab `0x4AA9E1`): Sternenfeld mit „KATHA“-Easteregg,
 * Rasterbalken hinter der Highscoreliste, die aus vierfacher Größe einzoomt,
 * rotierendes DOVE-Logo, Menü aus `titel.spr` mit dem Schiff als Cursor und
 * die Credits-Zeilen unten.
 */
export class TitleScreen implements Screen<TitleResult> {
  readonly images = [
    "image/titel",
    "image/logo",
    "image/ss",
    "image/text",
  ] as const satisfies readonly string[];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly highscore = new Container();
  private readonly logo = new LogoAnim();
  private sel = 0;
  private shipX = 0;
  private shipY = CURSOR_Y0;
  private tilt = 0;
  private flame = 2;
  private confirmed = false;
  private started = false;
  /** Zoom der Highscoreliste in Zehnteln (4,0 → 1,0, `0x4ACB66`). */
  private hsZoom = 40;
  /** Winkel des Rasterbalkens (0…359, `0x4AC336`). */
  private barAngle = 0;
  private sparkles: [number, number][] = [];

  constructor(
    private readonly env: FlowEnv,
    private readonly stars: TitleStars,
    private readonly list: readonly HighscoreEntry[],
    initial: MenuItem = MenuItem.Play,
  ) {
    this.g = new Gfx(env.frames, [{}, { keyed: true }, {}]);
    this.root = this.g.root;
    this.sel = initial;
    this.shipY = CURSOR_Y0 + CURSOR_STEP * initial;
    // Highscore-Surface zwischen Hintergrund und gekeyter Ebene
    this.root.addChildAt(this.highscore, 1);
  }

  /** `erstelleHighScoreS`: 280×150-Surface, Zeile 0 „HighScore:“, dann die neun Plätze. */
  private buildHighscore(): void {
    const g = new Gfx(this.env.frames);
    g.begin();
    g.text(0, HIGHSCORE_TEXT.title, 0, 0);
    this.list.forEach((e, i) => g.text(0, highscoreLine(i + 1, e), 0, HS_LINE * (i + 1)));
    g.end();
    this.highscore.addChild(g.root);
    this.highscore.position.set(HS_X, HS_Y);
  }

  update(): TitleResult | undefined {
    const { keys, audio, rnd } = this.env;
    if (!this.started) {
      this.started = true;
      this.buildHighscore();
      // Titelmenü erscheint: Antrieb Ex(30, 0) (`0x4AB606`)
      audio?.effect("antrieb", 30);
    }
    this.stars.tick();
    this.barAngle = (this.barAngle + 1) % 360;
    this.sparkles = Array.from({ length: 5 }, () => [rnd.below(250), rnd.below(12) + 255]);
    if (this.hsZoom > 10) this.hsZoom--;
    this.logo.tick();

    if (!this.confirmed) {
      if (keys.hit("escape")) return "escape";
      if (keys.hit("up") && this.sel > 0) this.sel--;
      if (keys.hit("down") && this.sel < MenuItem.Quit) this.sel++;
      if (keys.hit("confirm")) {
        this.confirmed = true;
        audio?.effect("antrieb", 30);
        if (this.shipX === SHIP_REST_X) this.shipX += 4;
      }
    }
    // Cursor gleitet mit 4 px/Frame zum Ziel (`0x4ACEDB`), Neigung 2 sinkend, 1 steigend.
    const target = CURSOR_Y0 + CURSOR_STEP * this.sel;
    this.tilt = 0;
    if (this.shipY + 3 < target) {
      this.shipY += 4;
      this.tilt = 2;
    } else if (this.shipY - 3 > target) {
      this.shipY -= 4;
      this.tilt = 1;
    }
    if (this.shipX !== SHIP_REST_X) {
      this.shipX += 4;
      this.flame = rnd.below(3) + 1;
    } else {
      this.flame = 2;
    }
    if (this.shipX >= 640) return this.sel as MenuItem;
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    this.stars.draw(g, L_BG);
    // Rasterbalken: fünf Zeilen à 250 px, y = Int(Sin·75) + 311 (Farben geschätzt)
    const by = Math.round(Math.sin((this.barAngle * Math.PI) / 180) * 75) + 311;
    const bar = [0x000080, 0x0000f8, 0x8080f8, 0x0000f8, 0x000080];
    bar.forEach((c, i) => g.fill(L_BG, 0, by + i, 250, 1, c));
    // Glitzern auf Platz 1: fünf 2×2-Punkte RGB565 0x0300 (`0x4AC7AD`)
    for (const [x, y] of this.sparkles) g.fill(L_BG, x, y, 2, 2, 0x006000);
    this.logo.draw(g, L_BG);
    // Menü `titel.spr` (450, 0)–(640, 250) an (450, 103), Credits (0, 244)–(480, 320) an (2, 399)
    g.blit(L_KEYED, "image/titel", 450, 0, 190, 250, 450, 103);
    g.blit(L_KEYED, "image/titel", 0, 244, 480, 76, 2, 399);
    drawShip(g, L_SHIP, this.shipX, this.shipY, this.tilt, this.flame);
    g.end();
    const s = this.hsZoom / 10;
    // Gestreckt ab (1, 240), rechts/unten am Bildrand abgeschnitten wie das Blt-Clipping.
    this.highscore.scale.set(s, s);
  }

  dispose(): void {
    this.highscore.destroy({ children: true });
    this.g.destroy();
  }
}
