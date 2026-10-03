import type { AssetStore } from "../asset/AssetStore";
import type { GameUi } from "./ui";

/**
 * Der Vertrag zwischen Shell und Spiel.
 *
 * Die **Shell besitzt** Canvas, Asset-Zugriff, Eingabegeräte, Locale und
 * Routing, dazu alle HTML-Bildschirme außerhalb der Level (`GameHost.ui`).
 * Das **Spiel besitzt** Ablauf, Regeln und Speicherstände sowie alles im Canvas ab
 * `boot()` — Renderer, Level, Original-Animationen. Das Spiel fasst nie `location`,
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
 * Audio der Shell: ein AudioContext mit getrennten Pegeln für Musik, Effekte und Sprache.
 * Fehlt, wenn ohne Ton gestartet wird (Original: „Dove - NOSOUND.bat“).
 */
export interface AudioHost {
  readonly context: AudioContext;
  readonly music: AudioNode;
  readonly sfx: AudioNode;
  /** Sprachausgabe (DoveZ-Funk); fehlt sie, spielt Sprache über `sfx`. */
  readonly voice?: AudioNode;
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

/**
 * Renderauflösung: `original` zeichnet in der Auflösung des Originals und
 * vergrößert das fertige Bild (Vorgabe, Bild wie das Original), `hd` zeichnet
 * gleich in der Auflösung des Bildschirms — Drehungen, Überblendungen und Text
 * werden schärfer, Pixelgrafik bleibt Pixelgrafik.
 */
export type RenderResolution = "original" | "hd";

/** Eine belegte Taste: `KeyboardEvent.code` und ihr Anzeigename. */
export interface BoundKey {
  readonly code: string;
  readonly name: string;
}

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
  /**
   * `modern`: die Shell zeigt das HUD (`GameInstance.hud`), das Spiel lässt
   * sein Original-HUD weg und zeigt nur das Spielfeld. Live gelesen.
   */
  readonly hudMode?: () => HudMode;
  /** Skalierung nach der Einstellung der Shell, bei jeder Größenänderung neu gelesen. */
  readonly scaleMode?: () => ScaleMode;
  /** Renderauflösung nach der Einstellung der Shell, wie `scaleMode` gelesen. */
  readonly resolution?: () => RenderResolution;
  /** Anzahl der Pads mit Vibrationsmotor (für die Optionen des Spiels). */
  readonly rumblePads?: () => number;
  /**
   * Tasten, die gerade auf einer Aktion der Tastenbelegung liegen (`KeyAction.id`),
   * mit Anzeigenamen in der Sprache der Shell, für Hinweistexte („Drücke: J“).
   * Leer ohne Belegung.
   */
  readonly boundKeys?: (action: string) => readonly BoundKey[];
  /** Monotone Zeit in ms (`performance.now` im Browser). */
  now(): number;
  /** HTML-Bildschirme der Shell für alles außerhalb der Level (Menüs, Pause, Continue …). */
  readonly ui: GameUi;
}

/** HUD der Shell statt des Original-HUDs (Vorgabe) oder das Original im Canvas. */
export type HudMode = "modern" | "original";

/** Ausschnitt eines Original-Bildes (für Symbole im HTML-HUD). */
export interface HudSprite {
  readonly url: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Größe des ganzen Bildes (für die Skalierung per CSS). */
  readonly sheetW: number;
  readonly sheetH: number;
}

export interface HudMeter {
  /** Art der Anzeige; die Shell beschriftet sie. */
  readonly id: "energy" | "beam" | "shield" | "speed" | "power";
  readonly value: number;
  readonly max: number;
  /** Voll geladen (blinkt). */
  readonly full?: boolean;
  /** Variante, z. B. Beam-Typ; ändert die Farbe. */
  readonly variant?: number;
}

export interface HudIcon {
  /** Bild aus den Original-Assets, sonst `text`. */
  readonly sprite?: HudSprite;
  readonly text?: string;
  /** So oft nebeneinander (z. B. Waffenstufe). */
  readonly count?: number;
  /** Hervorgehoben (gewählter Slot) bzw. blass (leerer Slot). */
  readonly selected?: boolean;
  readonly dim?: boolean;
  /** Kurzer Name für Screenreader und Tooltip. */
  readonly label?: string;
}

export interface HudPlayer {
  readonly score: number;
  readonly meters: readonly HudMeter[];
  readonly icons: readonly HudIcon[];
}

/**
 * Was das Original-HUD zeigt, als Daten für das HTML-HUD der Shell. Rein
 * lesend aus dem Weltzustand, einmal pro Bild abgefragt.
 */
/**
 * Einblendung im Spielfeld als HTML (Tutorial- und Skripttexte, Boss-Meldungen,
 * Tastenhinweis, Laufband). Nur Darstellung; die Simulation bleibt gleich.
 */
