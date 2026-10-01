import { SETTINGS_PAGES, type GameUi, type SettingsPage, type UiItem } from "@clove/core";
import type { Settings } from "../settings";
import { ask, type PageContext, type PageGame } from "./context";
import { offlinePage, savesPage } from "./data";
import { audioPage, controlsPage, displayPage } from "./forms";
import { keysPage } from "./keys";

const LANGUAGES: readonly (readonly [Settings["language"], string])[] = [
  ["de", "Deutsch"],
  ["en", "English"],
  ["ru", "Русский"],
];

async function languagePage(ui: GameUi, c: PageContext): Promise<void> {
  const t = c.t();
  const current = c.settings().language;
  const r = await ask(ui, c, {
    kind: "menu",
    title: t("language"),
    items: [
      { id: "auto", label: t("languageAuto") },
      ...LANGUAGES.map(([id, label]) => ({ id, label })),
      { id: "back", label: t("back") },
    ],
    selected: current,
    back: "back",
  });
  const lang = r.id === "auto" ? "auto" : LANGUAGES.find(([id]) => id === r.id)?.[0];
  if (lang && lang !== current) c.update({ language: lang });
}

/** Eine gemeinsame Seite, wie sie die Spiele über `GameUi.settings` öffnen. */
export async function settingsPage(
  ui: GameUi,
  c: PageContext,
  page: SettingsPage,
  game?: PageGame,
): Promise<void> {
  switch (page) {
    case "keys":
      if (game?.keys) await keysPage(ui, c, { ...game, keys: game.keys });
      return;
    case "audio":
      return audioPage(ui, c);
    case "display":
      return displayPage(ui, c);
  }
}

/**
 * `#/settings`: Übersicht aller Seiten. Endet mit Zurück; `onEnter` merkt sich
 * die Seite, damit ein Neuaufbau (Sprachwechsel) dort wieder vorwählt.
 */
export async function settingsMenu(
  ui: GameUi,
  c: PageContext,
  selected: string | undefined,
  onEnter: (id: string) => void,
): Promise<void> {
  let last = selected;
  for (;;) {
    const t = c.t();
    const locale = c.locale();
    const lang = c.settings().language;
    const items: UiItem[] = [
      {
        id: "language",
        label: t("language"),
        hint:
          lang === "auto" ? t("languageAuto") : (LANGUAGES.find(([id]) => id === lang)?.[1] ?? ""),
      },
      { id: "audio", label: SETTINGS_PAGES.audio[locale] },
      { id: "display", label: SETTINGS_PAGES.display[locale] },
      { id: "controls", label: t("controls") },
      ...c.games
        .filter((g) => g.keys)
        .map((g) => ({ id: `keys:${g.id}`, label: `${SETTINGS_PAGES.keys[locale]} ${g.title}` })),
      { id: "saves", label: t("saves") },
      { id: "offline", label: t("offline") },
      { id: "back", label: t("back") },
    ];
    const r = await ask(ui, c, {
      kind: "menu",
      title: t("settings"),
      items,
      ...(last ? { selected: last } : {}),
      back: "back",
    });
    last = r.id;
    onEnter(r.id);
    const [page, id] = r.id.split(":");
    switch (page) {
      case "language":
        await languagePage(ui, c);
        break;
      case "audio":
      case "display":
        await settingsPage(ui, c, page);
        break;
      case "controls":
        await controlsPage(ui, c);
        break;
      case "keys":
        await settingsPage(
          ui,
          c,
          "keys",
          c.games.find((g) => g.id === id),
        );
        break;
      case "saves":
        await savesPage(ui, c);
        break;
      case "offline":
        await offlinePage(ui, c);
        break;
      default:
        return;
    }
  }
}
