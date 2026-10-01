import type { ControlsSheet, HudSprite } from "./GameModule";

/**
 * HTML-Bildschirme der Shell. Das Spiel behält Ablauf, Regeln und Speicherstände;
 * wo früher ein eigener Menü- oder Zwischenbildschirm lief, beschreibt es ihn als
 * Daten und wartet mit `GameHost.ui.show()` auf die Antwort. Die Shell zeichnet
 * generische Bausteine (Menü, Formular, Text, Eingabe, Abfrage, Hinweis, Video) und
 * kennt keine spielspezifischen Seiten. Texte kommen fertig übersetzt vom Spiel.
 */

/** Bild aus den Original-Assets: Ausschnitt eines Bildes (`sprite`) oder ein ganzes Bild. */
export type UiImage =
  | { readonly sprite: HudSprite; readonly alt?: string }
  | { readonly url: string; readonly w: number; readonly h: number; readonly alt?: string };

/** Auswählbarer Eintrag (Menüpunkt, Knopf). */
export interface UiItem {
  readonly id: string;
  readonly label: string;
  /** Zweite Zeile bzw. Hinweis neben dem Eintrag. */
  readonly hint?: string;
  readonly disabled?: boolean;
  /** Vorschaubild, gezeigt solange der Eintrag gewählt ist (z. B. Levelauswahl). */
  readonly image?: UiImage;
}

/** Inhalt neben oder über den Einträgen. */
export type UiBlock =
  | {
      readonly kind: "lines";
      readonly lines: readonly string[];
      readonly heading?: string;
      readonly tone?: "normal" | "accent" | "dim";
      readonly align?: "left" | "center";
      /** Feste Zeichenbreite (Readme, Tabellen aus dem Original). */
      readonly mono?: boolean;
    }
  | {
      readonly kind: "table";
      readonly caption?: string;
      readonly head?: readonly string[];
      readonly rows: readonly (readonly string[])[];
      /** Hervorgehobene Zeile (eigener Eintrag), 0-basiert. */
      readonly highlight?: number;
    }
  | { readonly kind: "controls"; readonly sheet: ControlsSheet }
  | { readonly kind: "image"; readonly image: UiImage };

/** Gemeinsames aller Felder: Gruppe (Abschnittsüberschrift), z. B. „Spieler 2“. */
interface UiFieldBase {
  readonly group?: string;
}

/** Feld eines Formulars (Optionen). Werte: Auswahl als Text, Bereich als Zahl, Taste als Code. */
export type UiField = UiFieldBase &
  (
    | {
        readonly kind: "choice";
        readonly id: string;
        readonly label: string;
        readonly options: readonly { readonly value: string; readonly label: string }[];
        readonly value: string;
        readonly hint?: string;
      }
    | {
        readonly kind: "range";
        readonly id: string;
        readonly label: string;
        readonly min: number;
        readonly max: number;
        readonly step: number;
        readonly value: number;
        /** Anzeige des Werts (z. B. „90 %“). */
        readonly text?: string;
      }
    | {
        readonly kind: "key";
        readonly id: string;
        readonly label: string;
        /** `KeyboardEvent.code` oder `""` (keine Taste). */
        readonly value: string;
        /** Anzeigename des Werts. */
        readonly text: string;
      }
    | { readonly kind: "info"; readonly id: string; readonly text: string }
  );

export type UiValues = Readonly<Record<string, string | number>>;

interface UiBase {
  readonly title?: string;
  /** Über dem eingefrorenen Spielbild (Pause, Continue); sonst ersetzt der Bildschirm es. */
  readonly over?: "level";
  /** Antwort-ID für Esc bzw. Pad-B; ohne sie ist Zurück wirkungslos. */
  readonly back?: string;
  /** Geräusche des Spiels für Bewegen und Bestätigen. */
  readonly sounds?: { readonly move?: () => void; readonly select?: () => void };
}

/** Menü: Einträge, Esc → `back`. Antwort `{ id }`. */
export interface UiMenu extends UiBase {
  readonly kind: "menu";
  readonly logo?: UiImage;
  readonly items: readonly UiItem[];
  /** Vorgewählter Eintrag. */
  readonly selected?: string;
  /** Inhalt über den Einträgen. */
  readonly blocks?: readonly UiBlock[];
  /** Inhalt in einer zweiten Spalte (z. B. Highscores, Tastenübersicht). */
  readonly aside?: readonly UiBlock[];
  /** Einträge als Raster mit so vielen Spalten (z. B. Speicherplätze). */
  readonly columns?: number;
  /** Tippfolgen (Kleinbuchstaben) → Antwort-ID, z. B. das Osterei „lov“. */
  readonly secret?: Readonly<Record<string, string>>;
}

