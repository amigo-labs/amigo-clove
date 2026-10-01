import { createSaveFile, parseSaveFile, type GameUi, type UiBlock, type UiItem } from "@clove/core";
import { h } from "../dom";
import {
  installGame,
  offlineStatus,
  offlineSupported,
  removeGame,
  storageEstimate,
  type OfflineStatus,
} from "../offline";
import { collectSaves, restoreSaves, webStorage } from "../storage";
import { mb } from "../texts";
import { ask, type PageContext } from "./context";

/** Spielstände als Datei sichern und zurückholen. */
export async function savesPage(ui: GameUi, c: PageContext): Promise<void> {
  const t = c.t();
  let message = "";
  for (;;) {
    const blocks: UiBlock[] = [{ kind: "lines", lines: [t("savesHelp")], tone: "dim" }];
    if (message) blocks.push({ kind: "lines", lines: [message], tone: "accent" });
    const r = await ask(ui, c, {
      kind: "menu",
      title: t("saves"),
      blocks,
      items: [
        { id: "export", label: t("export") },
        { id: "import", label: t("import") },
        { id: "back", label: t("back") },
      ],
      back: "back",
    });
    if (r.id === "export") exportSaves();
    else if (r.id === "import") message = (await importSaves(c)) ?? message;
    else return;
  }
}

function exportSaves(): void {
  const storage = webStorage();
  const now = new Date();
  const file = createSaveFile(storage ? collectSaves(storage) : {}, now);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const a = h("a", {
    href: URL.createObjectURL(blob),
    download: `amigo-clove-${now.toISOString().slice(0, 10)}.json`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/** Dateiauswahl (noch in der Geste des Klicks); liefert die Meldung, ohne Datei nichts. */
function importSaves(c: PageContext): Promise<string | undefined> {
  const t = c.t();
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(undefined);
      try {
        const save = parseSaveFile(await file.text());
        const storage = webStorage();
        if (!storage) throw new Error("localStorage nicht verfügbar");
        restoreSaves(storage, save.games);
        resolve(t("imported", { games: Object.keys(save.games).join(", ") || "—" }));
      } catch (err) {
        resolve(t("importFailed", { error: err instanceof Error ? err.message : String(err) }));
      }
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(undefined);
    });
    document.body.append(input);
    input.click();
  });
}

/** Offline-Daten je Spiel: installieren (mit Fortschritt) und entfernen. */
export async function offlinePage(ui: GameUi, c: PageContext): Promise<void> {
  const t = c.t();
  if (!offlineSupported()) {
    await ask(ui, c, {
      kind: "menu",
      title: t("offline"),
      blocks: [{ kind: "lines", lines: [t("noServiceWorker")], tone: "dim" }],
      items: [{ id: "back", label: t("back") }],
      back: "back",
    });
    return;
  }
  let message = "";
  for (;;) {
    const status = new Map<string, OfflineStatus>();
    for (const g of c.games) {
      try {
        status.set(g.id, await offlineStatus(g.id));
      } catch (err) {
        message = String(err instanceof Error ? err.message : err);
      }
    }
    const items: UiItem[] = [];
    for (const g of c.games) {
      const s = status.get(g.id);
      if (!s) continue;
      const ready = s.cachedBytes >= s.totalBytes;
      const state = ready
        ? t("offlineReady")
        : s.cachedBytes > 0
          ? t("offlinePartial", { percent: Math.floor((100 * s.cachedBytes) / s.totalBytes) })
          : t("offlineNone");
      items.push({
        id: `install:${g.id}`,
        label: `${g.title}: ${ready ? t("offlineReady") : t("install", { size: mb(s.totalBytes - s.cachedBytes, c.locale()) })}`,
        hint: state,
        disabled: ready,
      });
      if (s.cachedBytes > 0)
        items.push({ id: `remove:${g.id}`, label: `${g.title}: ${t("remove")}` });
    }
    items.push({ id: "back", label: t("back") });
    const lines: string[] = [];
    const persisted = [...status.values()].some((s) => s.cachedBytes > 0);
    if (persisted) {
      const any = [...status.values()][0];
      lines.push(t(any?.persisted ? "persisted" : "notPersisted"));
    }
    const est = await storageEstimate().catch(() => undefined);
    if (est)
      lines.push(
        t("storageUsage", { used: mb(est.used, c.locale()), quota: mb(est.quota, c.locale()) }),
      );
    const blocks: UiBlock[] = [{ kind: "lines", lines: [t("offlineHelp")], tone: "dim" }];
    if (lines.length) blocks.push({ kind: "lines", lines, tone: "dim" });
    if (message) blocks.push({ kind: "lines", lines: [message], tone: "accent" });
    const r = await ask(ui, c, { kind: "menu", title: t("offline"), blocks, items, back: "back" });
    const [action, id] = r.id.split(":");
    const game = c.games.find((g) => g.id === id);
    if (!game) return;
    message = "";
    if (action === "remove") await removeGame(game.id);
    else message = (await install(ui, c, game)) ?? "";
  }
}

/** Installiert mit Fortschrittsbalken; liefert eine Fehlermeldung. */
async function install(
  ui: GameUi,
  c: PageContext,
  game: { readonly id: string; readonly title: string },
): Promise<string | undefined> {
  const t = c.t();
  let fraction = 0;
  const done = new AbortController();
  const screen = ask(
    ui,
    { ...c, signal: done.signal },
    {
      kind: "notice",
      title: t("offline"),
      lines: [game.title],
      progress: () => fraction,
      until: "progress",
    },
  ).catch(() => undefined);
  try {
    await installGame(game.id, (loaded, total) => {
      fraction = total ? Math.min(0.999, loaded / total) : 0;
    });
    fraction = 1;
    await screen;
    return undefined;
  } catch (err) {
    done.abort();
    return String(err instanceof Error ? err.message : err);
  }
}
