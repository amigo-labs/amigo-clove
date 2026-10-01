import {
  CUSTOM_PRESET,
  MAX_KEYS,
  PRESET_LABELS,
  keyIssues,
  presetOf,
  resolveBindings,
  type GameUi,
  type KeyAction,
  type KeyBindings,
  type KeyLayout,
  type UiField,
} from "@clove/core";
import { assignable, keyName } from "../keymap";
import type { ShellText } from "../texts";
import { ask, type PageContext } from "./context";

/** Anzeigename einer Taste in der Sprache der Shell. */
export function keyLabel(t: ShellText, code: string): string {
  return code === "Space" ? t("keySpace") : keyName(code);
}

const FIELD = "key:";

function groupLabel(t: ShellText, layout: KeyLayout, a: KeyAction): string {
  const g =
    a.group === "weapon"
      ? t("keysGroupWeapon")
      : a.group === "system"
        ? t("keysGroupSystem")
        : t("keysGroupMove");
  const duo = layout.actions.some((x) => x.player === 1);
  return duo && a.player !== undefined && a.group !== "system"
    ? t("keysPlayer", { n: a.player + 1, group: g })
    : g;
}

/** Felder des Editors zur Arbeitsbelegung: Vorlage, Tasten je Aktion, Hinweise. */
export function keyFields(
  t: ShellText,
  locale: "de" | "en" | "ru",
  layout: KeyLayout,
  keys: KeyBindings,
): UiField[] {
  const preset = presetOf(layout, keys);
  const issues = keyIssues(layout.actions, keys);
  const warned = new Set([...issues.duplicates.values()].flat());
  const options = layout.presets.map((p) => ({ value: p.id, label: p.label[locale] }));
  if (preset === CUSTOM_PRESET)
    options.push({ value: CUSTOM_PRESET, label: PRESET_LABELS.custom[locale] });
  const out: UiField[] = [
    { kind: "info", id: "help", text: t("keysHelp"), tone: "dim" },
    { kind: "choice", id: "preset", label: t("keysPreset"), options, value: preset },
  ];
  for (const a of layout.actions) {
    out.push({
      kind: "key",
      id: FIELD + a.id,
      group: groupLabel(t, layout, a),
      label: a.label[locale],
      value: keys[a.id] ?? [],
      max: MAX_KEYS,
      ...(warned.has(a.id) || issues.missing.includes(a.id) ? { warn: true } : {}),
    });
  }
  const label = (id: string) => layout.actions.find((a) => a.id === id)?.label[locale] ?? id;
  if (issues.missing.length > 0)
    out.push({
      kind: "info",
      id: "missing",
      tone: "warn",
      text: t("keysMissing", { actions: issues.missing.map(label).join(", ") }),
    });
  if (issues.duplicates.size > 0)
    out.push({
      kind: "info",
      id: "duplicates",
      tone: "warn",
      text: t("keysDuplicate", {
        keys: [...issues.duplicates]
          .map(([k, ids]) => `${keyLabel(t, k)} (${ids.map(label).join(", ")})`)
          .join("; "),
      }),
    });
  return out;
}

/** Arbeitsbelegung nach einer Änderung im Editor. */
export function applyKeyChange(
  layout: KeyLayout,
  keys: KeyBindings,
  changed: string,
  value: string | number | undefined,
): KeyBindings {
  if (changed === "preset") {
    return layout.presets.find((p) => p.id === value)?.keys ?? keys;
  }
  if (!changed.startsWith(FIELD)) return keys;
  const id = changed.slice(FIELD.length);
  const codes = String(value ?? "")
    .split(" ")
    .filter((c) => c !== "");
  return { ...keys, [id]: codes };
}

/**
 * Tastenbelegung eines Spiels: Vorlagen und eigene Tasten. Gilt mit
 * „Übernehmen“ (nicht mit fehlenden Tasten), Zurück verwirft.
 */
export async function keysPage(
  ui: GameUi,
  c: PageContext,
  game: { readonly id: string; readonly title: string; readonly keys: KeyLayout },
): Promise<void> {
  const t = c.t();
  const locale = c.locale();
  const layout = game.keys;
  let working = resolveBindings(layout, c.settings().keybindings[game.id]);
  for (;;) {
    const r = await ask(ui, c, {
      kind: "form",
      title: t("keysTitle", { title: game.title }),
      theme: game.id,
      fields: keyFields(t, locale, layout, working),
      actions: [
        { id: "apply", label: t("keysApply") },
        { id: "back", label: t("back") },
      ],
      back: "back",
      acceptKey: assignable,
      keyText: (code) => keyLabel(t, code),
      onChange: (values, changed) => {
        working = applyKeyChange(layout, working, changed, values[changed]);
        return keyFields(t, locale, layout, working);
      },
    });
    if (r.id !== "apply") return;
    if (keyIssues(layout.actions, working).missing.length > 0) continue;
    const preset = presetOf(layout, working);
    c.update({
      keybindings: {
        ...c.settings().keybindings,
        [game.id]: preset === CUSTOM_PRESET ? { preset, keys: working } : { preset },
      },
    });
    return;
  }
}
