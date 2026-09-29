import { createSaveFile, parseSaveFile, type Locale } from "@clove/core";
import { h } from "../dom";
import {
  installGame,
  offlineStatus,
  offlineSupported,
  removeGame,
  storageEstimate,
} from "../offline";
import type { Settings } from "../settings";
import { collectSaves, restoreSaves, webStorage } from "../storage";
import { mb, type ShellText } from "../texts";

export interface SettingsContext {
  readonly t: ShellText;
  readonly locale: Locale;
  /** Aktueller Stand (ändert sich mit jedem `update`). */
  settings(): Settings;
  /** Übernimmt, speichert und wendet an; bei Sprachwechsel baut die Shell die Seite neu. */
  update(patch: Partial<Settings>): void;
  /** Endet beim Verlassen der Seite (Listener abmelden). */
  readonly signal: AbortSignal;
  /** Spiele mit Offline-Daten (ID, Titel). */
  readonly games: readonly { readonly id: string; readonly title: string }[];
}

function section(title: string, ...body: (Node | string)[]): HTMLElement {
  return h("section", {}, h("h2", {}, title), ...body);
}

function languageSection(c: SettingsContext): HTMLElement {
  const select = h(
    "select",
    {
      id: "language",
      onchange: (e) => {
        const language = (e.target as HTMLSelectElement).value as Settings["language"];
        c.update({ language });
      },
    },
    ...(
      [
        ["auto", c.t("languageAuto")],
        ["de", "Deutsch"],
        ["en", "English"],
      ] as const
    ).map(([v, label]) => h("option", { value: v, selected: c.settings().language === v }, label)),
  );
  return section(c.t("language"), select);
}

function motionSection(c: SettingsContext): HTMLElement {
  const select = h(
    "select",
    {
      id: "motion",
      "aria-describedby": "motion-help",
      onchange: (e) =>
        c.update({ motion: (e.target as HTMLSelectElement).value as Settings["motion"] }),
    },
    ...(
      [
        ["auto", c.t("motionAuto")],
        ["reduce", c.t("motionReduce")],
        ["full", c.t("motionFull")],
      ] as const
    ).map(([v, label]) => h("option", { value: v, selected: c.settings().motion === v }, label)),
  );
  return section(
    c.t("motion"),
    select,
    h("p", { class: "hint", id: "motion-help" }, c.t("motionHelp")),
  );
}

function volumeSection(c: SettingsContext): HTMLElement {
  const rows = (["master", "music", "sfx"] as const).map((ch) => {
    const label = { master: "volumeMaster", music: "volumeMusic", sfx: "volumeSfx" } as const;
    const start = Math.round(c.settings().volume[ch] * 100);
    const out = h("output", {}, `${start} %`);
    const input = h("input", {
      type: "range",
      id: `volume-${ch}`,
      min: "0",
      max: "100",
      step: "5",
      value: String(start),
      oninput: (e) => {
        const v = Number((e.target as HTMLInputElement).value) / 100;
        out.textContent = `${Math.round(v * 100)} %`;
        c.update({ volume: { ...c.settings().volume, [ch]: v } });
      },
    });
    return h("label", { class: "row" }, h("span", {}, c.t(label[ch])), input, out);
  });
  return section(c.t("volume"), ...rows);
}

function gamepadSection(c: SettingsContext): HTMLElement {
  const status = h("p", { class: "hint" });
  const refresh = () => {
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((p) => p !== null);
    status.textContent = pads.length
      ? pads.map((p) => c.t("gamepadConnected", { name: p.id })).join(" · ")
      : c.t("gamepadNone");
  };
  refresh();
  window.addEventListener("gamepadconnected", refresh, { signal: c.signal });
  window.addEventListener("gamepaddisconnected", refresh, { signal: c.signal });
  const box = h("input", {
    type: "checkbox",
    id: "gamepad",
    checked: c.settings().gamepad,
    onchange: (e) => c.update({ gamepad: (e.target as HTMLInputElement).checked }),
  });
  return section(
    c.t("gamepad"),
    h("label", { class: "row" }, box, h("span", {}, c.t("gamepadUse"))),
    status,
    h("p", { class: "hint" }, c.t("gamepadHelp")),
  );
}

