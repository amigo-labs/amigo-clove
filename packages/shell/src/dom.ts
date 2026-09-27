type Child = Node | string | false | null | undefined;

/** Kleiner Element-Baukasten; Texte werden nie als HTML interpretiert. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | boolean | ((e: Event) => void)>> = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === "function") el.addEventListener(name.replace(/^on/, ""), value);
    else if (value === true) el.setAttribute(name, "");
    else if (value !== false) el.setAttribute(name, value);
  }
  for (const c of children) if (c !== false && c !== null && c !== undefined) el.append(c);
  return el;
}
