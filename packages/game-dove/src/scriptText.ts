import { KEY_ACTIONS, type KeyActionId } from "./keys";
import { SCRIPT_TEXTS } from "./sim/scripts";

/**
 * Tutorial- und Skripttexte mit den belegten Tasten. Die Texte des Originals
 * nennen die Originaltasten („Du schießt mit S!“); ist eine Aktion umbelegt
 * (Tastenbelegung der Shell), nennt der Text die neue Taste. Mit der
 * Original-Belegung bleibt der Text Zeichen für Zeichen der des Originals.
 */

/** Belegte Tasten einer Aktion: Code und Anzeigename. */
export type BoundKeys = (
  action: KeyActionId,
) => readonly { readonly code: string; readonly name: string }[];

/** Vorlagen [Deutsch, Englisch] und die Aktionen, deren Tasten sie nennen. */
const TEMPLATES: Readonly<Record<number, readonly [string, string, readonly KeyActionId[]]>> = {
  1: [
    "So, und los geht's! Du steuerst mit {move}",
    "OK, let's go! You navigate the spaceship with {move}.",
    ["up", "left", "down", "right"],
  ],
  2: [
    "Uh, da kommt ein Gegner! Du schießt mit {fire}! Mach ihn fertig!",
    "Oh, an enemy is coming! You fire with {fire}! Blow him away!",
    ["fire"],
  ],
  4: [
    "Ok, wir versuchen es nochmal! Drücke {fire} zum schießen!",
    "OK, try again! In order to fire press {fire}.",
    ["fire"],
  ],
  6: [
    "OK, mit {swap} kannst du deine Extrawaffe nach hinten ausrichten! Probier' es aus! Nur einmal drücken!",
    "OK, press {swap} to put your special weapon on the back! Try it! Press only once!",
    ["swap"],
  ],
  9: [
    "Du kannst {slower} drücken um langsamer zu fliegen.",
    "Press {slower}  to slow down.",
    ["slower"],
  ],
  10: ["Mit {faster} Kannst du wieder schnell werden", "Press {faster} to speed up.", ["faster"]],
  11: [
    "Nun lade mit {beam} deinen Beam komplett auf",
    "Hold key {beam} down to fill up your BigShot device completely.",
    ["beam"],
  ],
  12: [
    "warte bis drei Beißer auf dem Bildschirm sind und lass dann {beam} los",
    "Wait for tree biter to enter the scenery, then take off from key {beam}.",
    ["beam"],
  ],
  16: [
    "Benutze {faster} um wieder schneller zu fliegen",
    "USE {faster} to fly faster again",
    ["faster"],
  ],
};

const ORIGINAL: ReadonlyMap<string, readonly string[]> = new Map(
  KEY_ACTIONS.map((a) => [a.id, a.codes]),
);

function isOriginal(id: KeyActionId, keys: readonly { code: string }[]): boolean {
  const orig = ORIGINAL.get(id) ?? [];
  return keys.length === orig.length && keys.every((k) => orig.includes(k.code));
}

/** Skripttext `index` in der Sprache, mit den belegten Tasten; `undefined` ohne Text. */
export function scriptText(index: number, german: boolean, bound?: BoundKeys): string | undefined {
  const original = SCRIPT_TEXTS[index];
  if (!original) return undefined;
  const text = original[german ? 0 : 1];
  const tpl = TEMPLATES[index];
  if (!tpl || !bound) return text;
  const keys = tpl[2].map((id) => bound(id));
  if (tpl[2].every((id, i) => isOriginal(id, keys[i]!)) || keys.some((k) => k.length === 0))
    return text;
  const or = german ? " oder " : " or ";
  const and = german ? " und " : " and ";
  const names = (id: KeyActionId) => bound(id).map((k) => k.name);
  const first = (id: KeyActionId) => names(id)[0] ?? "?";
  const move = (["up", "left", "down", "right"] as const).map(first);
  return tpl[german ? 0 : 1]
    .replace("{move}", `${move.slice(0, -1).join(", ")}${and}${move.at(-1)}`)
    .replace("{fire}", first("fire"))
    .replace("{swap}", first("swap"))
    .replace("{beam}", first("beam"))
    .replace("{slower}", names("slower").slice(0, 2).join(or))
    .replace("{faster}", names("faster").slice(0, 2).join(or));
}

/** Tastenname für die 8-px-Schrift im Canvas (nur ASCII). */
export function asciiKeyName(code: string, german: boolean): string {
  const arrows: Readonly<Record<string, readonly [string, string]>> = {
    ArrowUp: ["Hoch", "Up"],
    ArrowDown: ["Runter", "Down"],
    ArrowLeft: ["Links", "Left"],
    ArrowRight: ["Rechts", "Right"],
    Space: ["Leertaste", "Space"],
  };
  const a = arrows[code];
  if (a) return a[german ? 0 : 1];
  const m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1]!;
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}
