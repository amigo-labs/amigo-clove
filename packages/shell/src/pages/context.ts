import type { GameUi, KeyLayout, Locale, UiReply, UiScreen } from "@clove/core";
import type { Settings } from "../settings";
import type { ShellText } from "../texts";

/**
 * Was die Einstellungsseiten brauchen. Dieselben Seiten laufen unter
 * `#/settings` und, über `GameUi.settings`, aus den Optionen der Spiele.
 */
export interface PageContext {
  /** Texte und Sprache, live (ein Sprachwechsel gilt auf der nächsten Seite). */
  t(): ShellText;
  locale(): Locale;
  settings(): Settings;
  /** Übernimmt, speichert und wendet an. */
  update(patch: Partial<Settings>): void;
  readonly games: readonly PageGame[];
  readonly signal?: AbortSignal | undefined;
}

export interface PageGame {
  readonly id: string;
  readonly title: string;
  readonly keys?: KeyLayout;
}

/** Die Seite wurde von außen geschlossen (Route gewechselt, Spiel beendet). */
export const CLOSED = Symbol("closed");

/** Zeigt einen Bildschirm; wirft `CLOSED`, wenn er von außen geschlossen wurde. */
export async function ask(ui: GameUi, c: PageContext, screen: UiScreen): Promise<UiReply> {
  const r = await ui.show(screen, c.signal);
  if (r.id === "aborted" || c.signal?.aborted) throw CLOSED;
  return r;
}

/** Führt eine Seite aus; ein Schließen von außen beendet sie still. */
export async function runPage(page: () => Promise<void>): Promise<void> {
  try {
    await page();
  } catch (e) {
    if (e !== CLOSED) throw e;
  }
}

/** Auswahl an/aus. */
export function onOff(t: ShellText): readonly { value: string; label: string }[] {
  return [
    { value: "on", label: t("on") },
    { value: "off", label: t("off") },
  ];
}
