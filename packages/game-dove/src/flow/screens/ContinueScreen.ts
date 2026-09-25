import { Container } from "pixi.js";
import { Effect } from "../../sim/actions";
import { Particles } from "../../render/Particles";
import { Gfx, drawShip } from "../gfx";
import { type FlowEnv, type Screen, rndFloat } from "../screen";
import { continueRankText } from "../texts";

/** Rakete des Cursors: Frames aus der Tabelle {0, 1, 0, 2}, je 11 Bilder (`0x454A74`). */
const ROCKET_FRAMES = [0, 1, 0, 2];
const YES_Y = 255;
const NO_Y = 310;
/** Breite von „GAMEOVER“ in `titel.spr` (220…500). */
const GAMEOVER_W = 280;

/**
 * Continue (`Continue` `0x4549C0`), Grafik aus `titel.spr`:
 * „GAMEOVER“ (220, 323)–(500, 417) wird an (0, 0) von links aufgedeckt (+2 px/Bild),
 * „Continue Game?“ (0, 430)–(445, 475) an (100, 130), „Yes, ya!“/„No!“
 * (0, 329)–(204, 426) an (220, 240). Cursor ist die Rakete aus `ss.spr`
 * (158, 137 + 21·f) 40×21, sie gleitet zwischen y = 255 (YES) und 310 (NO).
 * „Score:“ an (0, 100), Platzhinweis an (80 bzw. 124, 465).
 * Nach der Wahl noch 100 Bilder Abflug, dann Ergebnis (true = YES).
 */
export class ContinueScreen implements Screen<boolean> {
  readonly images = ["image/titel", "image/ss", "image/text"];
  private readonly g: Gfx;
  readonly root = new Container();
  private readonly particles: Particles;
  private reveal = 0;
  private rocketX = 30;
  private rocketY = YES_Y;
  private sel = 0;
  private animTick = 0;
  private animIdx = 0;
  /** −1 bis zur Wahl, dann Abflugzähler bis 100. */
  private done = -1;
  private flame = 1;

  constructor(
    private readonly env: FlowEnv,
    private readonly score: number,
    private readonly rank: number,
  ) {
    this.g = new Gfx(env.frames);
    this.root.addChild(this.g.root);
    const layer = new Container();
    this.root.addChild(layer);
    this.particles = new Particles(layer);
  }

  update(): boolean | undefined {
    const { keys, audio, rnd } = this.env;
    if (this.reveal < GAMEOVER_W) {
      this.reveal += 2;
      this.rocketX++;
    }
    if (++this.animTick > 10) {
      this.animTick = 0;
      this.animIdx = (this.animIdx + 1) % ROCKET_FRAMES.length;
    }
    if (this.done < 0) {
      if (keys.hit("up")) this.sel = 0;
      if (keys.hit("down")) this.sel = 1;
      if (keys.hit("confirm")) {
        this.done = 0;
        if (this.sel === 0) audio?.effect(rndFloat(rnd) < 0.5 ? "yesjo" : "yesjo2", 50);
        else audio?.effect(rndFloat(rnd) < 0.5 ? "fertig" : "fertig2");
        this.particles.consume([Effect.EnemyKill, this.rocketX, this.rocketY, 40, 21]);
      }
    } else {
      this.rocketX += 5;
      this.flame = rnd.below(3) + 1;
      if (++this.done >= 100) return this.sel === 0;
    }
    if (this.sel === 0 && this.rocketY > YES_Y) this.rocketY -= 5;
    if (this.sel === 1 && this.rocketY < NO_Y) this.rocketY += 5;
    this.particles.update();
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    g.text(0, `Score:${this.score}`, 0, 100);
    g.blit(0, "image/titel", 0, 430, 445, 45, 100, 130);
    if (this.rank > 0) {
      g.text(0, continueRankText(this.env.german, this.rank), this.env.german ? 80 : 124, 465);
    }
    g.blit(0, "image/titel", 0, 329, 204, 97, 220, 240);
    if (this.done < 0) {
      const f = ROCKET_FRAMES[this.animIdx]!;
      g.blit(0, "image/ss", 158, 137 + 21 * f, 40, 21, this.rocketX, this.rocketY);
    } else {
      drawShip(g, 0, this.rocketX, this.rocketY, 0, this.flame);
    }
    g.blit(0, "image/titel", 220, 323, this.reveal, 94, 0, 0);
    g.end();
  }

  dispose(): void {
    this.particles.destroy();
    this.root.destroy({ children: true });
  }
}
