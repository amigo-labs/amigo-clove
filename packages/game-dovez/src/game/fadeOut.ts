import { FixedStepLoop } from "@clove/core";
import { type Application, Container, Graphics, Sprite } from "pixi.js";
import { f32, type VbRnd } from "../sim/vb";
import type { Scene } from "./scene";
import type { ScreenTargets } from "./screenTargets";

/** Rechteck `x1, y1, x2, y2`. */
export type Rect = readonly [number, number, number, number];

export const FADE_TICKS = 80;
export const FADE_MS = 16;

/**
 * `FadeOut(richtung, abbrechbar)` (`0x545C70`): 80 Durchläufe à `Wait 16`.
 * Je Durchlauf wird das Bild in das Rechteck `rect` (16 px zu einer Seite
 * gestaucht) auf sich selbst kopiert, 20 % abgedunkelt und das Anfangsbild
 * mit α = `Me.518` (0,95 − 0,05 je Durchlauf) darübergelegt — eine Abblende
 * nach Schwarz. Richtung 0 staucht oben und unten, sonst eine zufällige
 * Seite (`Int(Rnd · 4)`); danach ein weiteres, hier unbenutztes `Rnd`.
 */
export class FadeLogic {
  readonly rect: Rect;
  alpha = 0.95;
  tick = 0;

  constructor(direction: number, rnd: VbRnd) {
    let [x1, y1, x2, y2] = [0, 0, 800, 600];
    if (direction === 0) {
      y1 = 16;
      y2 -= 16;
    } else {
      switch (Math.floor(rnd.next() * 4)) {
        case 0:
          x1 = 16;
          break;
        case 1:
          y1 = 16;
          break;
        case 2:
          x2 -= 16;
          break;
        case 3:
          y2 -= 16;
          break;
      }
    }
    // `Me.71C = CLng(60 · Rnd − 30)`
    rnd.next();
    this.rect = [x1, y1, x2, y2];
  }

  get done(): boolean {
    return this.tick >= FADE_TICKS;
  }

  step(): void {
    this.alpha = f32(this.alpha - 0.05);
    if (this.alpha <= 0) this.alpha = 0;
    this.tick++;
  }
}

/** Die Abblende auf dem Bildschirm: das aktuelle Bild wird erfasst und abgeblendet. */
export class FadeScene implements Scene {
  private readonly loop = new FixedStepLoop(FADE_MS);
  private readonly shown: Sprite;
  private readonly copy: Sprite;
  private readonly first: Sprite;
  private readonly black = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
  private readonly pass = new Container();

  constructor(
    private readonly app: Application,
    private readonly t: ScreenTargets,
    private readonly logic: FadeLogic,
  ) {
    // Anfangsbild (`Me.774`) und Backbuffer
    t.draw(app.stage, t.back, true);
    const snap = new Sprite(t.back);
    t.draw(snap, t.shot, true);
    snap.destroy();
    this.shown = new Sprite(t.back);
    this.copy = new Sprite(t.tmp);
    this.first = new Sprite(t.shot);
    this.black.alpha = 0.2;
    const [x1, y1, x2, y2] = logic.rect;
    for (const s of [this.copy, this.first]) {
      s.position.set(x1, y1);
      s.width = x2 - x1;
      s.height = y2 - y1;
    }
    this.pass.addChild(this.copy, this.black, this.first);
    app.stage.addChild(this.shown);
  }

  frame(now: number): boolean {
    const n = this.loop.frame(now);
    for (let i = 0; i < n && !this.logic.done; i++) {
      // jeder Durchlauf zeichnet (die Rückkopplung summiert sich)
      this.logic.step();
      this.t.copyBack();
      this.first.alpha = this.logic.alpha;
      this.t.draw(this.pass, this.t.back);
    }
    return this.logic.done;
  }

  destroy(): void {
    this.app.stage.removeChild(this.shown);
    this.shown.destroy();
    this.pass.destroy({ children: true });
  }
}
