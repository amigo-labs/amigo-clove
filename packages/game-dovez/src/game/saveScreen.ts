import { FixedStepLoop, type AtlasJson } from "@clove/core";
import type { TextureRegistry } from "@clove/pixi-kit";
import { Container, Sprite, type Texture } from "pixi.js";
import { cint } from "../sim/vb";
import { TICK_MS } from "../sim/world";
import { GdiText, atlasTexture } from "./gdi";
import type { HighscoreEntry } from "./highscore";
import type { LevelScene } from "./level";
import type { Scene } from "./scene";

/**
 * Speicherbildschirm `SaveGame` (`0x541010`), sofort bei der Anweisung
 * `Save` (nach den Bosslevels): Highscore eintragen, „<Level> geschafft!
 * Spiel speichern?“, Top 10, „Nicht speichern“ und 21 Plätze in 3 × 7.
 * Hintergrund 4 (rotes Plasma) und HUD laufen mit, `Save_Screen.ogg`,
 * das Logo fährt von links ein, in den ersten 50 Durchläufen Einblende aus
 * Schwarz. OK speichert beim Loslassen auf dem gewählten Platz (Vorgabe
 * „Nicht speichern“), Esc verlässt beim Loslassen ohne zu speichern.
 */

export interface SaveKeys {
  readonly ok: boolean;
  readonly esc: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

export class SaveLogic {
  /** `Me.584`. */
  tick = 0;
  xLogo = -400;
  /** 0 „Nicht speichern“, 1…21 Plätze (22 ist über „rechts“ erreichbar, wie im Original). */
  sel = 0;
  private escLatch = false;
  private okLatch = false;
  private readonly held = { up: false, down: false, left: false, right: false };
  /** Ergebnis beim Verlassen: gewählter Platz oder `undefined` (nicht speichern). */
  result: { readonly slot: number | undefined } | undefined;

  /** Ein Durchlauf; `false`, wenn die Schleife endet (`result` gesetzt). */
  step(k: SaveKeys): boolean {
    if (k.esc) this.escLatch = true;
    if (k.ok) this.okLatch = true;
    if ((!k.esc && this.escLatch) || (!k.ok && this.okLatch)) {
      this.result = { slot: this.okLatch && this.sel > 0 ? this.sel : undefined };
      return false;
    }
    const edge = (key: keyof SaveLogic["held"], down: boolean) => {
      const hit = down && !this.held[key];
      this.held[key] = down;
      return hit;
    };
    if (edge("up", k.up)) {
      this.sel--;
      if (this.sel < 0) this.sel = 21;
    }
    if (edge("down", k.down)) {
      this.sel++;
      if (this.sel > 21) this.sel = 0;
    }
    if (edge("right", k.right) && this.sel > 0) {
      this.sel += 7;
      if (this.sel > 22) this.sel -= 21;
    }
    if (edge("left", k.left) && this.sel > 0) {
      this.sel -= 7;
      if (this.sel < 0) this.sel += 21;
    }
    this.tick++;
    if (this.xLogo < 0) this.xLogo = cint(this.xLogo / 4) + 0; // + 0: kein −0
    return true;
  }

  /** Schwarz über dem Bild: `1 − Me.584 / 50`. */
  get fade(): number {
    return Math.max(0, 1 - this.tick / 50);
  }
}

/** Plätze der Spieler in der Highscoreliste (2P: Gleichstand schiebt Spieler 1 nach hinten). */
export function savePlaces(ranks: readonly number[]): number[] {
  const out = [...ranks];
  if (out.length === 2 && out[1]! <= out[0]!) out[0]! += 1;
  return out;
}

const YELLOW = 0xffff00;
const WHITE = 0xffffff;

export interface SaveTexts {
  readonly german: boolean;
  readonly level: string;
  readonly scores: readonly number[];
  readonly places: readonly number[];
  readonly highscores: readonly HighscoreEntry[];
  readonly ids: readonly number[];
  /** Beschriftungen der Plätze 1…21. */
  readonly slots: readonly string[];
}

/** Ein Text mit schwarzem Schatten bei +2/+2. */
class Shadowed {
  readonly shadow: GdiText;
  readonly main: GdiText;
  constructor(size: number, parent: Container) {
    this.shadow = new GdiText(size, 0x000000);
    this.main = new GdiText(size, WHITE);
    parent.addChild(this.shadow.text, this.main.text);
  }
  set(s: string, x: number, y: number, color = WHITE, size?: number): void {
    if (size !== undefined) {
      this.shadow.setHeight(size);
      this.main.setHeight(size);
    }
    // Farbe über `tint` (weiße Schrift): gleiche Texte teilen sich in Pixi eine Textur
    this.main.text.tint = color;
    this.shadow.set(s, x + 2, y + 2);
    this.main.set(s, x, y);
  }
  /** Rechtsbündig an `x`. */
  right(s: string, x: number, y: number, color = WHITE): void {
    this.set(s, x - cint(this.main.width(s)), y, color);
  }
  destroy(): void {
    this.shadow.destroy();
    this.main.destroy();
  }
}

export class SaveScene implements Scene {
  readonly logic = new SaveLogic();
  private readonly loop = new FixedStepLoop(TICK_MS);
  private readonly texts = new Container();
  private readonly logo: Sprite;
  private readonly logoTexture: Texture | undefined;
  private readonly slotTexts: Shadowed[] = [];
  private readonly dontSave: Shadowed;
  private readonly saved: Shadowed;
  private readonly all: Shadowed[] = [];

