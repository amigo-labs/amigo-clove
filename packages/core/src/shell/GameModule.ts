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
  /** Alle gerade gehaltenen Tasten der Tastatur (für die Tastenaufnahme); fehlt bei reinen Pads. */
  held?(): readonly string[];
}

/**
 * Maus bzw. Touch über dem Canvas, in logischen Canvas-Koordinaten (ganzzahlig,
 * auf den Canvas begrenzt). Fehlt, wenn die Einstellung den Zeiger abschaltet.
 */
export interface PointerState {
  /**
   * Der Zeiger steuert: seit der letzten Zeigerbewegung wurde nicht mit Tasten
   * oder Pad gelenkt. Ohne je bewegte Maus `false`, dann bleibt alles wie im Original.
   */
  readonly active: boolean;
  readonly kind: "mouse" | "touch";
  readonly x: number;
  readonly y: number;
  /** Maustasten wie `PointerEvent.buttons`: Bit 0 links, Bit 1 rechts, Bit 2 Mitte. */
  readonly buttons: number;
  /** Aufliegende Finger (Touch). */
  readonly touches: number;
  /** Rad-Rasten seit dem letzten Aufruf (negativ: vom Spieler weg / nach oben). */
  takeWheel(): number;
  /** Tasten oder Pad lenken: der Zeiger ruht, bis er wieder bewegt wird. */
  deactivate(): void;
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

/** Dauerhafter Schlüssel/Wert-Speicher der Shell (Optionen, Freischaltungen, Highscores). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/**
 * Skalierung des Canvas: `integer` ganzzahlig und scharf (Vorgabe, 1:1-Pixel),
 * `fit` füllt bruchteilig und scharf, `smooth` füllt bruchteilig gefiltert.
 */
export type ScaleMode = "integer" | "fit" | "smooth";

export interface GameHost {
  readonly canvas: HTMLCanvasElement;
  readonly audio?: AudioHost;
  readonly storage: KeyValueStore;
  /** Das Spiel ist beendet (Menü „Quit“); die Shell kehrt zum Launcher zurück. */
  exit(): void;
  readonly assets: AssetStore;
  readonly keys: KeyState;
  /** Zeiger über dem Canvas; `undefined`, solange die Einstellung ihn abschaltet (live). */
  readonly pointer?: PointerState | undefined;
  readonly locale: string;
  /**
   * Bewegungsarme Darstellung (Einstellung der Shell, Vorgabe die des Systems): kein
   * Bildschirmwackeln, abgeschwächte Vollbildblitze. Die Simulation bleibt gleich.
   */
  readonly reducedMotion?: boolean;
  /**
   * Gamepad-Vibration (Force Feedback des Originals): Stärke 0…1 für das n-te angeschlossene
   * Pad, 0 beendet sie. Fehlt, wenn der Browser oder die Einstellung keine Vibration erlaubt.
   */
  readonly rumble?: (pad: number, magnitude: number) => void;
  /** Skalierung nach der Einstellung der Shell, bei jeder Größenänderung neu gelesen. */
  readonly scaleMode?: () => ScaleMode;
  /** Anzahl der Pads mit Vibrationsmotor (für die Optionen des Spiels). */
  readonly rumblePads?: () => number;
  /** Monotone Zeit in ms (`performance.now` im Browser). */
  now(): number;
}

export interface GameInstance {
  /** Muss hart aufräumen: Ticker, Texturen, Listener. Danach ist der Canvas frei. */
  dispose(): void;
}

/**
 * Gamepad-Belegung eines Spiels: Taste der Standardbelegung (`Gamepad.buttons`-Index,
 * W3C „standard“ mapping) → `KeyboardEvent.code`, die das Spiel als gehalten sieht.
 * Steuerkreuz und linker Stick sind immer die Pfeiltasten.
 */
export type GamepadBindings = Readonly<Record<number, readonly string[]>>;

export interface GameModule {
  readonly id: string;
  readonly title: string;
  /** Bundles, die die Shell vor `boot()` mit Fortschrittsanzeige lädt. */
  readonly preload?: readonly string[];
  readonly gamepad?: GamepadBindings;
  boot(host: GameHost, options?: Readonly<Record<string, string>>): Promise<GameInstance>;
}
