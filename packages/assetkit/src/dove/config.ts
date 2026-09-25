/**
 * Asset-Tabelle für DOVE: welche Originaldatei in welches Bundle wandert und wie
 * sie konvertiert wird. Jede Grafik in `Data/Grafik/` muss hier einem Bundle
 * zugeordnet sein — eine neue, unbekannte Datei ist ein Buildfehler.
 */
import { parseLevelDat } from "@clove/formats";
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { Job } from "../job";
import { SOUND_CONVERTER_VERSION, convertSound } from "../stages/audio";
import { IMAGE_CONVERTER_VERSION, LIBWEBP_VERSION, convertImage } from "../stages/image";
import {
  CONTOUR_CONVERTER_VERSION,
  LEVEL_CONVERTER_VERSION,
  convertContour,
  convertLevel,
} from "../stages/level";
import { MUSIC_CONVERTER_VERSION, convertMusic } from "../stages/music";

export const DOVE_DATA = "original-dove/Data";
export const DOVE_LEVEL_COUNT = 12;

/** Eingefroren: eine Änderung schreibt jedes Bild neu (Spec R2 — Repo-Größe). */
export const WEBP_EFFORT = 6;

/** Immer geladen: HUD, Spielerschiff, Explosionen, Fonts, Easteregg, alle SFX. */
const CORE_IMAGES = ["ss", "konsole", "explosion", "text", "text2", "metroid"];

/** Vollbilder außerhalb des Spiels: Titel, Intro, Ladebild, Logos, Levelvorschauen, Endbilder. */
const SCREEN_IMAGES = [
  "titel",
  "intro",
  "intro2",
  "loading",
  "logo",
  "logo2",
  "extralevel",
  ...Array.from({ length: 11 }, (_, i) => String(i)),
  ...Array.from({ length: 5 }, (_, i) => `b${i + 1}`),
];

/**
 * Opak (kein Colorkey): Vollbilder, die nie über etwas anderem liegen —
 * Titel, Intro, Ladebild, Levelvorschauen `0–10`/`Extralevel`, Endbilder `B1–B5`
 * und die Level-Hintergründe. Bei den meisten davon ist die Wahl ohnehin
 * belanglos (0 % reines Schwarz). Alles andere wird gekeyed, wie DirectDraw
 * es beim Blitten mit Quell-Colorkey tat.
 */
const OPAQUE = /^(titel|intro2?|loading|extralevel|\d+|b\d|background\d+)$/;

export function isColorKeyed(name: string): boolean {
  return !OPAQUE.test(name);
}

const idName = (file: string) => basename(file, extname(file)).toLowerCase();

function listFiles(root: string, dir: string, ext: RegExp): string[] {
  return readdirSync(join(root, dir))
    .filter((f) => ext.test(f))
    .toSorted()
    .map((f) => `${dir}/${f}`);
}

function readSource(root: string, path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(root, path)));
}

