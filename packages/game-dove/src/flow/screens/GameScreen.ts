import { Container } from "pixi.js";
import { DoveInput } from "../../input";
import { Renderer } from "../../render/Renderer";
import { DEATH_END, DEATH_STEP, FIELD_H } from "../../sim/constants";
import { step } from "../../sim/step";
import type { World } from "../../sim/world";
import { asciiKeyName, scriptText } from "../../scriptText";
import { pauseMenu } from "../menus";
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

/**
 * Das laufende Level: `World` + `Renderer` im 14-ms-Takt, dazu die Pause
 * (ESC oder Fokusverlust, `0x4708E6`): das Spielbild bleibt stehen, die Shell
 * zeigt „Weiter“/„Ende“ als HTML darüber. Musik 25 %, Effekte stumm. Überlebt
 * einen Continue-Bildschirm (die Welt läuft danach weiter).
 */
export class GameScreen implements Screen<GameResult> {
  readonly images: string[];
  readonly root = new Container();
  private readonly renderer: Renderer;
  private readonly input: DoveInput;
  private paused = false;
  /** Fenster ohne Fokus oder Tab verdeckt (Erweiterung wie in DoveZ): öffnet die Pause. */
  private windowFocus = true;
  private readonly win: Window | null | undefined;
  private readonly onBlur = () => (this.windowFocus = false);
  private readonly onFocus = () => (this.windowFocus = true);
  /** Antwort des Pausemenüs, sobald gewählt. */
  private pauseReply: string | undefined;

  constructor(
    private readonly env: FlowEnv,
    readonly world: World,
    private readonly record: TickRecorder,
  ) {
    this.images = Renderer.imageIds(world);
    this.input = new DoveInput(env.host.keys, () => env.host.pointer);
    this.win = env.host.canvas?.ownerDocument?.defaultView;
    this.win?.addEventListener("blur", this.onBlur);
    this.win?.addEventListener("focus", this.onFocus);
    this.renderer = new Renderer(
      env.textures,
      world,
      env.german,
      () => env.host.reducedMotion === true,
      () => this.modernHud(),
      (i) => {
        const keys = env.host.boundKeys;
        return scriptText(
          i,
          env.german,
          keys
            ? (a) => keys(a).map((k) => ({ code: k.code, name: asciiKeyName(k.code, env.german) }))
            : undefined,
        );
      },
    );
    this.root.addChild(this.renderer.root);
  }

  update(): GameResult | undefined {
    const { keys, audio } = this.env;
    const w = this.world;
    if (this.paused) return this.updatePause();
    // Pause nur, wenn der Todeszähler nicht läuft
    if ((keys.hit("escape") || !this.focused()) && !w.dead) {
      this.paused = true;
      this.pauseReply = undefined;
      audio?.pause(true);
      void this.env.host.ui.show(pauseMenu(this.env.german, this.world.level.number)).then((r) => {
        this.pauseReply = r.id;
      });
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

  private focused(): boolean {
    return this.windowFocus && this.win?.document.hidden !== true;
  }

  private updatePause(): GameResult | undefined {
    const reply = this.pauseReply;
    if (reply === undefined) return undefined;
    this.paused = false;
    this.env.audio?.pause(false);
    return reply === "abort" ? { kind: "abort" } : undefined;
  }

  /** HTML-HUD der Shell statt der Konsole: nur das Spielfeld zeigen. */
  private modernHud(): boolean {
    return this.env.host.hudMode?.() === "modern";
  }

  viewHeight(): number | null {
    return this.modernHud() ? FIELD_H : null;
  }

  render(): void {
    // in der Pause bleibt das letzte Bild stehen
    if (this.paused) return;
    this.env.audio?.update(this.world);
    this.renderer.render();
  }

  dispose(): void {
    this.win?.removeEventListener("blur", this.onBlur);
    this.win?.removeEventListener("focus", this.onFocus);
    this.renderer.destroy();
    this.root.destroy({ children: true });
  }
}
