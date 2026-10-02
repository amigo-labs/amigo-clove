import {
  PAUSE_TEXTS,
  highscoreTable,
  settingsItems,
  type HudSprite,
  type UiConfirm,
  type UiField,
  type UiForm,
  type UiImage,
  type UiInput,
  type UiMenu,
  type UiNotice,
  type UiText,
  type UiValues,
} from "@clove/core";
import { DOVE_CONTROLS } from "../controls";
import { type HighscoreEntry, NAME_MAX, rankSuffix } from "./highscore";
import {
  type Config,
  LEVEL_SELECT_NAMES,
  formatFactor,
  levelName,
  pointFactor,
  previewImage,
  selectableLevels,
  showsUnlockHint,
} from "./rules";
import {
  HIGHSCORE_TEXT,
  INFO_LINES,
  OPTIONS_TEXT,
  continueRankText,
  creditSections,
  farewellLines,
} from "./texts";

/**
 * Die Bildschirme außerhalb der Level als HTML-Daten für die Shell (`GameHost.ui`).
 * Texte wie im Original: Menüpunkte, „Continue Game?“ und „Yes, ya!“/„No!“ stehen dort
 * als Grafik in `titel.spr` (englisch in beiden Sprachen), alles andere kommt aus der
 * Stringtabelle (`texts.ts`). Reine Daten ohne Pixi.
 */

type Rect = readonly [number, number, number, number];
/** Ausschnitt eines Original-Bildes (`spriteSheet` aus `hud.ts`). */
export type SpriteOf = (id: string, r: Rect) => HudSprite;

/** Menüpunkte in Tabellenreihenfolge (`0x4AF742`). */
export const MenuItem = {
  Play: 0,
  Extra: 1,
  Tutorial: 2,
  Info: 3,
  Options: 4,
  Quit: 5,
} as const;
export type MenuItem = (typeof MenuItem)[keyof typeof MenuItem];

/** Beschriftung der Menüpunkte aus `titel.spr` (450, 0)–(640, 250). */
const MENU_LABELS = ["Let's go !", "Extralevel", "Tutorial", "Info", "Options", "Quit"] as const;

/** Credits-Zeilen unten im Titelbild (`titel.spr` (0, 244)–(480, 320)). */
const TITLE_CREDITS = [
  "Code: Markus 'Kauto' Madeja",
  "Grafik: MaKo, HiBri, Manuel, Hürgy, Harald CL, xenion, Kauto",
  "Musik: Toxeen, Xpire , Jori, Quasian, Kauto",
  "Translation: Monty P, Mocs, Kauto",
];

/** Erstes Bild des rotierenden DOVE-Logos (`logo.spr`, 235×100); auch die Marke im Kopf. */
export function logo(sprite: SpriteOf): UiImage {
  return { sprite: sprite("image/logo", [0, 0, 235, 100]), alt: "DOVE" };
}

/** Vorschaubild eines Levels (`data\grafik\<L>.spr`, 320×240). */
function preview(sprite: SpriteOf, level: number): UiImage {
  return { sprite: sprite(previewImage(level), [0, 0, 320, 240]), alt: levelName(level) };
}

function back(german: boolean): string {
  return german ? "Zurück" : "Back";
}

/** Titel (`0x4AA9E1`): Logo, sechs Menüpunkte, Highscores und Credits daneben. ESC → `escape`. */
export function titleMenu(
  sprite: SpriteOf,
  highscores: readonly HighscoreEntry[],
  selected: MenuItem,
): UiMenu {
  return {
    kind: "menu",
    logo: logo(sprite),
    items: MENU_LABELS.map((label, i) => ({ id: String(i), label })),
    selected: String(selected),
    back: "escape",
    aside: [
      highscoreTable(highscores, { caption: HIGHSCORE_TEXT.title }),
      { kind: "lines", lines: TITLE_CREDITS, tone: "dim" },
    ],
  };
}

