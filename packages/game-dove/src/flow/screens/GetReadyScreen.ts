import type { Container } from "pixi.js";
import { Gfx } from "../gfx";
import { getReadyText, previewImage } from "../rules";
import { type FlowEnv, type Screen } from "../screen";
import { drawPreviewFrame } from "./simple";

/** `start` weiter ins Level, `abort` = ESC (`Me.690 = 1` → Highscore). */
export type GetReadyResult = "start" | "abort";

/** Partikelbilder in `ss.spr` (`0x45EC7F`…): vier 7×7-Kugeln. */
const PARTICLE_RECTS: readonly (readonly [number, number])[] = [
  [0, 41],
  [0, 63],
  [0, 90],
  [21, 85],
];
const PARTICLES = 100;

/**
 * Get Ready (`Get_Ready` `0x45D8A0`): Vorschau an (160, 120) mit Rahmen,
 * 100 Partikel, Laufschrift in `text2.spr` oben (y = 0) und unten (y = 405),
 * blinkendes „Get Ready!“ aus `ss.spr` (81, 116)–(194, 137) an y = 230.
 * Weiter mit S, A, Enter oder Leertaste, ESC bricht ab.
 */
export class GetReadyScreen implements Screen<GetReadyResult> {
  readonly images: string[];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly text: string;
  private readonly px = new Int32Array(PARTICLES);
  private readonly py = new Int32Array(PARTICLES);
  private readonly vx = new Int32Array(PARTICLES);
  private readonly vy = new Int32Array(PARTICLES);
  private readonly kind: number;
  /** Laufschrift: Startzeichen (1-basiert) und Pixelversatz 0…57. */
  private pos = 1;
  private offset = 0;
  private blinkCounter = 0;
  private blink = 0;
  private started = false;

  constructor(
    private readonly env: FlowEnv,
    private readonly level: number,
    score: number,
    lives: number,
  ) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
    this.images = [previewImage(level), "image/ss", "image/text2"];
    this.text = getReadyText(level, score, lives);
    const rnd = env.rnd;
    this.kind = rnd.below(4);
    const mode = rnd.below(4);
    for (let i = 0; i < PARTICLES; i++) {
      this.px[i] = rnd.below(628) + 3;
      this.py[i] = rnd.below(467) + 3;
      this.vx[i] = rnd.less(0.5) ? rnd.below(3) + 1 : rnd.below(3) - 3;
      this.vy[i] = rnd.less(0.5) ? rnd.below(3) + 1 : rnd.below(3) - 3;
      if (this.vx[i] === 0) this.vx[i] = 1;
      if (this.vy[i] === 0) this.vy[i] = -1;
      if (mode === 2) this.vx[i] = 0; // nur senkrecht
      if (mode === 3) this.vy[i] = 0; // nur waagerecht
    }
  }

  update(): GetReadyResult | undefined {
    const { keys, audio } = this.env;
    if (!this.started) {
      this.started = true;
      audio?.effect("getready");
    }
    if (keys.hit("escape")) return "abort";
    if (keys.hit("confirm")) return "start";
    // Laufschrift: 3 px je Frame, nach 60 px ein Zeichen weiter
    this.offset += 3;
    if (this.offset === 60) {
      this.offset = 0;
      this.pos++;
      if (this.pos > this.text.length - 11) this.pos = 1;
    }
    if (++this.blinkCounter === 20) {
      this.blinkCounter = 0;
      this.blink ^= 1;
      if (this.blink === 1) audio?.effect("getready");
    }
    for (let i = 0; i < PARTICLES; i++) {
      this.px[i]! += this.vx[i]!;
      this.py[i]! += this.vy[i]!;
      if (this.px[i]! < 3 || this.px[i]! > 630) this.vx[i] = -this.vx[i]!;
      if (this.py[i]! < 3 || this.py[i]! > 470) this.vy[i] = -this.vy[i]!;
    }
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    // Reihenfolge wie im Original: Partikel, Laufschrift, Vorschau, Rahmen, „Get Ready!“
    const [sx, sy] = PARTICLE_RECTS[this.kind]!;
    for (let i = 0; i < PARTICLES; i++)
      g.blit(0, "image/ss", sx, sy, 7, 7, this.px[i]!, this.py[i]!);
    const shown = this.text.slice(this.pos - 1, this.pos + 11);
    g.bigText(0, shown, -this.offset, 0);
    g.bigText(0, shown, -this.offset, 405);
    g.blit(0, previewImage(this.level), 0, 0, 320, 240, 160, 120);
    drawPreviewFrame(g, 0, 160, 120);
    if (this.blink === 0) g.blit(0, "image/ss", 81, 116, 113, 21, (640 - 113) >> 1, 230);
    g.end();
  }

  dispose(): void {
    this.g.destroy();
  }
}
