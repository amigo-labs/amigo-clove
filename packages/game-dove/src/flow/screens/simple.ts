import type { Container } from "pixi.js";
import { Gfx } from "../gfx";
import {
  type Config,
  LEVEL_SELECT_NAMES,
  formatFactor,
  pointFactor,
  previewImage,
  selectableLevels,
  showsUnlockHint,
} from "../rules";
import type { FlowEnv, Screen } from "../screen";
import { INFO_LINES, OPTIONS_TEXT, farewellLines } from "../texts";
import { LogoAnim } from "./common";

/** Rahmenfarbe um Vorschaubilder (`Me.1540`, Wert geschätzt). */
export const FRAME_COLOR = 0x8c8cff;

/** Rahmenlinien um ein 320×240-Vorschaubild an (x, y), wie `0x45F84F`/`0x45C0B2`. */
export function drawPreviewFrame(g: Gfx, layer: number, x: number, y: number): void {
  g.fill(layer, x - 1, y - 1, 322, 1, FRAME_COLOR);
  g.fill(layer, x - 1, y + 240, 322, 1, FRAME_COLOR);
  g.fill(layer, x - 1, y - 1, 1, 242, FRAME_COLOR);
  g.fill(layer, x + 320, y - 1, 1, 242, FRAME_COLOR);
}

/**
 * NEO-ARTS-Logo (`ShowNEOARTS` `0x4A7880`): `titel.spr` (0, 0)–(224, 241)
 * zentriert, nach 500 ms läuft „presents“ an (340, 365) mit wachsendem
 * Zeichenabstand 1…8 auf (`PutTextA`), dann 1000 ms Standbild.
 */
export class NeoArtsScreen implements Screen<true> {
  readonly images = ["image/titel", "image/text"];
  private readonly g: Gfx;
  readonly root: Container;
  private t = 0;

  constructor(private readonly env: FlowEnv) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
  }

  update(): true | undefined {
    this.t++;
    if (this.env.keys.hit("escape") || this.env.keys.hit("confirm")) return true;
    return this.t >= 36 + 8 + 71 ? true : undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    g.blit(0, "image/titel", 0, 0, 224, 241, (640 - 224) >> 1, (480 - 241) >> 1);
    const spacing = Math.min(8, this.t - 36);
    if (spacing >= 1) g.text(0, "presents", 340, 365, spacing);
    g.end();
  }

  dispose(): void {
    this.g.destroy();
  }
}

export interface OptionsResult {
  readonly config: Config;
}

const OPTION_YS = [190, 210, 230, 270, 290];

/**
 * Optionen (`Schwierigkeitsgrad` `0x457E80`): fünf Zeilen an x = 150, Cursor „)“,
 * Werte mit Bestätigen/Rechts weiterschalten, „Punktefaktor“ an (480, 440),
 * Hinweis ab 1,25 an (392, 465), „gespeichert“ an (10, 465).
 */
export class OptionsScreen implements Screen<OptionsResult> {
  readonly images = ["image/logo", "image/text"];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly logo = new LogoAnim();
  private sel = 0;
  private savedTimer = 0;

  constructor(
    private readonly env: FlowEnv,
    private config: Config,
    private readonly save: (c: Config) => void,
  ) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
  }

  update(): OptionsResult | undefined {
    const k = this.env.keys;
    this.logo.tick();
    if (this.savedTimer > 0) this.savedTimer--;
    if (k.hit("escape")) return { config: this.config };
    if (k.hit("up") && this.sel > 0) this.sel--;
    if (k.hit("down") && this.sel < 4) this.sel++;
    if (k.hit("confirm") || k.hit("right")) {
      const c = this.config;
      switch (this.sel) {
        case 0:
          this.config = { ...c, enemyShots: ((c.enemyShots + 1) % 3) as 0 | 1 | 2 };
          break;
        case 1:
          this.config = { ...c, wallsKill: !c.wallsKill };
          break;
        case 2:
          this.config = { ...c, weaponLoss: !c.weaponLoss };
          break;
        case 3:
          this.save(this.config);
          this.savedTimer = 300;
          break;
        default:
          return { config: this.config };
      }
    }
    return undefined;
  }

  render(): void {
    const g = this.g;
    const t = OPTIONS_TEXT[this.env.german ? "de" : "en"];
    const c = this.config;
    const cur = (i: number) => (this.sel === i ? ")" : " ");
    g.begin();
    this.logo.draw(g, 0);
    const lines = [
      t.shots + t.shotValues[c.enemyShots],
      t.walls + t.wallValues[c.wallsKill ? 1 : 0],
      t.weapons + t.weaponValues[c.weaponLoss ? 1 : 0],
      t.save,
      t.back,
    ];
    lines.forEach((s, i) => g.text(0, cur(i) + s, 150, OPTION_YS[i]!));
    const f = pointFactor(c);
    g.text(0, t.factor + formatFactor(f, this.env.german), 480, 440);
    if (showsUnlockHint(f)) g.text(0, t.unlockHint, 392, 465);
    if (this.savedTimer > 0) g.text(0, t.saved, 10, 465);
    g.end();
  }

  dispose(): void {
    this.g.destroy();
  }
}