/**
 * Formular (Optionen): Felder und Aktionen. Jede Änderung meldet `onChange` mit allen
 * Werten; die Rückgabe ersetzt die Felder (abgeleitete Anzeigen, Abhängigkeiten).
 * Antwort `{ id, values }` mit der gewählten Aktion bzw. `back`.
 */
export interface UiForm extends UiBase {
  readonly kind: "form";
  readonly fields: readonly UiField[];
  readonly actions: readonly UiItem[];
  readonly blocks?: readonly UiBlock[];
  readonly onChange?: (values: UiValues, changed: string) => readonly UiField[] | void;
  /** Prüft eine aufgenommene Taste; `false` verwirft sie. */
  readonly acceptKey?: (code: string) => boolean;
  /** Anzeigename einer aufgenommenen Taste. */
  readonly keyText?: (code: string) => string;
}

/** Text (Info, Credits): Blöcke und optional ein hohes Bild. Antwort `{ id: "done" }` bzw. `back`. */
export interface UiText extends UiBase {
  readonly kind: "text";
  readonly blocks: readonly UiBlock[];
  readonly image?: UiImage;
  /** `manual`: mit Pfeilen blättern; sonst läuft der Text von selbst durch und endet. */
  readonly scroll: "manual" | { readonly pxPerSecond: number };
  /** Beschriftung des Knopfs, der den Bildschirm schließt. */
  readonly done: string;
}

/** Texteingabe (Namen). Antwort `{ id: "ok", values }`. */
export interface UiInput extends UiBase {
  readonly kind: "input";
  readonly lines?: readonly string[];
  readonly fields: readonly {
    readonly id: string;
    readonly label: string;
    readonly max: number;
    readonly value?: string;
  }[];
  readonly ok: string;
}

/**
 * Abfrage (Continue): Einträge und optional ein Countdown, der ohne Antwort mit
 * `{ id: "timeout" }` endet.
 */
export interface UiConfirm extends UiBase {
  readonly kind: "confirm";
  readonly image?: UiImage;
  readonly lines?: readonly string[];
  readonly items: readonly UiItem[];
  readonly selected?: string;
  readonly countdown?: {
    readonly from: number;
    readonly ms: number;
    /** Zurück (Esc) zählt so viel schneller weiter, statt den Bildschirm zu schließen. */
    readonly faster?: number;
  };
}

/**
 * Hinweis (Get Ready, Ladebildschirm, Abschied). Endet je nach `until` auf
 * Bestätigen/Zurück (`key`), auf jede Taste (`any`), sobald `progress()` 1
 * erreicht, oder nach einer Zeit.
 */
export interface UiNotice extends UiBase {
  readonly kind: "notice";
  readonly lines?: readonly string[];
  readonly blocks?: readonly UiBlock[];
  readonly image?: UiImage;
  /** Ladefortschritt 0…1 (Balken); bei `until: "key"`/`"any"` gilt die Taste erst bei 1. */
  readonly progress?: () => number;
  /** Aufforderung, sobald eine Taste weiterführt (z. B. „Press any key to start!“). */
  readonly prompt?: string;
  readonly until: "key" | "any" | "progress" | { readonly ms: number };
}

/** Video der Original-Assets (DoveZ). Antwort `{ id: "done" }` (zu Ende, Esc, Fehler). */
export interface UiVideo extends UiBase {
  readonly kind: "video";
  readonly url: string;
  /** Text bis das Video läuft. */
  readonly loading?: string;
}

export type UiScreen = UiMenu | UiForm | UiText | UiInput | UiConfirm | UiNotice | UiVideo;

export interface UiReply {
  readonly id: string;
  readonly values?: UiValues;
}

export interface GameUi {
  /**
   * Zeigt einen Bildschirm, bis er beantwortet ist. Ein neuer Aufruf ersetzt einen
   * offenen; `signal` schließt ihn vorzeitig (Antwort `{ id: "aborted" }`).
   */
  show(screen: UiScreen, signal?: AbortSignal): Promise<UiReply>;
}
