import type { Container } from "pixi.js";
import { Gfx, textWidth } from "../gfx";
import type { FlowEnv, Screen } from "../screen";
import { outroLines } from "../texts";

/** Anzeigedauer einer Storyzeile (`TstGe 0x12C`, 300 Bilder). */
const LINE_TICKS = 300;
/** Wellen-Überblendung: Winkel +5 je Bild bis 360 (`0x4A2B4F`). */
const WAVE_TICKS = 72;
const WAVE_STRIP = 10;
const SLIDE_H = 450;

/**
 * Abspann-Story (`ShowOutro` `0x4A0D00`): Musik `over`, fünf Dias `B1`–`B5`
 * (640×450) mit je zwei Storyzeilen zentriert an y = 466 und Wellen-Überblendung.
 * ESC springt weiter; die Credits danach zeigt die Shell als HTML.
 */
export class OutroScreen implements Screen<true> {
  readonly images = ["image/b1", "image/b2", "image/b3", "image/b4", "image/b5", "image/text"];
  private readonly g: Gfx;
  readonly root: Container;
  private readonly lines: string[];
  private line = 0;
  private lineT = 0;
  private wave = WAVE_TICKS;
  private started = false;

  constructor(
    private readonly env: FlowEnv,
    championName: string,
  ) {
    this.g = new Gfx(env.frames);
    this.root = this.g.root;
    this.lines = outroLines(env.german, championName);
  }

  private slide(line = this.line): number {
    return Math.min(4, line >> 1);
  }

  update(): true | undefined {
    const { keys, audio } = this.env;
    if (!this.started) {
      this.started = true;
      void audio?.playMusic("music/over");
    }
    if (keys.hit("escape") || keys.hit("confirm")) return true;
    if (this.wave < WAVE_TICKS) this.wave++;
    if (++this.lineT >= LINE_TICKS) {
      this.lineT = 0;
      this.line++;
      if (this.line >= this.lines.length) return true;
      if (this.line % 2 === 0) this.wave = 0;
    }
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    this.renderStory(g);
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

  dispose(): void {
    this.g.destroy();
  }
}
