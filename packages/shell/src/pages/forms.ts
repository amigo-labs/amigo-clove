import type { GameUi, UiField, UiValues } from "@clove/core";
import { HUD_MODES, MOTION_PREFERENCES, SCALE_MODES, type Settings } from "../settings";
import type { TextKey } from "../texts";
import { ask, onOff, type PageContext } from "./context";

/**
 * Formularseiten der Einstellungen: Ton, Darstellung, Steuerung. Jede Änderung
 * gilt sofort (wie in den Optionen der Spiele); Zurück schließt.
 */

const CHANNELS = ["master", "music", "sfx", "voice"] as const;
const CHANNEL_TEXT: Readonly<Record<(typeof CHANNELS)[number], TextKey>> = {
  master: "volumeMaster",
  music: "volumeMusic",
  sfx: "volumeSfx",
  voice: "volumeVoice",
};

function percent(v: number): string {
  return `${Math.round(v * 100)} %`;
}

export async function audioPage(ui: GameUi, c: PageContext): Promise<void> {
  const t = c.t();
  const fields = (): UiField[] =>
    CHANNELS.map((ch) => {
      const v = c.settings().volume[ch];
      return {
        kind: "range",
        id: ch,
        label: t(CHANNEL_TEXT[ch]),
        min: 0,
        max: 100,
        step: 5,
        value: Math.round(v * 100),
        text: percent(v),
      };
    });
  await ask(ui, c, {
    kind: "form",
    title: t("volume"),
    fields: fields(),
    actions: [{ id: "back", label: t("back") }],
    back: "back",
    onChange: (values, changed) => {
      const ch = CHANNELS.find((x) => x === changed);
      if (ch) c.update({ volume: { ...c.settings().volume, [ch]: Number(values[ch]) / 100 } });
      return fields();
    },
  });
}

function choice<T extends string>(
  values: UiValues,
  id: string,
  options: readonly T[],
): T | undefined {
  return options.find((o) => o === values[id]);
}

export async function displayPage(ui: GameUi, c: PageContext): Promise<void> {
  const t = c.t();
  const s = c.settings();
  const fields: UiField[] = [
    {
      kind: "choice",
      id: "hud",
      label: t("hud"),
      options: [
        { value: "modern", label: t("hudModern") },
        { value: "original", label: t("hudOriginal") },
      ],
      value: s.hud,
      hint: t("hudHelp"),
    },
    {
      kind: "choice",
      id: "scale",
      label: t("scale"),
      options: [
        { value: "fit", label: t("scaleFit") },
        { value: "smooth", label: t("scaleSmooth") },
        { value: "integer", label: t("scaleInteger") },
      ],
      value: s.scale,
      hint: t("scaleHelp"),
    },
    {
      kind: "choice",
      id: "scanlines",
      label: t("scanlines"),
      options: onOff(t),
      value: s.scanlines ? "on" : "off",
    },
    {
      kind: "choice",
      id: "motion",
      label: t("motion"),
      options: [
        { value: "auto", label: t("motionAuto") },
        { value: "reduce", label: t("motionReduce") },
        { value: "full", label: t("motionFull") },
      ],
      value: s.motion,
      hint: t("motionHelp"),
    },
  ];
  await ask(ui, c, {
    kind: "form",
    title: t("display"),
    fields,
    actions: [{ id: "back", label: t("back") }],
    back: "back",
    onChange: (v, changed) => {
      const patch: Partial<Settings> = {};
      if (changed === "hud") {
        const hud = choice(v, "hud", HUD_MODES);
        if (hud) Object.assign(patch, { hud });
      } else if (changed === "scale") {
        const scale = choice(v, "scale", SCALE_MODES);
        if (scale) Object.assign(patch, { scale });
      } else if (changed === "motion") {
        const motion = choice(v, "motion", MOTION_PREFERENCES);
        if (motion) Object.assign(patch, { motion });
      } else if (changed === "scanlines")
        Object.assign(patch, { scanlines: v["scanlines"] === "on" });
      c.update(patch);
    },
  });
}

/** Erkannte Pads als Text. */
function padStatus(c: PageContext): string {
  const t = c.t();
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((p) => p !== null);
  return pads.length
    ? pads.map((p) => t("gamepadConnected", { name: p.id })).join(" · ")
    : t("gamepadNone");
}

/** Maus/Touch und Gamepad; die Tastenbelegung hat eigene Seiten je Spiel. */
export async function controlsPage(ui: GameUi, c: PageContext): Promise<void> {
  const t = c.t();
  const fields = (): UiField[] => {
    const s = c.settings();
    return [
      {
        kind: "choice",
        id: "pointer",
        label: t("pointerUse"),
        options: onOff(t),
        value: s.pointer ? "on" : "off",
        hint: t("pointerHelp"),
      },
      {
        kind: "choice",
        id: "gamepad",
        group: t("gamepad"),
        label: t("gamepadUse"),
        options: onOff(t),
        value: s.gamepad ? "on" : "off",
      },
      { kind: "info", id: "pads", text: padStatus(c) },
      { kind: "info", id: "padHelp", text: t("gamepadHelp"), tone: "dim" },
    ];
  };
  await ask(ui, c, {
    kind: "form",
    title: t("controls"),
    fields: fields(),
    actions: [{ id: "back", label: t("back") }],
    back: "back",
    onChange: (v, changed) => {
      if (changed === "pointer") c.update({ pointer: v["pointer"] === "on" });
      if (changed === "gamepad") c.update({ gamepad: v["gamepad"] === "on" });
      return fields();
    },
  });
}
