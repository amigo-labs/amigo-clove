import { h } from "../dom";
import { offlineStatus, offlineSupported } from "../offline";
import type { ShellText } from "../texts";

export interface GameCard {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly available: boolean;
  /** Unterpfad einer Debug-Ansicht (`#/<id>/<debug>`). */
  readonly debug?: string;
}

/** Startseite: ein Eintrag je Spiel, Offline-Stand, Link zu den Einstellungen. */
export function launcherView(t: ShellText, games: readonly GameCard[]): HTMLElement {
  const list = h("ul", { class: "games" });
  for (const g of games) {
    const status = h("span", { class: "status" });
    list.append(
      h(
        "li",
        { class: g.available ? "game" : "game unavailable" },
        h("div", { class: "title" }, g.title),
        h("div", { class: "sub" }, g.subtitle),
        g.available
          ? h("a", { class: "button", href: `#/${g.id}`, "data-play": g.id }, t("play"))
          : h("span", { class: "button" }, t("comingSoon")),
        status,
        g.debug && h("a", { class: "debug", href: `#/${g.id}/${g.debug}` }, t("debugAssets")),
      ),
    );
    if (g.available && offlineSupported()) {
      offlineStatus(g.id)
        .then((s) => {
          const pct = s.totalBytes ? Math.floor((100 * s.cachedBytes) / s.totalBytes) : 0;
          status.textContent =
            pct >= 100 ? t("offlineReady") : pct > 0 ? t("offlinePartial", { percent: pct }) : "";
          status.dataset["offline"] = pct >= 100 ? "ready" : "no";
        })
        .catch(() => undefined);
    }
  }
  const view = h(
    "div",
    { id: "launcher" },
    h("h1", {}, "amigo-clove"),
    list,
    h("a", { class: "button secondary", href: "#/settings" }, t("settings")),
  );
  // Tastatur/Gamepad-Fokus direkt auf das erste Spiel
  queueMicrotask(() => view.querySelector<HTMLElement>("[data-play]")?.focus());
  return view;
}
