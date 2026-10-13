import type { Container } from "pixi.js";

/**
 * Merkt sich, ob `container` seit der letzten Abfrage Kinder bekommen oder
 * verloren hat (eine Szene oder ein Bildschirm wurde auf- oder abgebaut): Dann
 * ist das nächste Bild zu zeichnen, auch ohne neuen Tick. Die gelieferte
 * Funktion meldet das und setzt die Marke zurück; anfangs ist sie gesetzt.
 */
export function stageChanges(container: Container): () => boolean {
  let changed = true;
  const mark = () => (changed = true);
  container.on("childAdded", mark).on("childRemoved", mark);
  return () => {
    const was = changed;
    changed = false;
    return was;
  };
}
