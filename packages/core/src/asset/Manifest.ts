/**
 * Asset-Manifest: das einzige, was die Laufzeit über generierte Assets weiß.
 *
 * Geschrieben von `@clove/assetkit`, gelesen vom `BundleLoader` (M3). Dateinamen
 * sind content-gehasht (`<name>.<sha256[0:8]>.<ext>`), Assets also unveränderlich
 * und dauerhaft cachebar.
 */

export const MANIFEST_VERSION = 1;

export type AssetKind =
  | "image"
  | "sound"
  | "music"
  | "level"
  | "levelData"
  | "data"
  | "atlas"
  | "binary"
  | "video";

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
  /** Fehlt bei PCM16-WAV (DOVE); DoveZ: Ogg Opus. Rate/Kanäle/Frames beschreiben die Quelle. */
  readonly format?: "opus";
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
}

export interface MusicEntry extends ManifestEntryBase {
  readonly kind: "music";
  /** Tracker-Modul (DOVE, libopenmpt) oder Ogg Vorbis (DoveZ, gestreamt). */
  readonly format: "xm" | "it" | "ogg";
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

/**
 * Sprite-Atlas (JSON): Seiten (`image`-IDs), Rechteck und Überblendung je
 * Sprite, optional Konturen in einem `binary`-Sidecar. Schema: `AtlasJson`.
 */
export interface AtlasEntry extends ManifestEntryBase {
  readonly kind: "atlas";
  readonly pages: readonly string[];
  /** ID des Kontur-Sidecars, falls das Paket `.r`-Dateien hat. */
  readonly contours?: string;
}

/** Unveränderte oder binär kodierte Rohdaten (Kontur-Sidecar, Level-Skript). */
export interface BinaryEntry extends ManifestEntryBase {
  readonly kind: "binary";
}

/** Video (WebM: VP9 + Opus), gestreamt, nie vorgeladen. */
export interface VideoEntry extends ManifestEntryBase {
  readonly kind: "video";
  readonly width: number;
  readonly height: number;
  /** Dauer in Sekunden. */
  readonly duration: number;
}

export type ManifestEntry =
  | ImageEntry
  | SoundEntry
  | MusicEntry
  | LevelEntry
  | LevelDataEntry
  | DataEntry
  | AtlasEntry
  | BinaryEntry
  | VideoEntry;

export interface Manifest {
  readonly version: typeof MANIFEST_VERSION;
  readonly game: string;
  /** Nach `id` sortiert. */
  readonly entries: readonly ManifestEntry[];
}

/** Inhalt eines `atlas`-Assets. */
export interface AtlasJson {
  readonly version: 1;
  /** `image`-IDs der Seiten, Index = `AtlasSprite.page`. */
  readonly pages: readonly string[];
  /** Nach Name (klein, ohne `.bmp`). */
  readonly sprites: Readonly<Record<string, AtlasSprite>>;
  /**
   * Konturen nach Name: Offset (in Int16-Werten) in den Sidecar. Dort je Kontur
   * `width, height, top, bottom` und `height` Paare `left, right` (leer: -1/-1).
   */
  readonly contours: Readonly<Record<string, number>>;
}

export interface AtlasSprite {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** `key`: Schwarz ist durchsichtig; `alpha`: Alpha aus der Maske `XA.bmp`. */
  readonly blend: "key" | "alpha";
}
