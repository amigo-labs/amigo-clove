import { Container } from "pixi.js";
import { DoveInput } from "../../input";
import { Renderer } from "../../render/Renderer";
import { DEATH_END, DEATH_STEP } from "../../sim/constants";
import { step } from "../../sim/step";
import type { World } from "../../sim/world";
import { Gfx } from "../gfx";
import type { FlowEnv, Screen } from "../screen";

/**
 * Ende der Hauptschleife (`Me.690`): Level geschafft (3), Abbruch über die
 * Pause (1) oder alle Leben verloren (→ Continue; `score` ist der Stand vor
 * dem Rücksetzen durch die Simulation).
 */
export type GameResult =
  | { readonly kind: "complete" }
  | { readonly kind: "abort" }
  | { readonly kind: "gameover"; readonly score: number };

/** Mitschnitt für das Replay: jede Eingabe nach ihrem Tick. */
export type TickRecorder = (input: number, world: World) => void;

const PANEL_X = 270;
const PANEL_BOTTOM = 410;
const PANEL_H = 30;
const MARKER_X = 317;

/**
 * Das laufende Level: `World` + `Renderer` im 14-ms-Takt, dazu die Pause
 * (ESC, `0x4708E6`): Panel `konsole.spr` (0, 70)–(100, 70 + k) fährt mit
 * k = 0…30 an (270, 410 − k) hoch, Marker (100, 70)–(148, 83) an x = 317
 * wandert zwischen „Weiter“ (Versatz 3) und „Ende“ (14). Musik 25 %, Effekte
 * stumm. Überlebt einen Continue-Bildschirm (die Welt läuft danach weiter).
 */
export class GameScreen implements Screen<GameResult> {
  readonly images: string[];
  readonly root = new Container();
  private readonly renderer: Renderer;
  private readonly overlay: Gfx;
  private readonly input: DoveInput;
  private paused = false;
  private panel = 0;
  private marker = 3;
  private pauseSel = 0;

  constructor(
    private readonly env: FlowEnv,
    readonly world: World,
    private readonly record: TickRecorder,
  ) {
    this.images = Renderer.imageIds(world);
    this.input = new DoveInput(env.host.keys, () => env.host.pointer);
    this.renderer = new Renderer(
      env.textures,
      world,
      env.german,
      () => env.host.reducedMotion === true,
    );
    this.root.addChild(this.renderer.root);
    this.overlay = new Gfx(env.frames);
    this.root.addChild(this.overlay.root);
  }

  update(): GameResult | undefined {
    const { keys, audio } = this.env;
    const w = this.world;
    if (this.paused) return this.updatePause();
    // Pause nur, wenn der Todeszähler nicht läuft
    if (keys.hit("escape") && !w.dead) {
      this.paused = true;
      this.panel = 0;
      this.marker = 3;
      this.pauseSel = 0;
      audio?.pause(true);
      return undefined;
    }
    // Leben < 0 nach diesem Tick? Dann setzt die Simulation Punkte und Leben zurück.
    const gameOver = w.dead !== 0 && w.lives === 0 && w.deathCounter + DEATH_STEP >= DEATH_END;
    const score = w.score;
    const input = this.input.read({ x: w.px, y: w.py });
    step(w, input);
    this.record(input, w);
    if (gameOver) return { kind: "gameover", score };
    if (w.exit === 3) return { kind: "complete" };
    return undefined;
  }

  private updatePause(): GameResult | undefined {
    const { keys, audio } = this.env;
    if (this.panel < PANEL_H) this.panel++;
    if (keys.hit("up")) this.pauseSel = 0;
    if (keys.hit("down")) this.pauseSel = 1;
    if (this.pauseSel === 1 && this.marker < 14) this.marker++;
    if (this.pauseSel === 0 && this.marker > 3) this.marker--;
    const resume = keys.hit("escape") || (keys.hit("confirm") && this.pauseSel === 0);
    if (keys.hit("confirm") && this.pauseSel === 1) {
      this.paused = false;
      audio?.pause(false);
      return { kind: "abort" };
    }
    if (resume) {
      this.paused = false;
      audio?.pause(false);
    }
    return undefined;
  }

  render(): void {
    const g = this.overlay;
    g.begin();
    if (!this.paused) {
      this.env.audio?.update(this.world);
      this.renderer.render();
    } else {
      const k = this.panel;
      g.blit(0, "image/konsole", 0, 70, 100, k, PANEL_X, PANEL_BOTTOM - k);
      const h = Math.min(13, k - (this.marker - 3));
      if (h > 0) {
        g.blit(0, "image/konsole", 100, 70, 48, h, MARKER_X, PANEL_BOTTOM - k + this.marker - 3);
      }
    }
    g.end();
  }

  dispose(): void {
    this.renderer.destroy();
    this.overlay.destroy();
    this.root.destroy({ children: true });
  }
}
