import type { Container } from "pixi.js";
import { Gfx, drawShip, textWidth } from "../gfx";
import type { FlowEnv, Screen } from "../screen";
import { STAR_COUNT } from "../stars";
import { creditLines, outroLines } from "../texts";

/** Anzeigedauer einer Storyzeile (`TstGe 0x12C`, 300 Bilder). */
const LINE_TICKS = 300;
/** Wellen-Überblendung: Winkel +5 je Bild bis 360 (`0x4A2B4F`). */
const WAVE_TICKS = 72;
const WAVE_STRIP = 10;
const SLIDE_H = 450;

/** Credits-Rasterbalken (Farben aus Vielfachen von 63, geschätzt). */
const BAR_COLORS = [0xfc0000, 0x00fc00, 0x0000fc, 0xfcfc00];

/**
 * Abspann (`ShowOutro` `0x4A0D00`): Musik `over`, fünf Dias `B1`–`B5` (640×450)
 * mit je zwei Storyzeilen zentriert an y = 466 und Wellen-Überblendung, danach
 * Musik `Credits`: Sternenfeld, Rasterbalken, fliegendes Schiff und die Credits
 * (Zeilen 1…27 an (0, 16·i)) bis ESC. ESC in der Story springt zu den Credits.
 */
export class OutroScreen implements Screen<true> {
  readonly images = [
    "image/b1",
    "image/b2",
    "image/b3",
    "image/b4",
    "image/b5",
    "image/text",
    "image/ss",
  ];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly lines: string[];
  private readonly credits: string[];
  private phase: "story" | "credits" = "story";
  private line = 0;
  private lineT = 0;
  private wave = WAVE_TICKS;
  private started = false;
  private readonly sx = new Float64Array(STAR_COUNT);
  private readonly sy = new Int32Array(STAR_COUNT);
  private angle = 0;
  private flame = 1;

  constructor(
    private readonly env: FlowEnv,
    championName: string,
  ) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
    this.lines = outroLines(env.german, championName);
    this.credits = creditLines(env.german);
  }

  private slide(line = this.line): number {
    return Math.min(4, line >> 1);
  }

  private startCredits(): void {
    this.phase = "credits";
    void this.env.audio?.playMusic("music/credits");
    for (let i = 0; i < STAR_COUNT; i++) {
      this.sx[i] = this.env.rnd.below(640);
      this.sy[i] = this.env.rnd.below(480);
    }
  }

  update(): true | undefined {
    const { keys, audio, rnd } = this.env;
    if (!this.started) {
      this.started = true;
      void audio?.playMusic("music/over");
    }
    this.flame = rnd.below(3) + 1;
    if (this.phase === "story") {
      if (keys.hit("escape")) {
        this.startCredits();
        return undefined;
      }
      if (this.wave < WAVE_TICKS) this.wave++;
      if (++this.lineT >= LINE_TICKS) {
        this.lineT = 0;
        this.line++;
        if (this.line >= this.lines.length) this.startCredits();
        else if (this.line % 2 === 0) this.wave = 0;
      }
      return undefined;
    }
    if (keys.hit("escape") || keys.hit("confirm")) return true;
    this.angle = (this.angle + 3) % 360;
    for (let i = 0; i < STAR_COUNT; i++) {
      const speed = 4 - Math.floor((i * 4) / STAR_COUNT);
      this.sx[i]! -= speed;
      if (this.sx[i]! < 0) {
        this.sx[i] = 639;
        this.sy[i] = rnd.below(480);
      }
    }
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    if (this.phase === "story") this.renderStory(g);
    else this.renderCredits(g);
    g.end();
  }

  private renderStory(g: Gfx): void {
    const cur = this.slide();
    const img = `image/b${cur + 1}`;
    if (this.wave >= WAVE_TICKS || cur === 0) {
      g.blit(0, img, 0, 0, 640, SLIDE_H, 0, 0);
    } else {
      // Überblendung: das neue Bild läuft spaltenweise in einer Sinuswelle von oben ein.
      const prev = `image/b${cur}`;
      g.blit(0, prev, 0, 0, 640, SLIDE_H, 0, 0);
      const p = this.wave / WAVE_TICKS;
      for (let x = 0; x < 640; x += WAVE_STRIP) {
        const phase = 0.5 + 0.5 * Math.sin((x / 640) * Math.PI * 4 + p * Math.PI * 2);
        const h = Math.round(Math.min(1, Math.max(0, p * 1.5 - phase * 0.5)) * SLIDE_H);
        if (h > 0) g.blit(0, img, x, 0, WAVE_STRIP, h, x, 0);
      }
    }
    const text = this.lines[this.line] ?? "";
    g.text(0, text, Math.max(0, (640 - textWidth(text)) >> 1), 466);
  }

  private renderCredits(g: Gfx): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      const tier = Math.floor((i * 4) / STAR_COUNT);
      const c = [0xffffff, 0xc0c0c0, 0x808080, 0x404040][tier]!;
      g.fill(0, Math.floor(this.sx[i]!), this.sy[i]!, 1, 1, c);
    }
    BAR_COLORS.forEach((c, i) => {
      const y = Math.round(235 + Math.sin(((this.angle + i * 25) * Math.PI) / 180) * 225);
      g.fill(0, 0, y, 640, 9, c);
    });
    const shipY = Math.round(120 + Math.sin((this.angle * 2 * Math.PI) / 180) * 10);
    drawShip(g, 0, 230, shipY, 0, this.flame);
    for (let i = 1; i < this.credits.length; i++) g.text(0, this.credits[i]!, 0, 16 * i);
  }

  dispose(): void {
    this.g.destroy();
  }
}
