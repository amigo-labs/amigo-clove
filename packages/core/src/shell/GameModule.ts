import type { AssetStore } from "../asset/AssetStore";

/**
 * Der Vertrag zwischen Shell und Spiel.
 *
 * Die **Shell besitzt** Canvas, Asset-Zugriff, Eingabegeräte, Locale und
 * Routing. Das **Spiel besitzt** alles ab `boot()` — Renderer auf dem
 * übergebenen Canvas, Szenen, Pause. Das Spiel fasst nie `location`,
 * `document.title` oder die Erzeugung von Canvas und AudioContext an.
 */

/** Gehaltene Tasten als `KeyboardEvent.code` (layoutunabhängig, z. B. `KeyS`, `ArrowLeft`). */
export interface KeyState {
  isDown(code: string): boolean;
}

/**
 * Audio der Shell: ein AudioContext mit getrennten Pegeln für Musik und Effekte.
 * Fehlt, wenn ohne Ton gestartet wird (Original: „Dove - NOSOUND.bat“).
 */
export interface AudioHost {
  readonly context: AudioContext;
  readonly music: AudioNode;
  readonly sfx: AudioNode;
  /** URL des libopenmpt-AudioWorklets (`chiptune3.worklet.js`). */
  readonly moduleWorkletUrl: string;
}

export interface GameHost {
  readonly canvas: HTMLCanvasElement;
  readonly audio?: AudioHost;
  readonly assets: AssetStore;
  readonly keys: KeyState;
  readonly locale: string;
  /** Monotone Zeit in ms (`performance.now` im Browser). */
  now(): number;
}

export interface GameInstance {
  /** Muss hart aufräumen: Ticker, Texturen, Listener. Danach ist der Canvas frei. */
  dispose(): void;
}

export interface GameModule {
  readonly id: string;
  readonly title: string;
  boot(host: GameHost, options?: Readonly<Record<string, string>>): Promise<GameInstance>;
}