  constructor(
    private readonly level: LevelScene,
    textures: TextureRegistry,
    standart: AtlasJson,
    private readonly data: SaveTexts,
    private readonly keys: () => SaveKeys,
  ) {
    const r = level.renderer;
    r.underFade.addChild(this.texts);
    this.logoTexture = atlasTexture(textures, standart, "logo");
    this.logo = new Sprite(this.logoTexture);
    r.overFade.addChild(this.logo);
    const add = (size: number) => {
      const s = new Shadowed(size, this.texts);
      this.all.push(s);
      return s;
    };
    const { german, level: name } = data;
    add(24).set(german ? `${name} geschafft!` : `${name} Cleared!`, 50, 170);
    add(24).set(german ? "Spiel speichern? " : "Save Game? ", 50, 280);
    data.scores.forEach((score, p) => {
      const place = data.places[p] ?? 11;
      const who = german ? `Spieler ${p + 1}: ` : `Player ${p + 1}: `;
      const rank = place < 11 ? ` (HIGHSCORE: ${place}${german ? ". Platz!)" : ". Place!)"}` : "";
      add(18).set(`${who}${score}${rank}`, 50, 200 + 20 * p);
    });
    const [id0, id1] = data.ids;
    const two = data.ids.length === 2;
    data.highscores.forEach((e, i) => {
      const n = i + 1;
      // Farbe `QBColor(14 − ((ID ≠ P0) Or (ID ≠ P1 And 2P)))`: gelb nur für Spieler 1 allein
      const own = !(e.id !== id0 || (e.id !== id1 && two));
      const color = own ? YELLOW : WHITE;
      add(16).set(`${n}. ${e.name}`, 460, 20 * n - 10, color);
      add(16).right(String(e.score), 788, 20 * n - 10, color);
    });
    this.dontSave = add(16);
    for (let i = 0; i < 21; i++) this.slotTexts.push(add(16));
    this.saved = new Shadowed(german ? 150 : 300, this.texts);
    this.saved.shadow.text.visible = false;
    this.saved.main.text.visible = false;
    level.world.enterSaveScreen();
    level.audio?.playSaveMusic();
    this.drawTexts();
  }

  private drawTexts(): void {
    const { sel } = this.logic;
    const { german, slots } = this.data;
    this.dontSave.set(
      german ? "Nicht speichern" : "Don't Save",
      50,
      310,
      sel === 0 ? YELLOW : WHITE,
    );
    for (let col = 0; col < 3; col++)
      for (let row = 1; row <= 7; row++) {
        const n = 7 * col + row;
        const on = sel === n;
        this.slotTexts[n - 1]!.set(
          slots[n - 1] ?? "---",
          230 * col + 50,
          20 * row + 315,
          on ? YELLOW : WHITE,
          on ? 17 : 16,
        );
      }
    this.logo.position.set(this.logic.xLogo + 10, 10);
  }

  frame(now: number): boolean {
    const n = this.loop.frame(now);
    for (let i = 0; i < n; i++) {
      if (!this.logic.step(this.keys())) {
        this.level.audio?.stopMusic();
        return true;
      }
      this.level.world.backdropTick();
    }
    if (n > 0) {
      this.drawTexts();
      this.level.renderer.drawBackdrop(this.logic.fade);
    }
    return false;
  }

  /** „Gespeichert“ (Arial 150 bei 20/150) bzw. „Saved“ (Arial 300 bei 20/120) und `Save.wav`. */
  showSaved(): void {
    const german = this.data.german;
    this.saved.set(german ? "Gespeichert" : "Saved", 20, german ? 150 : 120);
    this.saved.shadow.text.visible = true;
    this.saved.main.text.visible = true;
    this.level.audio?.effect("save", true);
  }

  destroy(): void {
    for (const s of this.all) s.destroy();
    this.saved.destroy();
    this.texts.destroy();
    this.logo.destroy();
    this.logoTexture?.destroy(false);
  }
}
