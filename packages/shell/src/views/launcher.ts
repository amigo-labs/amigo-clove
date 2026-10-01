import type { ControlsSheet, GameUi, UiItem } from "@clove/core";
import { offlineStatus, offlineSupported } from "../offline";
import type { ShellText } from "../texts";

export interface GameCard {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly available: boolean;
  /** Debug-Ansichten (`#/<id>/<path>`). */
  readonly debug?: readonly { readonly path: string; readonly label: string }[];
  /** Tastenübersicht, gezeigt solange die Karte gewählt ist. */
  readonly controls?: ControlsSheet;
}

/** Offline-Stand je Spiel als kurzer Text (leer, wenn nichts gespeichert ist). */
async function offlineText(t: ShellText, id: string): Promise<string> {
  if (!offlineSupported()) return "";
  try {
    const s = await offlineStatus(id);
    const pct = s.totalBytes ? Math.floor((100 * s.cachedBytes) / s.totalBytes) : 0;
    return pct >= 100 ? t("offlineReady") : pct > 0 ? t("offlinePartial", { percent: pct }) : "";
  } catch {
    return "";
  }
}

/**
 * Startseite als HTML-Menü aus denselben Bausteinen wie die Spiele: eine Karte je
 * Spiel (Untertitel, Offline-Stand, daneben die Tastenübersicht), Einstellungen,
 * Debug-Ansichten. Liefert das Ziel (`#/…`) der Wahl.
 */
export async function launcherMenu(
  ui: GameUi,
  t: ShellText,
  games: readonly GameCard[],
  signal: AbortSignal,
  selected?: string,
): Promise<string | undefined> {
  const offline = await Promise.all(games.map((g) => offlineText(t, g.id)));
  if (signal.aborted) return undefined;
  const items: UiItem[] = games.map((g, i) => ({
    id: `#/${g.id}`,
    label: g.title,
    hint: [g.available ? g.subtitle : t("comingSoon"), offline[i]].filter(Boolean).join(" · "),
    disabled: !g.available,
    theme: g.id,
    ...(g.controls
      ? { preview: [{ kind: "controls" as const, sheet: g.controls, game: g.id }] }
      : {}),
  }));
  items.push({ id: "#/settings", label: t("settings") });
  for (const g of games)
    for (const d of g.debug ?? [])
      items.push({ id: `#/${g.id}/${d.path}`, label: d.label, hint: g.title });
  const r = await ui.show(
    {
      kind: "menu",
      title: "amigo-clove",
      items,
      ...(selected ? { selected } : {}),
    },
    signal,
  );
  return r.id.startsWith("#/") ? r.id : undefined;
}
