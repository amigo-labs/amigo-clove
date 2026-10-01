import type { Container } from "pixi.js";
import { Gfx } from "../gfx";
import type { FlowEnv, Screen } from "../screen";

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
