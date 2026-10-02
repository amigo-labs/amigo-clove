import type { AtlasJson, AtlasSprite } from "@clove/core";
import {
  R_EMPTY,
  applyAlphaMask,
  applyColorKey,
  decodeBmp,
  paletteKeyReport,
  parseContourR,
  type BmpImage,
  type MaskOffset,
} from "@clove/formats";
import sharp from "sharp";
import { packRects, type PackResult } from "../atlas/maxrects";
import { jsonBytes } from "../files";

/** Bei jeder Änderung an Packen, Überblendung oder Sidecar erhöhen. */
export const ATLAS_CONVERTER_VERSION = 1;

/** Seitengröße: WebGL2 garantiert mindestens 2048. Größere Sprites bekommen eine eigene Seite. */
export const ATLAS_PAGE_SIZE = 2048;
export const ATLAS_PADDING = 1;

export interface AtlasSpriteSource {
  /** Schlüssel im Atlas: Dateiname klein, ohne `.bmp`. */
  readonly name: string;
  readonly bmp: Uint8Array;
  readonly mask?: Uint8Array;
  readonly maskOffset?: MaskOffset;
}

export interface AtlasOptions {
  readonly effort: number;
  readonly libwebp: string;
}

/** Packt nach Name sortiert (Spec: stabil gegenüber Flächensortierung, gemessen gleich dicht). */
export function planAtlas(
  sizes: readonly { name: string; width: number; height: number }[],
): PackResult {
  const sorted = sizes.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return packRects(sorted, ATLAS_PAGE_SIZE, ATLAS_PADDING);
}

export interface AtlasResult {
  readonly pages: readonly Uint8Array[];
  readonly sprites: Record<string, AtlasSprite>;
  readonly warnings: readonly string[];
}

/**
 * Setzt die Seiten zusammen und kodiert sie als WebP lossless. Das Layout kommt
 * aus der Planung (`planAtlas` über die BMP-Köpfe); stimmen die dekodierten
 * Maße nicht, ist das ein Fehler, kein stilles Umpacken.
 */
export async function buildAtlas(
  sources: readonly AtlasSpriteSource[],
  layout: PackResult,
  options: AtlasOptions,
): Promise<AtlasResult> {
  const byName = new Map(sources.map((s) => [s.name, s]));
  const pages = layout.pages.map((p) => new Uint8Array(p.width * p.height * 4));
  const sprites: Record<string, AtlasSprite> = {};
  const warnings: string[] = [];
  for (const place of layout.placements) {
    const src = byName.get(place.name);
    if (!src) throw new Error(`Atlas: ${place.name} fehlt in den Quellen`);
    const image: BmpImage = decodeBmp(src.bmp);
    if (image.width !== place.width || image.height !== place.height) {
      throw new Error(
        `Atlas: ${place.name} ist ${image.width}×${image.height}, geplant ${place.width}×${place.height}`,
      );
    }
    let rgba: Uint8Array;
    if (src.mask) {
      rgba = applyAlphaMask(image, decodeBmp(src.mask), src.maskOffset);
    } else {
      rgba = applyColorKey(image);
      const report = paletteKeyReport(image);
      if (report?.ambiguous)
        warnings.push(`${place.name}: Index- und RGB-Keying fallen auseinander — RGB verwendet`);
    }
    const page = pages[place.page] as Uint8Array;
    const pageWidth = layout.pages[place.page]!.width;
    for (let y = 0; y < image.height; y++) {
      page.set(
        rgba.subarray(y * image.width * 4, (y + 1) * image.width * 4),
        ((place.y + y) * pageWidth + place.x) * 4,
      );
    }
    sprites[place.name] = {
      page: place.page,
      x: place.x,
      y: place.y,
      w: place.width,
      h: place.height,
      blend: src.mask ? "alpha" : "key",
    };
  }
  const encoded = await Promise.all(
    pages.map(async (rgba, i) => {
      const { width, height } = layout.pages[i]!;
      return new Uint8Array(
        await sharp(rgba, { raw: { width, height, channels: 4 } })
          .webp({ lossless: true, exact: true, effort: options.effort })
          .toBuffer(),
      );
    }),
  );
  return { pages: encoded, sprites, warnings };
}

/**
 * Kontur-Sidecar: alle `.r` eines Pakets hintereinander als Int16 (LE),
 * je Kontur `width, height, top, bottom` und `height` Paare `left, right`.
 * Liefert die Bytes und den Offset (in Int16-Werten) je Name.
 */
export function buildContours(files: readonly { name: string; bytes: Uint8Array }[]): {
  bytes: Uint8Array;
  index: Record<string, number>;
} {
  const values: number[] = [];
  const index: Record<string, number> = {};
  for (const f of files.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const c = parseContourR(f.bytes);
    index[f.name] = values.length;
    values.push(c.width, c.height, c.top, c.bottom, ...c.spans);
  }
  for (const v of values) {
    if (v < -32768 || v > 32767) throw new Error(`Kontur-Wert ${v} passt nicht in Int16`);
  }
  const out = new Int16Array(values);
  return { bytes: new Uint8Array(out.buffer), index };
}

/** Liest eine Kontur aus dem Sidecar (Tests, Debug-Ansicht). */
export function readContour(
  data: Int16Array,
  offset: number,
): { width: number; height: number; top: number; bottom: number; spans: Int16Array } {
  const width = data[offset] ?? 0;
  const height = data[offset + 1] ?? 0;
  return {
    width,
    height,
    top: data[offset + 2] ?? R_EMPTY,
    bottom: data[offset + 3] ?? R_EMPTY,
    spans: data.subarray(offset + 4, offset + 4 + height * 2),
  };
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.keys(o)
      .toSorted()
      .map((k) => [k, o[k] as T]),
  );
}

export function atlasJson(
  pageIds: readonly string[],
  sprites: Record<string, AtlasSprite>,
  contours: Record<string, number>,
): Uint8Array {
  const json: AtlasJson = {
    version: 1,
    pages: pageIds,
    sprites: sortKeys(sprites),
    contours: sortKeys(contours),
  };
  return jsonBytes(json);
}