/** Plant alle DOVE-Jobs. Liest dafür die Level (Hintergrund-Zuordnung). */
export function planDove(root: string): Job[] {
  const sprites = new Map(
    listFiles(root, `${DOVE_DATA}/Grafik`, /\.spr$/i).map((path) => [idName(path), path]),
  );
  const spritePath = (name: string): string => {
    const path = sprites.get(name);
    if (!path) throw new Error(`Grafik ${name}.spr fehlt`);
    return path;
  };

  const bundlesOf = new Map<string, string[]>();
  const addBundle = (name: string, bundle: string) => {
    spritePath(name);
    bundlesOf.set(name, [...(bundlesOf.get(name) ?? []), bundle]);
  };
  for (const name of CORE_IMAGES) addBundle(name, "core");
  for (const name of SCREEN_IMAGES) addBundle(name, "screens");

  const jobs: Job[] = [];
  for (let n = 0; n < DOVE_LEVEL_COUNT; n++) {
    const bundle = `level${n}`;
    const dat = `${DOVE_DATA}/Level${n}.dat`;
    const background = parseLevelDat(readSource(root, dat)).background.toLowerCase();
    addBundle(`feinde${n}`, bundle);
    addBundle(`landschaft${n}`, bundle);
    addBundle(background, bundle);
    // Level 1 spawnt per Skript Meteore (metroid.spr + data/metroid).
    if (n === 1) addBundle("metroid", bundle);
    jobs.push({
      bundles: [bundle],
      sources: [dat],
      options: {},
      converterVersion: LEVEL_CONVERTER_VERSION,
      outputs: [
        { id: `level/level${n}`, kind: "level", ext: "json" },
        { id: `levelData/level${n}`, kind: "levelData", ext: "bin" },
      ],
      run: async ([datBytes]) => {
        const { json, bin } = convertLevel(datBytes!);
        return [
          {
            id: `level/level${n}`,
            kind: "level",
            ext: "json",
            bytes: json,
            meta: { data: `levelData/level${n}` },
          },
          { id: `levelData/level${n}`, kind: "levelData", ext: "bin", bytes: bin, meta: {} },
        ];
      },
    });
  }

  for (const [name, path] of sprites) {
    const bundles = bundlesOf.get(name);
    if (!bundles)
      throw new Error(`Grafik ${basename(path)} ist keinem Bundle zugeordnet (dove/config.ts)`);
    const id = `image/${name}`;
    const colorKeyed = isColorKeyed(name);
    // B1–B5 sind verwürfelte Endbilder; Data/N.dat liefert die Kachel-Permutation.
    const slide = /^b([1-5])$/.exec(name)?.[1];
    const options = {
      colorKeyed,
      effort: WEBP_EFFORT,
      libwebp: LIBWEBP_VERSION,
      ...(slide ? { descramble: true } : {}),
    };
    jobs.push({
      bundles: bundles.toSorted(),
      sources: slide ? [path, `${DOVE_DATA}/${slide}.dat`] : [path],
      options,
      converterVersion: IMAGE_CONVERTER_VERSION,
      outputs: [{ id, kind: "image", ext: "webp" }],
      run: async ([bmp, permutation]) => {
        const r = await convertImage(bmp!, options, permutation);
        return [
          {
            id,
            kind: "image",
            ext: "webp",
            bytes: r.bytes,
            meta: { width: r.width, height: r.height, colorKeyed },
            ...(r.warning ? { warning: `${basename(path)}: ${r.warning}` } : {}),
          },
        ];
      },
    });
  }

  // Kontur des Meteors aus Level 1 (metroid.spr), vom Level-1-Skript gespawnt.
  const metroid = `${DOVE_DATA}/Grafik/METROID.dat`;
  jobs.push({
    bundles: ["level1"],
    sources: [metroid],
    options: {},
    converterVersion: CONTOUR_CONVERTER_VERSION,
    outputs: [{ id: "data/metroid", kind: "data", ext: "json" }],
    run: async ([dat]) => [
      { id: "data/metroid", kind: "data", ext: "json", bytes: convertContour(dat!), meta: {} },
    ],
  });

  for (const path of listFiles(root, `${DOVE_DATA}/Sound`, /\.wav$/i)) {
    const id = `sound/${idName(path)}`;
    jobs.push({
      bundles: ["core"],
      sources: [path],
      options: {},
      converterVersion: SOUND_CONVERTER_VERSION,
      outputs: [{ id, kind: "sound", ext: "wav" }],
      run: async ([wav]) => {
        const r = convertSound(wav!);
        const meta = { sampleRate: r.sampleRate, channels: r.channels, frames: r.frames };
        return [{ id, kind: "sound", ext: "wav", bytes: r.bytes, meta }];
      },
    });
  }

  for (const path of listFiles(root, `${DOVE_DATA}/Musik`, /\.(xm|it)$/i)) {
    const id = `music/${idName(path)}`;
    const ext = extname(path).slice(1).toLowerCase();
    jobs.push({
      bundles: ["music"],
      sources: [path],
      options: {},
      converterVersion: MUSIC_CONVERTER_VERSION,
      outputs: [{ id, kind: "music", ext }],
      run: async ([mod]) => {
        const r = convertMusic(mod!, ext);
        return [{ id, kind: "music", ext, bytes: r.bytes, meta: { format: r.format } }];
      },
    });
  }

  return jobs;
}
