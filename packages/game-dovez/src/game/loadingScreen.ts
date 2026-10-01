import type { UiImage, UiNotice } from "@clove/core";
import { type Lang, loadingText, pressAnyKeyText } from "./lang";

/**
 * Ladebildschirm von `LadeDaten` (`0x4C72C0`) als Hinweis der Shell, zwei Varianten:
 *
 * - **Bild** (Kampagne, `take<n>` aus `Loading.d2p`): Fortschrittsbalken und
 *   „Loading“ (Russisch „Загрузка“), danach „Press any key to start!“ bis zu
 *   einer Taste — auch die deutsche Fassung zeigt den englischen Text.
 * - **Mosaik** (`Loadingscreen.bmp`, Einzellevel und Epilog): die Momentaufnahmen
 *   aus Pause und Toden; endet ohne Tastendruck, sobald alles geladen ist.
 *
 * `progress` ist im Original der Anteil der geladenen Bildgruppen, im Port der
 * geladenen Bytes; 1 erst, wenn das Level aufgebaut ist.
 */
export function loadingNotice(o: {
  readonly lang: Lang;
  readonly image: UiImage | undefined;
  readonly mosaic: boolean;
  readonly progress: () => number;
}): UiNotice {
  return {
    kind: "notice",
    lines: [loadingText(o.lang).text],
    ...(o.image ? { image: o.image } : {}),
    progress: o.progress,
    ...(o.mosaic
      ? { until: "progress" as const }
      : { until: "any" as const, prompt: pressAnyKeyText(o.lang).text }),
  };
}
