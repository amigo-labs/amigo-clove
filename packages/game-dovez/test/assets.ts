/** Level aus den gebauten Assets (`assets/dovez`) für Simulationstests, ohne Browser. */
import { join } from "node:path";
import type { AtlasJson, Manifest } from "@clove/core";
import { parseDovezLevelDat, type DovezLevel, type RadioTexts } from "@clove/formats";
import type { SpriteSource } from "../src/sim/surfaces";

const ROOT = join(import.meta.dir, "../../../assets/dovez");
const manifest = (await Bun.file(join(ROOT, "manifest.json")).json()) as Manifest;

async function file(id: string): Promise<Uint8Array> {
  const e = manifest.entries.find((x) => x.id === id);
  if (!e) throw new Error(`Asset ${id} fehlt`);
  return new Uint8Array(await Bun.file(join(ROOT, e.file)).arrayBuffer());
}

export const LEVEL_SLUGS = manifest.entries
  .filter((e) => e.id.startsWith("leveldat/"))
  .map((e) => e.id.slice("leveldat/".length))
  .toSorted();

export async function loadTestLevel(
  slug: string,
): Promise<{ level: DovezLevel; sprites: SpriteSource }> {
  const level = parseDovezLevelDat(await file(`leveldat/${slug}`));
  const atlas = JSON.parse(new TextDecoder().decode(await file(`atlas/${slug}`))) as AtlasJson;
  const cb = manifest.entries.some((e) => e.id === `contours/${slug}`)
    ? await file(`contours/${slug}`)
    : new Uint8Array(0);
  const contours = new Int16Array(cb.buffer.slice(cb.byteOffset, cb.byteOffset + cb.byteLength));
  return {
    level,
    sprites: {
      size: (key) => atlas.sprites[key],
      contour: (key) => {
        const o = atlas.contours[key];
        if (o === undefined) return undefined;
        const h = contours[o + 1] as number;
        return contours.subarray(o, o + 4 + h * 2);
      },
    },
  };
}

/** Funktexte eines Levels (`radio/<slug>`), Deutsch, Englisch und Russisch. */
export async function loadTestRadio(
  slug: string,
): Promise<{ de: RadioTexts; en: RadioTexts; ru: RadioTexts } | undefined> {
  if (!manifest.entries.some((e) => e.id === `radio/${slug}`)) return undefined;
  return JSON.parse(new TextDecoder().decode(await file(`radio/${slug}`))) as {
    de: RadioTexts;
    en: RadioTexts;
    ru: RadioTexts;
  };
}
