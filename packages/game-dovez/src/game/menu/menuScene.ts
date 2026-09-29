import { SfxPool, StreamPlayer } from "@clove/audio";
import { FixedStepLoop, type GameHost } from "@clove/core";
import type { DovezConfig } from "../config";
import { dbGain } from "../config";
import { heldDiks, okKey, pauseKey, readInput, useKeys } from "../input";
import { isCyrillic } from "../lang";
import type { Scene } from "../scene";
import type { MenuKeys, MenuLogic } from "./menuLogic";
import type { MenuView } from "./menuView";

/** Menütakt: `Wait 18`, jedes Bild gezeichnet. */
export const MENU_MS = 18;

/**
 * Töne und Musik außerhalb der Level (`LoadMenuSound`: `dude`, `plingding`,
 * `speech`; `Logo.wav`; `intro.ogg` in Endlosschleife).
 */
export class MenuAudio {
  readonly music: StreamPlayer;
  private constructor(
    private readonly host: GameHost,
    private readonly sfx: SfxPool,
  ) {
    this.music = new StreamPlayer(host.audio!.context, host.audio!.music);
  }

  static async create(host: GameHost): Promise<MenuAudio | undefined> {
    if (!host.audio) return undefined;
    const sfx = new SfxPool(host.audio.context, host.audio.sfx, { maxVoices: 8, maxPerSound: 2 });
    await Promise.all(
      ["sound/dude", "sound/plingding", "sound/speech", "sound/logo"].map(async (id) => {
        try {
          if (host.assets.has(id)) await sfx.load(id, await host.assets.bytes(id));
        } catch {
          // nicht dekodierbar: stumm
        }
      }),
    );
    return new MenuAudio(host, sfx);
  }

  play(name: string, db: number): void {
    this.sfx.play(`sound/${name}`, 0, dbGain(db));
  }

  stop(name: string): void {
    this.sfx.stop(`sound/${name}`);
  }

  /** `intro.ogg` von vorn, in Schleife, auf dem Musikpegel. */
  startMusic(level: number): void {
    const id = "music/intro";
    this.music.stop();
    this.music.setVolume(level / 100);
    if (this.host.assets.has(id)) this.music.play(this.host.assets.url(id), true);
  }

  dispose(): void {
    this.music.dispose();
    this.sfx.stopAll();
  }
}

/**
 * Das Hauptmenü als Szene: Logik (`menuLogic.ts`) im 18-ms-Takt, Zeichnung
 * (`menuView.ts`). Zeichen für die Namenseingabe kommen aus `keydown`
 * (`KeyAscii`: druckbare Zeichen, Enter 13, Backspace 8), eines je Durchlauf.
 * Nach „Exit“ wird das Loslassen von Esc abgewartet.
 */
export class MenuScene implements Scene {
  private readonly loop = new FixedStepLoop(MENU_MS);
  private readonly chars: number[] = [];
  private readonly win: Window | null;
  private exiting = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") this.chars.push(13);
    else if (e.key === "Backspace") this.chars.push(8);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const c = e.key.charCodeAt(0);
      // ANSI: nur Zeichen bis 255; auf Russisch (CP1251) dazu die kyrillischen Buchstaben
      if (c >= 32 && (c <= 255 || (this.logic.lang === "ru" && isCyrillic(c)))) this.chars.push(c);
    }
  };

  constructor(
    private readonly host: GameHost,
    readonly logic: MenuLogic,
    /** Bleibt nach dem Ende auf der Bühne (die Abblende erfasst das letzte Bild). */
    private readonly view: MenuView,
    private readonly audio: MenuAudio | undefined,
    private readonly onConfig: (c: DovezConfig) => void,
  ) {
    this.win = host.canvas.ownerDocument.defaultView;
    this.win?.addEventListener("keydown", this.onKey);
    audio?.startMusic(logic.config.music);
  }

  private keys(): MenuKeys {
    const host = this.host;
    const i = readInput(host);
    const doc = host.canvas.ownerDocument;
    return {
      up: i.up,
      down: i.down,
      ok: okKey(host),
      back: pauseKey(host) || i.switchWeapon || i.switchBeam,
      pause: pauseKey(host),
      focus: doc.hasFocus() && !doc.hidden,
      char: this.chars.shift() ?? 0,
      held: heldDiks(host),
    };
  }

  frame(now: number): boolean {
    if (this.exiting) return !pauseKey(this.host);
    const n = this.loop.frame(now);
    const logic = this.logic;
    for (let i = 0; i < n; i++) {
      this.view.tick();
      const before = logic.config;
      const d = logic.step(this.keys());
      // die Belegung der Tastenseite gilt sofort, auch für die Menüsteuerung
      useKeys(logic.keyMap);
      for (const s of logic.sounds.splice(0))
        this.audio?.play(s.name, s.gain === "speech" ? logic.config.speech : logic.config.sfx);
      if (logic.config !== before) {
        this.onConfig(logic.config);
        if (logic.config.music !== before.music)
          this.audio?.music.setVolume(logic.config.music / 100);
      }
      // das Bild eines `Blenden` wird sofort gezeichnet und erfasst
      if (d.blend || i === n - 1 || logic.result) {
        this.view.draw(d, logic.fx);
        if (d.blend) this.view.capture();
      }
      if (logic.result) {
        this.audio?.music.stop();
        if (logic.result.kind === "exit") {
          this.exiting = true;
          return !pauseKey(this.host);
        }
        return true;
      }
    }
    return false;
  }

  destroy(): void {
    this.win?.removeEventListener("keydown", this.onKey);
  }
}
