import type { HudSprite, UiBlock, UiText } from "@clove/core";
import { type Lang, pick } from "./lang";

/**
 * Abspann `ShowCredits` (`0x5566C0`): `credits` (500 × 3000, Atlas `logo`) mit
 * allen Mitwirkenden läuft 1 px je Durchlauf (`Wait 25`, 40 px/s) durch, Esc
 * beendet. Als Text-Bildschirm der Shell wie die Credits von DOVE: die Namen
 * sind aus dem Originalbild abgeschrieben (Rollen übersetzt, Namen und Adressen
 * wie dort), Publisher-Logo und Teamfoto bleiben Ausschnitte des Bildes. Das
 * DoveZ-Logo oben im Bild zeigt die Shell als Marke im Kopf. Die Musik
 * (`Enhaced Credits.ogg`) spielt das Spiel.
 */
export const CREDITS_PX_PER_S = 40;

type Role = readonly [de: string, en: string, ru: string];

interface Section {
  readonly role: Role;
  /** Name, darunter optional die Adresse aus dem Bild. */
  readonly names: readonly (string | readonly [string, string])[];
}

/** Abschnitte in der Reihenfolge des Bildes. */
export const CREDITS: readonly Section[] = [
  {
    role: ["Projektleitung", "Project Leaders", "Руководители проекта"],
    names: ["Markus Madeja", "Boris Nonte"],
  },
  { role: ["Spieldesign", "Game Design", "Геймдизайн"], names: ["Markus Madeja"] },
  { role: ["Programmierung", "Code", "Программирование"], names: ["Markus Madeja"] },
  {
    role: ["Musik & Sound", "Music & Sound Production", "Музыка и звук"],
    names: [["Boris Nonte", "www.Toxeen.com"]],
  },
  {
    role: ["2D/3D-Grafik", "2D/3D Artists", "2D/3D-графика"],
    names: [
      "Malte Kollmann",
      ["Mateusz Gorecki", "www.velogfx.com"],
      ["Sebastian Kaulitzki", "www.temptationart.de"],
      ["Patrick Malicek", "www.theclockwork.net"],
      "Sandro Falcone",
    ],
  },
  {
    role: ["Leveldesign", "Leveldesign", "Дизайн уровней"],
    names: [
      "Markus Madeja",
      "Malte Kollmann",
      "Sebastian Kaulitzki",
      "Sandro Falcone",
      "Boris Nonte",
    ],
  },
  {
    role: [
      "Zwischensequenzen: Drehbuch & Regie",
      "Cutscenes: Scripting & Direction",
      "Ролики: сценарий и режиссура",
    ],
    names: ["Boris Nonte"],
  },
  {
    role: [
      "Zwischensequenzen: Modelle, Texturen, Compositing",
      "Cutscenes: Modelling - Texturing - Compositing",
      "Ролики: модели, текстуры, композитинг",
    ],
    names: ["Sebastian Kaulitzki", "Mateusz Gorecki", "Patrick Malicek"],
  },
  {
    role: ["Management & PR", "Management & PR", "Менеджмент и PR"],
    names: ["Markus Madeja", "Boris Nonte"],
  },
  {
    role: ["Englische Stimme", "English Voice Actor", "Английский голос"],
    names: ["James Hamer-Morton"],
  },
];

const PUBLISHER: Role = [
  "Publisher & Vertrieb",
  "Publisher & Distributor",
  "Издатель и дистрибьютор",
];

const THANKS: Section = {
  role: ["Besonderer Dank an", "Special Thanks to", "Особая благодарность"],
  names: [
    "Nullsoft Install System",
    "XviD.org",
    "Ogg-Vobis",
    "zlib",
    "Upx",
    "Gamershell",
    "Lucky",
    "Jan & Melle",
    "Andrej",
    "Sven Denda",
    "Andreas Wenger",
  ],
};

const AND_YOU: Role = ["und dir!", "and you !", "и тебе!"];

function role(lang: Lang, r: Role): string {
  return pick(lang, ...r);
}

function section(lang: Lang, s: Section, extra: readonly string[] = []): UiBlock {
  return {
    kind: "lines",
    heading: role(lang, s.role),
    lines: [...s.names.flatMap((n) => (typeof n === "string" ? [n] : [n[0], n[1]])), ...extra],
    align: "center",
  };
}

/** Ausschnitt des Credits-Bildes (Koordinaten im Bild). */
function part(sheet: HudSprite, x: number, y: number, w: number, h: number): HudSprite {
  return { ...sheet, x: sheet.x + x, y: sheet.y + y, w, h };
}

export function creditsScreen(lang: Lang, image: HudSprite | undefined): UiText {
  const blocks: UiBlock[] = CREDITS.map((s) => section(lang, s));
  blocks.push({
    kind: "lines",
    heading: role(lang, PUBLISHER),
    lines: image ? [] : ["Magnussoft"],
    align: "center",
  });
  if (image)
    blocks.push({
      kind: "image",
      image: { sprite: part(image, 30, 2070, 440, 112), alt: "Magnussoft" },
    });
  blocks.push({ kind: "lines", lines: ["www.magnussoft.de"], align: "center", tone: "dim" });
  blocks.push(section(lang, THANKS, [role(lang, AND_YOU)]));
  if (image)
    blocks.push({
      kind: "image",
      image: { sprite: part(image, 48, 2655, 404, 286), alt: "Intergenies" },
    });
  blocks.push({ kind: "lines", lines: ["www.intergenies.com"], align: "center", tone: "dim" });
  return {
    kind: "text",
    title: "Credits",
    blocks,
    scroll: { pxPerSecond: CREDITS_PX_PER_S },
    done: pick(lang, "Weiter", "Continue", "Продолжить"),
    back: "done",
  };
}