/** Levelauswahl: Level oder `undefined` bei ESC (`Me.690 = 5`). */
export type LevelSelectResult = { readonly level: number | undefined };

/**
 * Levelauswahl (`ShowLevelSelect` `0x45B220`): Liste an (10, 100 + 20·i) mit
 * Cursor „)“, Vorschau `data\grafik\<L>.spr` an (300, 120) mit Rahmen.
 */
export class LevelSelectScreen implements Screen<LevelSelectResult> {
  readonly images: string[];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly logo = new LogoAnim();
  private readonly levels: number[];
  private sel: number;

  constructor(
    private readonly env: FlowEnv,
    config: Config,
    current: number,
  ) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
    this.levels = selectableLevels(config);
    this.sel = Math.max(0, this.levels.indexOf(current));
    this.images = ["image/logo", "image/text", ...this.levels.map(previewImage)];
  }

  update(): LevelSelectResult | undefined {
    const k = this.env.keys;
    this.logo.tick();
    if (k.hit("escape")) return { level: undefined };
    if (k.hit("up") && this.sel > 0) this.sel--;
    if (k.hit("down") && this.sel < this.levels.length - 1) this.sel++;
    if (k.hit("confirm")) return { level: this.levels[this.sel]! };
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    this.logo.draw(g, 0);
    this.levels.forEach((l, i) => {
      g.text(0, (i === this.sel ? ")" : " ") + LEVEL_SELECT_NAMES[l], 10, 100 + 20 * i);
    });
    const level = this.levels[this.sel]!;
    g.blit(0, previewImage(level), 0, 0, 320, 240, 300, 120);
    drawPreviewFrame(g, 0, 300, 120);
    g.end();
  }

  dispose(): void {
    this.g.destroy();
  }
}

/**
 * Info (`info` `0x490430`): Credits-Kopf, darunter die Readme je Sprache
 * (`liesmich.txt` bzw. `readme.txt`), mit ↑/↓ scrollbar; ESC oder Bestätigen
 * kehrt zum Titel zurück. Aufbau der Readme-Ansicht *geschätzt*.
 */
export class InfoScreen implements Screen<true> {
  readonly images = ["image/logo", "image/text"];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly logo = new LogoAnim();
  private readonly lines: readonly string[];
  private scroll = 0;
  private t = 0;

  constructor(
    private readonly env: FlowEnv,
    readme = "",
  ) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
    this.lines = [...INFO_LINES, ...wrapLines(readme, 78)];
  }

  update(): true | undefined {
    this.logo.tick();
    this.t++;
    const k = this.env.keys;
    const max = Math.max(0, this.lines.length - INFO_VISIBLE);
    if (this.t % 3 === 0) {
      if (k.held("down")) this.scroll = Math.min(max, this.scroll + 1);
      if (k.held("up")) this.scroll = Math.max(0, this.scroll - 1);
    }
    return k.hit("escape") || k.hit("confirm") ? true : undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    this.logo.draw(g, 0);
    this.lines
      .slice(this.scroll, this.scroll + INFO_VISIBLE)
      .forEach((s, i) => g.text(0, s, 10, 130 + 16 * i));
    g.end();
  }

  dispose(): void {
    this.g.destroy();
  }
}

/** Sichtbare Zeilen im Info-Bildschirm (y 130…466). */
const INFO_VISIBLE = 22;

/** Zeilen umbrechen (an Wortgrenzen, Tabs als Leerzeichen). */
export function wrapLines(text: string, max: number): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\t/g, "    ").split("\n")) {
    let line = "";
    for (const word of raw.split(" ")) {
      if (line.length > 0 && line.length + 1 + word.length > max) {
        out.push(line);
        line = word;
      } else {
        line = line.length > 0 ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Abschiedsbild (`0x4AD5B0`) nach „Quit“/ESC im Titel: Texte, Großschrift
 * „www“ „Kauto“ „de“ mit Punkten; endet mit einer Taste oder nach 5 s.
 */
export class FarewellScreen implements Screen<true> {
  readonly images = ["image/text", "image/text2"];
  private readonly g: Gfx;
  readonly root: Container;
  private t = 0;

  constructor(private readonly env: FlowEnv) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
  }

  update(): true | undefined {
    const k = this.env.keys;
    if (++this.t > 20 && (k.hit("escape") || k.hit("confirm"))) return true;
    return this.t >= 357 ? true : undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    for (const [s, x, y] of farewellLines(this.env.german)) g.text(0, s, x, y);
    g.bigText(0, "www", 10, 200);
    g.bigText(0, "Kauto", 195, 200);
    g.bigText(0, "de", 500, 200);
    g.text(0, ".", 185, 245);
    g.text(0, ".", 487, 245);
    g.end();
  }

  dispose(): void {
    this.g.destroy();
  }
}
