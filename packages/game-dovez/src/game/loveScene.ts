import { type AtlasJson, FixedStepLoop, type GameHost } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import type { Application } from "pixi.js";
import { pauseKey } from "./input";
import { LOVE_MS, LOVE_START_MS, type LoveLogic } from "./love";
import { LoveView } from "./loveView";
import type { Scene } from "./scene";

/**
 * Das Osterei „LOV“ als Szene (`0x546C30` ab dem Aufbau): erst schwarz für
 * `Wait 1000`, dann `Wait 18` je Durchlauf (`love.ts`), jeder Durchlauf
 * wird gerechnet, gezeichnet wird das Ergebnis des letzten fälligen. Esc
 * beendet die Szene sofort (ohne Loslassen abzuwarten). Kein Ton.
 *
 * Verdrahtung: nach dem Menüergebnis „love“ zuerst die Abblende des
 * Menübilds (`FadeScene` mit `FadeLogic(0, rnd)`, zieht 1 `Rnd`), **danach**
 * `new LoveScene(host, app, textures, standart, new LoveLogic(rnd))` (der
 * Konstruktor der Logik zieht 88 `Rnd`), am Ende nochmals `FadeOut(0, False)`
 * und wie „Exit“ zurück zur Shell (`MenuLoop` setzt danach den Modus 0xA).
 */
export class LoveScene implements Scene {
  idle = false;
  private readonly loop = new FixedStepLoop(LOVE_MS);
  private readonly view: LoveView;
  private start: number | undefined;

  constructor(
    private readonly host: GameHost,
    app: Application,
    textures: TextureRegistry,
    /** Atlas `standart` (`weiss`, `a_kreis2`, `glitzer`). */
    standart: AtlasJson,
    readonly logic: LoveLogic,
  ) {
    this.view = new LoveView(app, textures, standart);
  }

  frame(now: number): boolean {
    this.start ??= now;
    this.idle = true;
    // `Wait 1000` vor der Schleife: Tasten zählen dabei noch nicht
    if (now - this.start < LOVE_START_MS) return false;
    const n = this.loop.frame(now);
    for (let i = 0; i < n; i++) {
      if (!this.logic.step(pauseKey(this.host))) return true;
      this.idle = false;
    }
    if (!this.idle) this.view.draw(this.logic);
    return false;
  }

  destroy(): void {
    this.view.destroy();
  }
}