export interface HudMessage {
  readonly id: string;
  readonly text: string;
  /** Linke obere Ecke in Spielpixeln; ohne: oben mittig im Spielfeld (untereinander). */
  readonly at?: { readonly x: number; readonly y: number };
  /** Breite in Spielpixeln (Laufband), der Text wird darin abgeschnitten. */
  readonly width?: number;
  /** `hint`: groß (Tastenhinweis), `ticker`: Laufband (Festbreite), sonst Meldung. */
  readonly style?: "text" | "hint" | "ticker";
  /** Deckkraft 0…1 (ein- und ausblendende Hinweise). */
  readonly opacity?: number;
}

export interface HudSnapshot {
  readonly lives: number;
  readonly players: readonly HudPlayer[];
  /** Lebenspunkte des Bosses, solange einer kämpft. */
  readonly boss?: { readonly hp: number; readonly max: number };
  readonly combo?: { readonly hits: number; readonly bonus: number };
  /** Einblendungen im Spielfeld (mit `hudMode = modern`; sonst zeichnet sie das Spiel). */
  readonly messages?: readonly HudMessage[];
}

export interface GameInstance {
  /** Muss hart aufräumen: Ticker, Texturen, Listener. Danach ist der Canvas frei. */
  dispose(): void;
  /** HUD-Daten, solange ein Level läuft (sonst `null`); fehlt bei Spielen ohne HTML-HUD. */
  hud?(): HudSnapshot | null;
}

/** Name je Sprache der Shell. */
export type LocalLabel = Readonly<Record<"de" | "en" | "ru", string>>;

/** Eine Zeile der Tastenübersicht: Aktion, Tasten und Maustaste. */
export interface ControlRow {
  readonly id: string;
  readonly label: LocalLabel;
  /** Tasten als `KeyboardEvent.code`; die Shell leitet daraus auch die Pad-Tasten ab. */
  readonly codes: readonly string[];
  /** Maus-Bedienung derselben Aktion (Rad hoch = vom Spieler weg). */
  readonly pointer?: "left" | "right" | "middle" | "wheel" | "wheelUp" | "wheelDown";
}

/** Abschnitt der Tastenübersicht, z. B. ein Spieler im Zwei-Spieler-Spiel. */
export interface ControlGroup {
  readonly label?: LocalLabel;
  /** Pad, dessen Belegung gilt (n-tes Pad, `GameModule.pads`); Vorgabe 0. */
  readonly pad?: number;
  readonly rows: readonly ControlRow[];
}

/** Tastenübersicht eines Spiels: reine Daten, die Shell beschriftet und zeichnet sie. */
export type ControlsSheet = readonly ControlGroup[];

/**
 * Gamepad-Belegung eines Spiels: Taste der Standardbelegung (`Gamepad.buttons`-Index,
 * W3C „standard“ mapping) → `KeyboardEvent.code`, die das Spiel als gehalten sieht.
 * Steuerkreuz und linker Stick sind immer die Pfeiltasten.
 */
export type GamepadBindings = Readonly<Record<number, readonly string[]>>;

/**
 * Eine Aktion für die Tastenbelegung der Shell: Name je Sprache und die Codes,
 * nach denen das Spiel fragt (die Originaltasten). Die Shell belegt sie um
 * (`bindKeys`): das Spiel sieht einen dieser Codes genau dann gehalten, wenn eine
 * der dafür belegten Tasten gehalten ist.
 */
export interface KeyAction {
  readonly id: string;
  readonly label: LocalLabel;
  readonly codes: readonly string[];
  /** Abschnitt im Editor: Bewegen, Waffen, Sonstiges. */
  readonly group?: "move" | "weapon" | "system";
  /** Spieler (0, 1) bei zwei Spielern an einer Tastatur; fehlt = alle bzw. Einzelspieler. */
  readonly player?: number;
  /** Die belegten Tasten bedienen auch die HTML-Bildschirme (Richtung bzw. Bestätigen). */
  readonly nav?: "up" | "down" | "left" | "right" | "ok";
}

/**
 * Belegung eines einzelnen Pads (z. B. Spieler 2): Tasten und die Codes für
 * Steuerkreuz und linken Stick in der Reihenfolge hoch, runter, links, rechts.
 */
export interface PadLayout {
  readonly buttons: GamepadBindings;
  readonly directions: readonly [string, string, string, string];
}

export interface GameModule {
  readonly id: string;
  readonly title: string;
  /** Bundles, die die Shell vor `boot()` mit Fortschrittsanzeige lädt. */
  readonly preload?: readonly string[];
  readonly gamepad?: GamepadBindings;
  /** Belegung je Pad (n-tes Pad mit Standardbelegung); fehlt ein Eintrag, gilt `gamepad`. */
  readonly pads?: readonly (PadLayout | undefined)[];
  boot(host: GameHost, options?: Readonly<Record<string, string>>): Promise<GameInstance>;
}
