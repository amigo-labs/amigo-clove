/**
 * Asset-Tabelle für DoveZ: welches Paket in welches Bundle wandert und wie es
 * konvertiert wird. Jede Datei in jedem Paket muss hier einen Weg finden —
 * eine unbekannte Endung oder ein unbekanntes Paket ist ein Buildfehler.
 *
 * Ein Job je Paket: Bilder eines Pakets werden zu einem Atlas gepackt, `.r`
 * zu einem Kontur-Sidecar, WAVs zu Ogg Opus. Musik bleibt unverändert, Videos
 * werden zu WebM (vom Hash-Gate ausgenommen, `volatile`).
 */
import {
  containerRecords,
  decodeCp1252,
  decodeWav,
  dovezSlug,
  dovezSpriteKey,
  maskName,
  parsePlayScript,
  parseRadioText,
  readContainer,
  type ContainerEntry,
  type MaskOffset,
} from "@clove/formats";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { constants, inflateSync } from "node:zlib";
import type { Job, JobOutput, OutputSpec } from "../job";
import {
  ATLAS_CONVERTER_VERSION,
  ATLAS_PADDING,
  ATLAS_PAGE_SIZE,
  atlasJson,
  buildAtlas,
  buildContours,
  planAtlas,
} from "../stages/atlas";
import { encodeOpus, encodeVideo } from "../stages/ffmpeg";
import { LIBWEBP_VERSION } from "../stages/image";

export const DOVEZ_DATA = "original-dovez/Data";

/** Eingefroren wie bei DOVE: eine Änderung schreibt jede Atlasseite neu. */
export const DOVEZ_WEBP_EFFORT = 6;

/**
 * Spec: Sprache 48 kbit/s mono, Effekte 64 kbit/s. Opus und VP9 sind nicht
 * plattformübergreifend bitgenau (libopus/libvpx wählen SIMD-Pfade zur
 * Laufzeit; CI kodierte alle 243 Opus-Dateien mit anderen Bytes) — beide Jobs
 * sind `volatile`, und die ffmpeg-Version gehört nicht zum Cache-Schlüssel.
 */
const VOICE_OPUS = { bitrate: 48, mono: true };
const SFX_OPUS = { bitrate: 64, mono: false };
/** VP9 CRF 34: SkyFight.avi 6,8 → 1,2 MB bei 800×600. */
const VIDEO = { crf: 34, audioBitrate: 64 };

export const SOUND_OPUS_CONVERTER_VERSION = 1;
export const VIDEO_CONVERTER_VERSION = 1;
export const MUSIC_OGG_CONVERTER_VERSION = 1;
export const DATA_CONVERTER_VERSION = 1;

/** Globale Grafikpakete → Bundle. */
const D2P_ATLAS_BUNDLES: Readonly<Record<string, string>> = {
  spiel: "core",
  standart: "core",
  pause: "core",
  menu: "menu",
  logo: "menu",
  loading: "loading",
};

/**
 * Masken mit abweichenden Maßen (Spec: Pflicht-Override statt stillem
 * Skalieren). `atlantis_saule2`: Bild 190×520, Maske 200×540. Ausschnitt oben
 * links, wie ein pixelweises Lesen im Original ihn ergäbe (*geschätzt*; der
 * am besten deckende Versatz wäre (6, 0) mit 91,7 % statt 88,3 %).
 */
const MASK_OFFSETS: Readonly<Record<string, MaskOffset>> = {
  "level5-1_atlantis/atlantis_saule2": { x: 0, y: 0 },
};

const usedMaskOffsets = new Set<string>();

const inflate = (b: Uint8Array) => new Uint8Array(inflateSync(b));

/** Maße aus dem BMP-Kopf, ohne das Bild ganz zu entpacken. */
function bmpSize(compressed: Uint8Array): { width: number; height: number } {
  const head = inflateSync(compressed.subarray(0, Math.min(compressed.length, 512)), {
    finishFlush: constants.Z_SYNC_FLUSH,
  });
  if (head.length < 26 || head[0] !== 0x42 || head[1] !== 0x4d) throw new Error("kein BMP-Kopf");
  return { width: head.readInt32LE(18), height: Math.abs(head.readInt32LE(22)) };
}