/** Felder der Optionen mit Punktefaktor und Freischalt-Hinweis. */
function optionFields(config: Config, german: boolean): UiField[] {
  const t = OPTIONS_TEXT[german ? "de" : "en"];
  const f = pointFactor(config);
  const fields: UiField[] = [
    {
      kind: "choice",
      id: "enemyShots",
      label: t.shots.replace(/\s*:\s*$/, ""),
      value: String(config.enemyShots),
      options: t.shotValues.map((label, v) => ({ value: String(v), label })),
    },
    {
      kind: "choice",
      id: "wallsKill",
      label: t.walls.replace(/\s*:\s*$/, ""),
      value: config.wallsKill ? "1" : "0",
      options: t.wallValues.map((label, v) => ({ value: String(v), label })),
    },
    {
      kind: "choice",
      id: "weaponLoss",
      label: t.weapons.replace(/\s*:\s*$/, ""),
      value: config.weaponLoss ? "1" : "0",
      options: t.weaponValues.map((label, v) => ({ value: String(v), label })),
    },
    { kind: "info", id: "factor", text: `${t.factor}${formatFactor(f, german)}` },
  ];
  if (showsUnlockHint(f)) fields.push({ kind: "info", id: "hint", text: t.unlockHint });
  return fields;
}

/** Werte des Formulars → Konfiguration (Freischaltungen bleiben). */
export function configFrom(config: Config, v: UiValues): Config {
  return {
    ...config,
    enemyShots: Math.min(2, Math.max(0, Number(v["enemyShots"]))) as 0 | 1 | 2,
    wallsKill: v["wallsKill"] === "1",
    weaponLoss: v["weaponLoss"] === "1",
  };
}

/** Titel der Spielregeln (die Optionen des Originals). */
export function rulesTitle(german: boolean): string {
  return german ? "Spielregeln" : "Game rules";
}

/**
 * Optionen, im Aufbau wie die von DoveZ: die Spielregeln des Originals und die
 * gemeinsamen Seiten der Shell (`shared`, sofern sie sie anbietet).
 */
export function optionsMenu(german: boolean, shared: boolean): UiMenu {
  const lang = german ? "de" : "en";
  return {
    kind: "menu",
    title: german ? "Optionen" : "Options",
    items: [
      { id: "rules", label: rulesTitle(german) },
      ...(shared ? settingsItems(lang) : []),
      { id: "back", label: back(german) },
    ],
    back: "back",
  };
}

/** Spielregeln (`Schwierigkeitsgrad` `0x457E80`): drei Schalter, Speichern, Zurück. */
export function optionsForm(config: Config, german: boolean, saved = false): UiForm {
  const t = OPTIONS_TEXT[german ? "de" : "en"];
  return {
    kind: "form",
    title: rulesTitle(german),
    fields: optionFields(config, german),
    ...(saved ? { blocks: [{ kind: "lines", lines: [t.saved], tone: "accent" }] } : {}),
    actions: [
      { id: "save", label: t.save },
      { id: "back", label: t.back },
    ],
    back: "back",
    onChange: (values) => optionFields(configFrom(config, values), german),
  };
}

/** Levelauswahl (`ShowLevelSelect` `0x45B220`): freigeschaltete Level mit Vorschau. */
export function levelSelectMenu(sprite: SpriteOf, config: Config, german: boolean): UiMenu {
  return {
    kind: "menu",
    title: german ? "Levelauswahl" : "Select level",
    items: selectableLevels(config).map((l) => ({
      id: String(l),
      label: LEVEL_SELECT_NAMES[l] ?? levelName(l),
      image: preview(sprite, l),
    })),
    back: "back",
  };
}

/** Info (`info` `0x490430`): Credits-Kopf und Readme, mit ↑/↓ scrollbar. */
export function infoText(readme: readonly string[], german: boolean): UiText {
  return {
    kind: "text",
    title: "Info",
    blocks: [{ kind: "lines", lines: [...INFO_LINES, ...readme], mono: true }],
    scroll: "manual",
    done: back(german),
    back: "done",
  };
}

/** Get Ready (`Get_Ready` `0x45D934`): Level, Punkte, Schiffe, Vorschau. ESC bricht ab. */
export function getReadyNotice(
  sprite: SpriteOf,
  level: number,
  score: number,
  lives: number,
  german: boolean,
): UiNotice {
  return {
    kind: "notice",
    title: "Get Ready!",
    image: preview(sprite, level),
    lines: [`Level ${level} - ${levelName(level)}`, `Points: ${score}   Ships: ${lives}`],
    prompt: german ? "Bestätigen startet, ESC bricht ab" : "Confirm to start, ESC to quit",
    until: "key",
    back: "back",
  };
}

