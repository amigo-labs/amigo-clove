/** Hash-Routen der Shell; kein Server-Rewrite nötig. */
export type Route =
  | { readonly view: "launcher" }
  | { readonly view: "settings" }
  | {
      readonly view: "game";
      readonly id: string;
      readonly params: Readonly<Record<string, string>>;
    }
  | { readonly view: "unknown"; readonly path: string };

/** `#/`, `#/settings`, `#/<spiel>?a=1&b` (Parameter ohne Wert gelten als `""`). */
export function parseRoute(hash: string, games: ReadonlySet<string>): Route {
  const [path = "", query = ""] = hash.replace(/^#?\/?/, "").split("?");
  const clean = path.replace(/\/+$/, "");
  if (clean === "") return { view: "launcher" };
  if (clean === "settings") return { view: "settings" };
  if (games.has(clean)) {
    return { view: "game", id: clean, params: Object.fromEntries(new URLSearchParams(query)) };
  }
  return { view: "unknown", path: clean };
}