interface Listing {
  readonly name: string;
  readonly compressed: Uint8Array;
}

/** Namen und Datenblöcke eines Pakets (nur die Namen werden entpackt). */
function listContainer(bytes: Uint8Array): Listing[] {
  const records = containerRecords(bytes);
  const out: Listing[] = [];
  for (let i = 0; i < records.length; i += 2) {
    out.push({
      name: decodeCp1252(inflate(records[i]!.compressed)),
      compressed: records[i + 1]!.compressed,
    });
  }
  return out;
}

const ext = (name: string) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`);

/**
 * Atlas-Job eines Pakets mit Grafik: Atlas-JSON, Seiten, Konturen und — bei
 * Levels — Level-Skript (roh, M7 dekodiert es) und Funktexte (D/E).
 */
function atlasJob(path: string, slug: string, bundle: string, listing: readonly Listing[]): Job {
  const lower = new Set(listing.map((l) => l.name.toLowerCase()));
  const masks = new Set(
    listing
      .map((l) => l.name.toLowerCase())
      .filter((n) => n.endsWith(".bmp") && lower.has(maskName(n)))
      .map(maskName),
  );
  const sprites = listing.filter((l) => ext(l.name) === "bmp" && !masks.has(l.name.toLowerCase()));
  for (const key of Object.keys(MASK_OFFSETS).filter((k) => k.startsWith(`${slug}/`))) {
    const sprite = key.slice(slug.length + 1);
    if (!sprites.some((l) => dovezSpriteKey(l.name) === sprite && lower.has(maskName(l.name)))) {
      throw new Error(`MASK_OFFSETS: ${key} hat kein Sprite mit Maske`);
    }
    usedMaskOffsets.add(key);
  }
  const layout = planAtlas(
    sprites.map((l) => ({ name: dovezSpriteKey(l.name), ...bmpSize(l.compressed) })),
  );
  const contourFiles = listing.filter((l) => ext(l.name) === "r");
  const dats = listing.filter((l) => ext(l.name) === "dat");
  const texts = listing.filter((l) => ext(l.name) === "txt");
  for (const l of listing) {
    if (!["bmp", "r", "dat", "txt"].includes(ext(l.name))) {
      throw new Error(`${path}: ${l.name} ist keinem Asset zugeordnet (dovez/config.ts)`);
    }
  }
  if (dats.length > 1) throw new Error(`${path}: mehr als ein Level-Skript`);
  const textDe = texts.find((t) => /D\.txt$/i.test(t.name));
  const textEn = texts.find((t) => /E\.txt$/i.test(t.name));
  for (const t of texts) {
    if (t !== textDe && t !== textEn && !/R\.txt$/i.test(t.name)) {
      throw new Error(`${path}: Funktext ${t.name} ohne Sprachkennung D/E/R`);
    }
  }
  if (texts.length > 0 && (!textDe || !textEn))
    throw new Error(`${path}: Funktexte D/E unvollständig`);

  const atlasId = `atlas/${slug}`;
  const pageIds = layout.pages.map((_, i) => `image/${slug}/${i}`);
  const contourId = `contours/${slug}`;
  const datId = `leveldat/${slug}`;
  const radioId = `radio/${slug}`;
  const outputs: OutputSpec[] = [
    { id: atlasId, kind: "atlas", ext: "json" },
    ...pageIds.map((id) => ({ id, kind: "image" as const, ext: "webp" })),
    ...(contourFiles.length ? [{ id: contourId, kind: "binary" as const, ext: "bin" }] : []),
    ...(dats.length ? [{ id: datId, kind: "binary" as const, ext: "dat" }] : []),
    ...(textDe ? [{ id: radioId, kind: "data" as const, ext: "json" }] : []),
  ];
  const options = {
    effort: DOVEZ_WEBP_EFFORT,
    libwebp: LIBWEBP_VERSION,
    pageSize: ATLAS_PAGE_SIZE,
    padding: ATLAS_PADDING,
    maskOffsets: Object.fromEntries(
      Object.entries(MASK_OFFSETS).filter(([k]) => k.startsWith(`${slug}/`)),
    ),
  };
  return {
    bundles: [bundle],
    sources: [path],
    options,
    converterVersion: ATLAS_CONVERTER_VERSION,
    outputs,
    run: async ([bytes]) => {
      const entries = readContainer(bytes!, inflate);
      const byName = new Map(entries.map((e) => [e.name.toLowerCase(), e]));
      const atlas = await buildAtlas(
        entries
          .filter((e) => ext(e.name) === "bmp" && !masks.has(e.name.toLowerCase()))
          .map((e) => {
            const key = dovezSpriteKey(e.name);
            const mask = byName.get(maskName(e.name));
            const offset = MASK_OFFSETS[`${slug}/${key}`];
            return {
              name: key,
              bmp: e.data,
              ...(mask ? { mask: mask.data } : {}),
              ...(offset ? { maskOffset: offset } : {}),
            };
          }),
        layout,
        options,
      );
      const contours = buildContours(
        entries
          .filter((e) => ext(e.name) === "r")
          .map((e) => ({ name: dovezSpriteKey(e.name), bytes: e.data })),
      );
      const out: JobOutput[] = [
        {
          id: atlasId,
          kind: "atlas",
          ext: "json",
          bytes: atlasJson(pageIds, atlas.sprites, contours.index),
          meta: { pages: pageIds, ...(contourFiles.length ? { contours: contourId } : {}) },
          ...(atlas.warnings.length ? { warning: `${path}: ${atlas.warnings.join("; ")}` } : {}),
        },
        ...atlas.pages.map((page, i) => ({
          id: pageIds[i]!,
          kind: "image" as const,
          ext: "webp",
          bytes: page,
          meta: {
            width: layout.pages[i]!.width,
            height: layout.pages[i]!.height,
            colorKeyed: true,
          },
        })),
      ];
      if (contourFiles.length) {
        out.push({ id: contourId, kind: "binary", ext: "bin", bytes: contours.bytes, meta: {} });
      }
      const dat = entries.find((e) => ext(e.name) === "dat");
      if (dat) out.push({ id: datId, kind: "binary", ext: "dat", bytes: dat.data, meta: {} });
      if (textDe && textEn) {
        const text = (name: string) =>
          parseRadioText(decodeCp1252((byName.get(name.toLowerCase()) as ContainerEntry).data));
        out.push({
          id: radioId,
          kind: "data",
          ext: "json",
          bytes: json({ de: text(textDe.name), en: text(textEn.name) }),
          meta: {},
        });
      }
      return out;
    },
  };
}

/** WAVs eines Pakets → Ogg Opus, eine Ausgabe je Datei. */
function soundJob(
  path: string,
  prefix: string,
  bundle: string,
  listing: readonly Listing[],
  opus: typeof VOICE_OPUS,
): Job {
  for (const l of listing) {
    if (ext(l.name) !== "wav") throw new Error(`${path}: ${l.name} ist keine WAV`);
  }
  const id = (name: string) => `${prefix}/${dovezSlug(name)}`;
  return {
    bundles: [bundle],
    sources: [path],
    options: opus,
    converterVersion: SOUND_OPUS_CONVERTER_VERSION,
    volatile: true,
    outputs: listing.map((l) => ({ id: id(l.name), kind: "sound" as const, ext: "ogg" })),
    run: async ([bytes]) =>
      Promise.all(
        readContainer(bytes!, inflate).map(async (e) => {
          const pcm = decodeWav(e.data);
          return {
            id: id(e.name),
            kind: "sound" as const,
            ext: "ogg",
            bytes: await encodeOpus(e.data, opus),
            meta: {
              format: "opus",
              sampleRate: pcm.sampleRate,
              channels: opus.mono ? 1 : pcm.channels,
              frames: pcm.samples.length / pcm.channels,
            },
          };
        }),
      ),
  };
}

function videoJob(path: string, outputs: readonly { name: string; id: string }[]): Job {
  return {
    bundles: [],
    sources: [path],
    options: VIDEO,
    converterVersion: VIDEO_CONVERTER_VERSION,
    volatile: true,
    outputs: outputs.map((o) => ({
      id: o.id,
      kind: "video" as const,
      ext: "webm",
      bundles: [o.id],
    })),
    run: async ([bytes]) => {
      const sources: { name: string; data: Uint8Array }[] = path.endsWith(".d2p")
        ? readContainer(bytes!, inflate)
        : [{ name: outputs[0]!.name, data: bytes! }];
      const out: JobOutput[] = [];
      // nacheinander: VP9 nutzt selbst mehrere Kerne
      for (const o of outputs) {
        const src = sources.find((s) => s.name === o.name);
        if (!src) throw new Error(`${path}: ${o.name} fehlt`);
        const r = await encodeVideo(src.data, VIDEO);
        out.push({
          id: o.id,
          kind: "video",
          ext: "webm",
          bytes: r.bytes,
          meta: { width: r.width, height: r.height, duration: r.duration },
        });
      }
      return out;
    },
  };
}

function listFiles(root: string, dir: string, pattern: RegExp): string[] {
  return readdirSync(join(root, dir))
    .filter((f) => pattern.test(f))
    .toSorted()
    .map((f) => `${dir}/${f}`);
}

/** Plant alle DoveZ-Jobs. Liest dafür jedes Paket (Namen und BMP-Köpfe). */
export function planDoveZ(root: string): Job[] {
  const heavy: Job[] = [];
  const jobs: Job[] = [];
  const containers = listFiles(root, DOVEZ_DATA, /\.(dlp|dfp|d2p)$/i).toSorted(
    (a, b) => statSync(join(root, b)).size - statSync(join(root, a)).size,
  );
  for (const path of containers) {
    const file = path.slice(DOVEZ_DATA.length + 1);
    const slug = dovezSlug(file);
    const listing = listContainer(new Uint8Array(readFileSync(join(root, path))));
    const kind = ext(file);
    if (kind === "dlp") {
      jobs.push(atlasJob(path, slug, `level/${slug}`, listing));
    } else if (kind === "dfp") {
      jobs.push(soundJob(path, `voice/${slug}`, `voice/${slug}`, listing, VOICE_OPUS));
    } else if (slug === "sound") {
      jobs.push(soundJob(path, "sound", "core", listing, SFX_OPUS));
    } else if (slug === "video") {
      heavy.push(
        videoJob(
          path,
          listing.map((l) => ({ name: l.name, id: `video/${dovezSlug(l.name)}` })),
        ),
      );
    } else if (slug === "play") {
      if (listing.length !== 1 || listing[0]!.name !== "Play.txt")
        throw new Error(`${path}: nur Play.txt erwartet`);
      jobs.push({
        bundles: ["core"],
        sources: [path],
        options: {},
        converterVersion: DATA_CONVERTER_VERSION,
        outputs: [{ id: "data/play", kind: "data", ext: "json" }],
        run: async ([bytes]) => [
          {
            id: "data/play",
            kind: "data",
            ext: "json",
            bytes: json(parsePlayScript(decodeCp1252(readContainer(bytes!, inflate)[0]!.data))),
            meta: {},
          },
        ],
      });
    } else {
      const bundle = D2P_ATLAS_BUNDLES[slug];
      if (!bundle) throw new Error(`Paket ${file} ist keinem Bundle zugeordnet (dovez/config.ts)`);
      jobs.push(atlasJob(path, slug, bundle, listing));
    }
  }

  for (const path of listFiles(root, `${DOVEZ_DATA}/Video`, /\.avi$/i)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    heavy.push(videoJob(path, [{ name, id: `video/${dovezSlug(name)}` }]));
  }

  for (const path of listFiles(root, `${DOVEZ_DATA}/Sound`, /\.ogg$/i)) {
    const id = `music/${dovezSlug(path.slice(path.lastIndexOf("/") + 1))}`;
    jobs.push({
      bundles: ["music"],
      sources: [path],
      options: {},
      converterVersion: MUSIC_OGG_CONVERTER_VERSION,
      outputs: [{ id, kind: "music", ext: "ogg" }],
      run: async ([bytes]) => [
        { id, kind: "music", ext: "ogg", bytes: bytes!, meta: { format: "ogg" } },
      ],
    });
  }
  const unused = Object.keys(MASK_OFFSETS).filter((k) => !usedMaskOffsets.has(k));
  if (unused.length > 0) throw new Error(`MASK_OFFSETS ohne Paket: ${unused.join(", ")}`);
  return [...heavy, ...jobs];
}
