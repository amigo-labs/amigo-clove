import type { AssetStore, AtlasJson } from "@clove/core";
import { parseDovezLevelDat, type DovezLevel, type RadioTexts } from "@clove/formats";

/**
 * Alles, was ein Level zum Spielen braucht: das geparste Skript, der Atlas
 * seines Pakets und die Konturen. Sprite-Namen sind BMP-Namen klein ohne
 * `.bmp` (`dovezSpriteKey`); das Level-Skript referenziert BMPs so.
 */
export interface LevelPack {
  readonly slug: string;
  readonly level: DovezLevel;
  readonly atlasId: string;
  readonly atlas: AtlasJson;
  /** Konturen des Pakets (Int16, Layout siehe `AtlasJson.contours`). */
  readonly contours: Int16Array;
  /** Funktexte je Sprache (`radio/<slug>`), fehlt bei Levels ohne Funk. */
  readonly radio: LevelRadio | undefined;
}

/** Funktexte eines Levels: Deutsch, Englisch, Russisch (`<Name>D/E/R.txt`). */
export interface LevelRadio {
  readonly de: RadioTexts;
  readonly en: RadioTexts;
  readonly ru: RadioTexts;
}

export async function loadLevelPack(assets: AssetStore, slug: string): Promise<LevelPack> {
  const atlasId = `atlas/${slug}`;
  const [bytes, atlas] = await Promise.all([
    assets.bytes(`leveldat/${slug}`),
    assets.json<AtlasJson>(atlasId),
  ]);
  const contourId = `contours/${slug}`;
  const contourBytes = assets.has(contourId) ? await assets.bytes(contourId) : new Uint8Array(0);
  const contours = new Int16Array(
    contourBytes.buffer.slice(
      contourBytes.byteOffset,
      contourBytes.byteOffset + contourBytes.byteLength,
    ),
  );
  const radioId = `radio/${slug}`;
  const radio = assets.has(radioId) ? await assets.json<LevelRadio>(radioId) : undefined;
  return { slug, level: parseDovezLevelDat(bytes), atlasId, atlas, contours, radio };
}