function savesSection(c: SettingsContext): HTMLElement {
  const message = h("p", { class: "hint", id: "saves-message" });
  const exportButton = h(
    "button",
    {
      id: "export",
      onclick: () => {
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
      },
    },
    c.t("export"),
  );
  const fileInput = h("input", {
    type: "file",
    id: "import-file",
    accept: "application/json,.json",
    hidden: true,
    onchange: async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      try {
        const save = parseSaveFile(await file.text());
        const storage = webStorage();
        if (!storage) throw new Error("localStorage nicht verfügbar");
        restoreSaves(storage, save.games);
        message.textContent = c.t("imported", {
          games: Object.keys(save.games).join(", ") || "—",
        });
      } catch (err) {
        message.textContent = c.t("importFailed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });
  const importButton = h(
    "button",
    { id: "import", onclick: () => fileInput.click() },
    c.t("import"),
  );
  return section(
    c.t("saves"),
    h("p", { class: "hint" }, c.t("savesHelp")),
    h("div", { class: "row" }, exportButton, importButton, fileInput),
    message,
  );
}

function offlineRow(c: SettingsContext, game: { id: string; title: string }): HTMLElement {
  const info = h("span", { class: "hint" });
  const install = h("button", { "data-install": game.id });
  const remove = h("button", { "data-remove": game.id }, c.t("remove"));
  const persisted = h("p", { class: "hint" });
  const refresh = async () => {
    const s = await offlineStatus(game.id);
    const ready = s.cachedBytes >= s.totalBytes;
    install.textContent = ready
      ? c.t("offlineReady")
      : c.t("install", { size: mb(s.totalBytes - s.cachedBytes, c.locale) });
    install.disabled = ready;
    remove.disabled = s.cachedBytes === 0;
    info.textContent = ready
      ? ""
      : s.cachedBytes > 0
        ? c.t("offlinePartial", { percent: Math.floor((100 * s.cachedBytes) / s.totalBytes) })
        : c.t("offlineNone");
    persisted.textContent =
      s.cachedBytes > 0 ? c.t(s.persisted ? "persisted" : "notPersisted") : "";
    const est = await storageEstimate();
    if (est) {
      persisted.textContent += ` ${c.t("storageUsage", {
        used: mb(est.used, c.locale),
        quota: mb(est.quota, c.locale),
      })}`;
    }
    install.dataset["state"] = ready ? "ready" : "missing";
  };
  install.addEventListener("click", async () => {
    install.disabled = remove.disabled = true;
    try {
      await installGame(game.id, (loaded, total) => {
        install.textContent = c.t("installing", {
          loaded: mb(loaded, c.locale),
          total: mb(total, c.locale),
        });
      });
    } catch (err) {
      info.textContent = String(err instanceof Error ? err.message : err);
    }
    await refresh();
  });
  remove.addEventListener("click", async () => {
    await removeGame(game.id);
    await refresh();
  });
  refresh().catch((err: unknown) => {
    info.textContent = String(err instanceof Error ? err.message : err);
  });
  return h(
    "div",
    { class: "offline-game" },
    h("div", { class: "row" }, h("strong", {}, game.title), install, remove, info),
    persisted,
  );
}

function offlineSection(c: SettingsContext): HTMLElement {
  if (!offlineSupported()) {
    return section(c.t("offline"), h("p", { class: "hint" }, c.t("noServiceWorker")));
  }
  return section(
    c.t("offline"),
    h("p", { class: "hint" }, c.t("offlineHelp")),
    ...c.games.map((g) => offlineRow(c, g)),
  );
}

export function settingsView(c: SettingsContext): HTMLElement {
  return h(
    "div",
    { id: "settings" },
    h("h1", {}, c.t("settings")),
    languageSection(c),
    volumeSection(c),
    motionSection(c),
    gamepadSection(c),
    savesSection(c),
    offlineSection(c),
    h("a", { class: "button secondary", href: "#/", id: "back" }, c.t("back")),
  );
}
