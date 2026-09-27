/** Hash-Routen der Shell; kein Server-Rewrite nötig. */
export type Route =
  | { readonly view: "launcher" }
  | { readonly view: "settings" }
  | {
      readonly view: "game";
      readonly id: string;
      /** Unterpfad nach der Spiel-ID, z. B. `debug/assets`; leer für das Spiel selbst. */
      readonly sub: string;
      readonly params: Readonly<Record<string, string>>;
    }
  | { readonly view: "unknown"; readonly path: string };

/**
 * `#/`, `#/settings`, `#/<spiel>?a=1&b`, `#/<spiel>/<unterpfad>` (z. B.
 * `#/dovez/debug/assets`). Parameter ohne Wert gelten als `""`.
 */
export function parseRoute(hash: string, games: ReadonlySet<string>): Route {
  const [path = "", query = ""] = hash.replace(/^#?\/?/, "").split("?");
  const clean = path.replace(/\/+$/, "");
  if (clean === "") return { view: "launcher" };
  if (clean === "settings") return { view: "settings" };
  const [id = "", ...rest] = clean.split("/");
  if (games.has(id)) {
    return {
      view: "game",
      id,
      sub: rest.join("/"),
      params: Object.fromEntries(new URLSearchParams(query)),
    };
  }
  return { view: "unknown", path: clean };
}