/** Continue (`0x4A0050`): GAMEOVER, Punkte, Rang-Hinweis, „Yes, ya!“/„No!“; über dem Level wie in DoveZ. */
export function continueConfirm(
  sprite: SpriteOf,
  score: number,
  rank: number,
  german: boolean,
): UiConfirm {
  return {
    kind: "confirm",
    title: "Continue Game?",
    over: "level",
    image: { sprite: sprite("image/titel", [220, 323, 420, 94]), alt: "GAMEOVER" },
    lines: [`Score:${score}`, ...(rank > 0 ? [continueRankText(german, rank)] : [])],
    items: [
      { id: "yes", label: "Yes, ya!" },
      { id: "no", label: "No!" },
    ],
    selected: "yes",
  };
}

/** Highscore-Eingabe (`HighScore` `0x40FE48`): Platz und Name (max. 20 Zeichen). */
export function highscoreInput(rank: number, german: boolean): UiInput {
  return {
    kind: "input",
    title: `${HIGHSCORE_TEXT.youPlaced} ${rank}${rankSuffix(rank)}`,
    fields: [{ id: "name", label: HIGHSCORE_TEXT.enterName, max: NAME_MAX }],
    ok: german ? "Eintragen" : "Enter",
  };
}

/**
 * Pause im Spiel, im Aufbau wie in DoveZ: Titel, darunter das Level, Weiter /
 * Spiel beenden über dem eingefrorenen Level, dazu die Tastenübersicht.
 */
export function pauseMenu(german: boolean, level?: number): UiMenu {
  const lang = german ? "de" : "en";
  return {
    kind: "menu",
    title: PAUSE_TEXTS.title[lang],
    ...(level !== undefined ? { subtitle: `Level ${level} - ${levelName(level)}` } : {}),
    over: "level",
    items: [
      { id: "resume", label: PAUSE_TEXTS.resume[lang] },
      { id: "abort", label: PAUSE_TEXTS.quit[lang] },
    ],
    back: "resume",
    aside: [{ kind: "controls", sheet: DOVE_CONTROLS }],
  };
}

/**
 * Credits nach dem Abspann (`For i = 1 To 27`): alle Beteiligten, je Rolle ein
 * Abschnitt wie in DoveZ; laufen von selbst durch.
 */
export function creditsText(german: boolean): UiText {
  return {
    kind: "text",
    title: "Credits",
    blocks: creditSections(german).map((s) => ({
      kind: "lines",
      heading: s.role,
      lines: s.names,
      align: "center",
    })),
    scroll: { pxPerSecond: 24 },
    done: "OK",
    back: "done",
  };
}

/**
 * NEO-ARTS-Logo (`ShowNEOARTS` `0x4A7880`): `titel.spr` (0, 0)–(224, 241), nach
 * 500 ms läuft „presents“ mit wachsendem Zeichenabstand auf, dann 1000 ms
 * Standbild (115 Ticks à 14 ms); Bestätigen oder Esc überspringt.
 */
export function neoArtsNotice(sprite: SpriteOf): UiNotice {
  return {
    kind: "notice",
    chrome: "none",
    image: { sprite: sprite("image/titel", [0, 0, 224, 241]), alt: "NEO-ARTS" },
    blocks: [{ kind: "lines", lines: ["presents"], align: "center", effect: "spread" }],
    until: { ms: 115 * 14 },
    back: "skip",
  };
}

/** Abschiedsbild (`0x4AD5B0`): Texte und „www.Kauto.de“; endet mit einer Taste oder nach 5 s. */
export function farewellNotice(german: boolean): UiNotice {
  const lines = farewellLines(german).map(([s]) => s);
  return {
    kind: "notice",
    lines: [...lines.slice(0, 2), "www.Kauto.de", ...lines.slice(2)],
    until: { ms: 5000 },
  };
}
