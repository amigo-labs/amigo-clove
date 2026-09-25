import { Container } from "pixi.js";
import { Particles } from "../../render/Particles";
import { Effect } from "../../sim/actions";
import { Gfx } from "../gfx";
import { NAME_MAX, rankSuffix } from "../highscore";
import { NAME_KEYS } from "../input";
import type { FlowEnv, Screen } from "../screen";
import { HIGHSCORE_TEXT } from "../texts";
import { LogoAnim } from "./common";

/** Zeichen zu einem Tastencode der Namenseingabe (Umschalt → Großbuchstaben). */
export function nameChar(code: string, shift: boolean): string | undefined {
  if (/^Key[A-Z]$/.test(code)) {
    const c = code.slice(3);
    return shift ? c : c.toLowerCase();
  }
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
  switch (code) {
    case "Space":
      return " ";
    case "Minus":
      return "-";
    case "Period":
      return ".";
    case "Comma":
      return ",";
    default:
      return undefined;
  }
}

/**
 * Namenseingabe (`HighScore` `0x49D620`): Großschrift „You placed“ an (20, 110),
 * Platz mit Endung an (230, 170), „Enter your name here:“ an (10, 240),
 * Name mit `§` als Cursor an (10, 255), höchstens 20 Zeichen, Enter beendet.
 */
export class HighscoreScreen implements Screen<string> {
  readonly images = ["image/logo", "image/text", "image/text2"];
  private readonly g: Gfx;
  readonly root = new Container();
  private readonly logo = new LogoAnim();
  private readonly particles: Particles;
  private name = "";
  private t = 0;

  constructor(
    private readonly env: FlowEnv,
    private readonly rank: number,
  ) {
    this.g = new Gfx(env.frames);
    this.root.addChild(this.g.root);
    const layer = new Container();
    this.root.addChild(layer);
    this.particles = new Particles(layer);
  }

  update(): string | undefined {
    const k = this.env.keys;
    const rnd = this.env.rnd;
    this.logo.tick();
    if (this.t++ % 30 === 0) {
      this.particles.consume([Effect.EnemyKill, rnd.below(600) + 20, rnd.below(300) + 150, 1, 1]);
    }
    this.particles.update();
    if (k.hitCode("Enter") || k.hitCode("NumpadEnter")) return this.name;
    if (k.hitCode("Backspace")) this.name = this.name.slice(0, -1);
    const shift = k.isDown("ShiftLeft") || k.isDown("ShiftRight");
    for (const code of NAME_KEYS) {
      if (!k.hitCode(code)) continue;
      const ch = nameChar(code, shift);
      if (ch !== undefined && this.name.length < NAME_MAX) this.name += ch;
    }
    return undefined;
  }

  render(): void {
    const g = this.g;
    g.begin();
    this.logo.draw(g, 0);
    g.bigText(0, HIGHSCORE_TEXT.youPlaced, 20, 110);
    g.bigText(0, `${this.rank}${rankSuffix(this.rank)}`, 230, 170);
    g.text(0, HIGHSCORE_TEXT.enterName, 10, 240);
    g.text(0, this.name + HIGHSCORE_TEXT.cursor, 10, 255);
    g.end();
  }

  dispose(): void {
    this.particles.destroy();
    this.root.destroy({ children: true });
  }
}
