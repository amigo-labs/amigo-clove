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

export interface GameHost {
  readonly canvas: HTMLCanvasElement;
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
