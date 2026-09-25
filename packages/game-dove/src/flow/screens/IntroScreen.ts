import type { DoveIntro, IntroScene } from "@clove/formats";
import { Container } from "pixi.js";
import { Particles } from "../../render/Particles";
import { Effect } from "../../sim/actions";
import { Gfx, drawShip } from "../gfx";
import { introSpriteAt } from "../intro";
import type { FlowEnv, Screen } from "../screen";

/** `background1.spr` → `image/background1`. */
export function introImageId(file: string): string {
  return `image/${file.replace(/\.spr$/i, "").toLowerCase()}`;
}

/** Effekte in Szene 0 (`0x495E24`): Schuss bei 1520/1800, Explosion bei 1633/1967. */
const SCENE0_SOUNDS: Readonly<Record<number, string>> = {
  1520: "end3",
  1800: "end3",
  1633: "explosion",
  1967: "explosion",
};

const L_BG = 0;
const L_KEYED = 1;
const L_SHIP = 2;

/**
 * Story-Intro (`PlayIntro` `0x4916D0`) nach `data/intro`: Szenen mit
 * Hintergrund, Keyframe-Objekten aus `intro.spr` (gekeyed), Partikel-
 * explosionen; in Szene 2 fliegt die DOVE ab x = 340 + 4·t bei y = 250 los.
 * Leere Szenenplätze werden übersprungen, ESC/Bestätigen bricht ab.
 */
export class IntroScreen implements Screen<true> {
  readonly images: string[];
  private readonly g: Gfx;
  readonly root = new Container();
  private readonly particles: Particles;
  private readonly scenes: IntroScene[];
  private scene = 0;
  private t = 0;
  private flame = 1;

  constructor(
    private readonly env: FlowEnv,
    intro: DoveIntro,
  ) {
    this.scenes = intro.scenes.filter((s) => s.duration > 0 && s.background !== "");
    const ids = new Set<string>(["image/ss"]);
    for (const s of this.scenes) {
      ids.add(introImageId(s.background));
      ids.add(introImageId(s.sheet));
    }
    this.images = [...ids];
    this.g = new Gfx(env.frames, [{}, { keyed: true }, {}]);
    this.root.addChild(this.g.root);
    const layer = new Container();
    this.root.addChild(layer);
    this.particles = new Particles(layer);
  }

  update(): true | undefined {
    const { keys, audio, rnd } = this.env;
    if (keys.hit("escape") || keys.hit("confirm")) return true;
    const s = this.scenes[this.scene];
    if (!s) return true;
    for (const e of s.explosions) {
      if (e.tick === this.t && e.size > 0) {
        this.particles.consume([Effect.PlayerDeath, e.x, e.y, 1, 1]);
      }
    }
    if (this.scene === 0) {
      const snd = SCENE0_SOUNDS[this.t];
      if (snd) audio?.effect(snd);
    }
    if (this.scene === 2 && this.t === 0) audio?.effect("antrieb");
    this.flame = rnd.below(3) + 1;
    this.particles.update();
    if (++this.t >= s.duration) {
      this.t = 0;
      this.scene++;
      if (this.scene >= this.scenes.length) return true;
    }
    return undefined;
  }

  render(): void {
    const g = this.g;
    const s = this.scenes[this.scene];
    g.begin();
    if (s) {
      g.blit(L_BG, introImageId(s.background), 0, 0, 640, 480, 0, 0);
      const sheet = introImageId(s.sheet);
      for (const obj of s.objects) {
        const st = introSpriteAt(obj, this.t);
        const r = s.rects[obj.sprite - 1];
        if (!st || !r || st.scale <= 0) continue;
        const w = r.r - r.l;
        const h = r.b - r.t;
        const sprite = g.blit(L_KEYED, sheet, r.l, r.t + st.frame * h, w, h, st.x, st.y);
        if (st.scale !== 100) sprite.setSize((w * st.scale) / 100, (h * st.scale) / 100);
      }
      if (this.scene === 2) drawShip(g, L_SHIP, 340 + 4 * this.t, 250, 0, this.flame);
    }
    g.end();
  }

  dispose(): void {
    this.particles.destroy();
    this.g.destroy();
    this.root.destroy({ children: true });
  }
}
