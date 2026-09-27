import type { AssetKind } from "@clove/core";

/** Ein Ausgabeasset eines Jobs; die ID steht vor der Konvertierung fest (Cache-Prüfung). */
export interface OutputSpec {
  readonly id: string;
  readonly kind: AssetKind;
  readonly ext: string;
  /** Überschreibt `Job.bundles` für diese Ausgabe (ein Paket, mehrere Bundles). */
  readonly bundles?: readonly string[];
}

export interface JobOutput extends OutputSpec {
  readonly bytes: Uint8Array;
  /** Kind-spezifische Manifest-Felder (`width`, `sampleRate`, …). */
  readonly meta: Readonly<Record<string, unknown>>;
  readonly warning?: string;
}

/**
 * Eine Konvertierung: reine Funktion von Quellbytes und Optionen auf Ausgabebytes.
 * Der Cache-Schlüssel ist `sha256(Quellen) ⊕ optionsHash ⊕ converterVersion`.
 */
export interface Job {
  readonly bundles: readonly string[];
  /** Pfade relativ zum Repo-Root, in der Reihenfolge, in der `run` sie erhält. */
  readonly sources: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly converterVersion: number;
  readonly outputs: readonly OutputSpec[];
  /**
   * Ausgabe nicht bitgenau reproduzierbar (Video). Wird nur bei geänderten
   * Quellen/Optionen oder mit `forceVolatile` neu erzeugt; `assets:check`
   * übernimmt sie aus dem committeten Baum, statt sie neu zu kodieren.
   */
  readonly volatile?: boolean;
  run(inputs: readonly Uint8Array[]): Promise<readonly JobOutput[]>;
}
