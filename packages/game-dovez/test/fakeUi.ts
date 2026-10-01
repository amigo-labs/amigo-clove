/** `GameUi` für Tests: antwortet der Reihe nach aus einem Skript und merkt sich die Bildschirme. */
import type { GameUi, KeyValueStore, SettingsPage, UiReply, UiScreen, UiValues } from "@clove/core";

type Step = UiReply | ((screen: UiScreen) => UiReply);

export class ScriptUi implements GameUi {
  readonly shown: UiScreen[] = [];
  /** Geöffnete Einstellungsseiten der Shell (`settings`). */
  readonly pages: SettingsPage[] = [];
  private readonly steps: Step[];

  constructor(steps: readonly Step[]) {
    this.steps = [...steps];
  }

  show(screen: UiScreen): Promise<UiReply> {
    this.shown.push(screen);
    const step = this.steps.shift();
    if (!step) throw new Error(`keine Antwort für ${screen.kind} „${screen.title ?? ""}“`);
    return Promise.resolve(typeof step === "function" ? step(screen) : step);
  }

  settings(page: SettingsPage): Promise<void> {
    this.pages.push(page);
    return Promise.resolve();
  }

  /** Alle Antworten verbraucht. */
  get done(): boolean {
    return this.steps.length === 0;
  }
}

/**
 * Formular wie in der Shell bedienen: jede Änderung einzeln an `onChange`, dann
 * die Aktion mit allen Werten (Startwerte der Felder plus Änderungen).
 */
export function submitForm(action: string, changes: UiValues): Step {
  return (screen) => {
    if (screen.kind !== "form") throw new Error(`Formular erwartet, nicht ${screen.kind}`);
    const values: Record<string, string | number> = {};
    for (const f of screen.fields) {
      if (f.kind === "key") values[f.id] = f.value.join(" ");
      else if (f.kind !== "info") values[f.id] = f.value;
    }
    for (const [id, v] of Object.entries(changes)) {
      values[id] = v;
      screen.onChange?.({ ...values }, id);
    }
    return { id: action, values };
  };
}

/** Speicher im Arbeitsspeicher. */
export function memoryStore(init: Record<string, string> = {}): KeyValueStore & {
  readonly data: Map<string, string>;
} {
  const data = new Map(Object.entries(init));
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
  };
}
