import type { KeyState } from "@clove/core";

/** Tasten, die sonst die Seite scrollen (DoveZ-Zwei-Spieler-Belegung nutzt Pos1/Ende/Bild). */
const SCROLL_KEYS = new Set(["Space", "PageUp", "PageDown", "Home", "End"]);

/** Tastaturzustand der Shell. Fokusverlust lässt alle Tasten los. */
export function createKeyState(target: Window): KeyState & { dispose(): void } {
  const down = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    // Alt+Enter schaltet das Vollbild der Shell, das Spiel sieht davon kein Enter
    if (e.code === "Enter" && e.altKey) return;
    down.add(e.code);
    if (e.code.startsWith("Arrow") || SCROLL_KEYS.has(e.code)) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const onBlur = () => down.clear();
  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);
  target.addEventListener("blur", onBlur);
  return {
    isDown: (code) => down.has(code),
    held: () => [...down],
    dispose() {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", onBlur);
      down.clear();
    },
  };
}
