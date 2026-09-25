/**
 * Asset-Manifest: das einzige, was die Laufzeit über generierte Assets weiß.
 *
 * Geschrieben von `@clove/assetkit`, gelesen vom `BundleLoader` (M3). Dateinamen
 * sind content-gehasht (`<name>.<sha256[0:8]>.<ext>`), Assets also unveränderlich
 * und dauerhaft cachebar.
 */

export const MANIFEST_VERSION = 1;

export type AssetKind = "image" | "sound" | "music" | "level" | "levelData" | "data";

export interface AssetSource {
  /** Pfad relativ zum Repo-Root, z. B. `original-dove/Data/Grafik/feinde1.spr`. */
  readonly path: string;
  readonly sha256: string;
}

export interface ManifestEntryBase {
  /** Stabile ID, unter der die Engine das Asset anfordert, z. B. `image/feinde1`. */
  readonly id: string;
  /**
   * Bundles, die das Asset enthalten. Mehrfachzugehörigkeit ist gewollt:
   * `background1` gehört zu sechs Level-Bundles, liegt aber nur einmal im Baum.
   */
  readonly bundles: readonly string[];
  readonly kind: AssetKind;
  /** Dateiname relativ zum Manifest. */
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  /** Alle Quellen, aus denen das Asset entsteht (Level: `.dat` und Terrain-Atlas). */
  readonly sources: readonly AssetSource[];
  /** Hash der Konverteroptionen; Teil des Cache-Schlüssels. */
  readonly optionsHash: string;
  readonly converterVersion: number;
}

export interface ImageEntry extends ManifestEntryBase {
  readonly kind: "image";
  readonly width: number;
  readonly height: number;
  /** Reines Schwarz ist transparent (Alpha 0). Opake Vollbilder: `false`. */
  readonly colorKeyed: boolean;
}

export interface SoundEntry extends ManifestEntryBase {
  readonly kind: "sound";
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
}

export interface MusicEntry extends ManifestEntryBase {
  readonly kind: "music";
  readonly format: "xm" | "it";
}

export interface LevelEntry extends ManifestEntryBase {
  readonly kind: "level";
  /** ID des zugehörigen Binär-Sidecars (`levelData/…`). */
  readonly data: string;
}

export interface LevelDataEntry extends ManifestEntryBase {
  readonly kind: "levelData";
}

/** Sonstige Spieldaten als JSON (z. B. die Meteor-Kontur `data/metroid`). */
export interface DataEntry extends ManifestEntryBase {
  readonly kind: "data";
}

export type ManifestEntry =
  | ImageEntry
  | SoundEntry
  | MusicEntry
  | LevelEntry
  | LevelDataEntry
  | DataEntry;

export interface Manifest {
  readonly version: typeof MANIFEST_VERSION;
  readonly game: string;
  /** Nach `id` sortiert. */
  readonly entries: readonly ManifestEntry[];
}
