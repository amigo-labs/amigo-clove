import { dovezSlug, type PlayStep } from "@clove/formats";
import { type Lang, langLetter } from "./lang";

/**
 * Kampagne wie `LevelSkript` (`0x54D3F0`): Schritt für Schritt durch
 * `Play.txt`; `Load` gibt ein Level zurück, `Save`, `Play` und `credits`
 * führt der Aufrufer aus und fragt dann den nächsten Schritt ab. Befund:
 * `docs/measurements/dovez-runtime.md` („Kampagne“).
 *
 * `step` zählt die Anweisungen (das Original zählt Rohzeilen samt Leerzeilen;
 * der Unterschied bleibt innerhalb des Ports, auch in Spielständen).
 */

export type CampaignAction =
  /** Level laden und spielen; `loading` = Ladebild (`take<n>`), leer: Mosaik ohne Tastendruck. */
  | {
      readonly kind: "level";
      readonly slug: string;
      readonly name: string;
      readonly loading: string;
    }
  /** „Loading“, Video (`video/<slug>`), Schwarz. */
  | { readonly kind: "video"; readonly id: string }
  /** Speicherbildschirm (`SaveGame`); Stand nach dieser Anweisung. */
  | { readonly kind: "save" }
  /** Highscore, „Loading“, Outro, Abspann; danach mit `epilog` das Level Epilog. */
  | { readonly kind: "credits"; readonly outro: string; readonly epilog: boolean }
  /** Skriptende: Highscore, Hauptmenü. */
  | { readonly kind: "end" };

/** Name des Epilog-Levels (`[0x5880C4] = "Epilog"`). */
export const EPILOG = "Epilog";
/** `Me.115C = 10000`: nach dem einen Level (Einzellevel, Epilog) ist Schluss. */
const END = 10000;

export class Campaign {
  /** Nächste Anweisung (`Me.115C`). */
  step: number;
  /** Laufender Durchgang (`Me.6D8` = geschaffte Durchgänge + 1 beim neuen Spiel). */
  pass: number;
  /** Höchster geschaffter Durchgang (`[0x588080]`, in der Konfiguration gespeichert). */
  passesDone: number;

  constructor(
    private readonly steps: readonly PlayStep[],
    opts: { step?: number | undefined; pass?: number | undefined; passesDone?: number } = {},
  ) {
    this.passesDone = opts.passesDone ?? 0;
    this.step = opts.step ?? 0;
    this.pass = opts.pass ?? this.passesDone + 1;
  }

  /** Einzellevel (`Me.1158`, Bonus/`-Skip`): nur dieses Level, Ladebild ohne Tastendruck. */
  single(name: string): Extract<CampaignAction, { kind: "level" }> {
    this.finish();
    return { kind: "level", slug: dovezSlug(name), name, loading: "" };
  }

  /** Nach einem Einzellevel oder dem Epilog: Skriptende. */
  finish(): void {
    this.step = END;
  }

  /** `LevelSkript`: die nächste Anweisung (Zähler danach schon weiter). */
  next(lang: Lang): CampaignAction {
    const s = this.steps[this.step];
    if (!s) return { kind: "end" };
    this.step++;
    switch (s.op) {
      case "save":
        return { kind: "save" };
      case "play":
        return { kind: "video", id: videoId(s.video) };
      case "load":
        return {
          kind: "level",
          slug: dovezSlug(s.level),
          name: s.level,
          loading: s.loading.toLowerCase().replace(/\.bmp$/, ""),
        };
      case "credits": {
        if (this.pass > this.passesDone) this.passesDone = this.pass;
        const second = this.passesDone >= 2;
        return {
          kind: "credits",
          outro: languageVideo(second ? "outro2" : "outro", lang),
          epilog: second,
        };
      }
    }
  }

  /** Epilog nach dem Abspann: `[0x5880C4] = "Epilog"`, `Me.1160 = ""`, danach Skriptende. */
  epilog(): Extract<CampaignAction, { kind: "level" }> {
    return this.single(EPILOG);
  }
}

/**
 * Sprachabhängiges Video (`0x54DD63`/`0x54DDD0`, Intro `0x559BC5`):
 * `"Outro" & Me.588070 & ".avi"` — `outrod`, `outroe`, `outror` (ab Durchgang 2
 * `outro2…`), `introd/e/r`. Die russischen Videos liegen in den Originaldaten nicht
 * vor; fehlt ein Video, geht es wie im Original gleich weiter (`VideoScene`).
 */
export function languageVideo(base: "intro" | "outro" | "outro2", lang: Lang): string {
  return `video/${base}${langLetter(lang).toLowerCase()}`;
}

/** `Play <datei.avi>` → Asset-ID (Groß-/Kleinschreibung wie im Paket egal). */
export function videoId(file: string): string {
  return `video/${dovezSlug(file)}`;
}
