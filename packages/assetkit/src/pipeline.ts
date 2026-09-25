import { MANIFEST_VERSION, type Manifest, type ManifestEntry } from "@clove/core";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { optionsHash, sha256 } from "./hash";
import type { Job } from "./job";

export const MANIFEST_FILE = "manifest.json";

export interface BuildOptions {
  /** Repo-Root; Quellpfade der Jobs sind relativ dazu. */
  readonly root: string;
  /** Zielordner (enthält `manifest.json`). */
  readonly out: string;
  readonly game: string;
  /** Nur Jobs, die zu einem dieser Bundles gehören; übrige Manifest-Einträge bleiben stehen. */
  readonly only?: readonly string[];
  /** Cache ignorieren und alles neu konvertieren. */
  readonly force?: boolean;
  readonly log?: (message: string) => void;
}

export interface BuildStats {
  readonly converted: number;
  readonly reused: number;
  readonly filesWritten: number;
  readonly bytesWritten: number;
  readonly removed: readonly string[];
  readonly warnings: readonly string[];
}

async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

async function readManifest(out: string): Promise<Manifest | undefined> {
  const path = join(out, MANIFEST_FILE);
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, "utf8")) as Manifest;
}

export function serializeManifest(manifest: Manifest): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

/** Alle Dateien unter `dir`, relativ und mit `/`, sortiert. */
export async function listTree(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/"))
    .toSorted();
}

/** Schreibt nur, wenn sich die Bytes unterscheiden. Liefert die geschriebenen Bytes. */
async function writeIfChanged(path: string, bytes: Uint8Array): Promise<number> {
  if (existsSync(path)) {
    const current = await readBytes(path);
    if (Buffer.compare(current, bytes) === 0) return 0;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return bytes.length;
}

async function removeEmptyDirs(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = join(dir, e.name);
    await removeEmptyDirs(sub);
    if ((await readdir(sub)).length === 0) await rmdir(sub);
  }
}

function contentFile(id: string, hash: string, ext: string): string {
  return `${id}.${hash.slice(0, 8)}.${ext}`;
}

/**
 * Baut alle Jobs in `out`. Ein Job wird übersprungen, wenn Quellhashes,
 * Optionen und Konverterversion zum bestehenden Manifest passen und seine
 * Ausgabedateien mit dem erwarteten Hash vorliegen. Dateien werden nur bei
 * geänderten Bytes geschrieben; ein zweiter Lauf schreibt daher null Bytes.
 */
export async function build(jobs: readonly Job[], options: BuildOptions): Promise<BuildStats> {
  const log = options.log ?? (() => {});
  const previous = await readManifest(options.out);
  const old = new Map((previous?.entries ?? []).map((e) => [e.id, e]));

  const ids = new Set<string>();
  for (const job of jobs) {
    for (const o of job.outputs) {
      if (ids.has(o.id)) throw new Error(`Asset-ID ${o.id} ist doppelt vergeben`);
      ids.add(o.id);
    }
  }

  const only = options.only ? new Set(options.only) : undefined;
  const selected = only ? jobs.filter((j) => j.bundles.some((b) => only.has(b))) : jobs;
  if (only && selected.length === 0) throw new Error(`kein Job gehört zu ${[...only].join(", ")}`);

  const entries = new Map<string, ManifestEntry>();
  if (only) {
    // Teilbuild: nicht ausgewählte, noch existierende Assets unverändert übernehmen.
    for (const [id, e] of old) if (ids.has(id)) entries.set(id, e);
  }

  let converted = 0;
  let reused = 0;
  let filesWritten = 0;
  let bytesWritten = 0;
  const warnings: string[] = [];

  for (const job of selected) {
    const inputs = await Promise.all(job.sources.map((s) => readBytes(join(options.root, s))));
    const sources = job.sources.map((path, i) => ({ path, sha256: sha256(inputs[i]!) }));
    const optHash = optionsHash(job.options);

    const cached = options.force
      ? undefined
      : job.outputs.map((o) => old.get(o.id)).filter((e): e is ManifestEntry => !!e);
    const hit =
      cached !== undefined &&
      cached.length === job.outputs.length &&
      (
        await Promise.all(
          cached.map(async (e) => {
            if (e.optionsHash !== optHash || e.converterVersion !== job.converterVersion)
              return false;
            if (JSON.stringify(e.sources) !== JSON.stringify(sources)) return false;
            const path = join(options.out, e.file);
            return existsSync(path) && sha256(await readBytes(path)) === e.sha256;
          }),
        )
      ).every(Boolean);

    if (hit) {
      reused++;
      for (const e of cached) entries.set(e.id, { ...e, bundles: job.bundles });
      continue;
    }

    converted++;
    for (const o of await job.run(inputs)) {
      const hash = sha256(o.bytes);
      const file = contentFile(o.id, hash, o.ext);
      const written = await writeIfChanged(join(options.out, file), o.bytes);
      if (written > 0) {
        filesWritten++;
        bytesWritten += written;
        log(`  schreibe ${file} (${o.bytes.length} B)`);
      }
      if (o.warning) warnings.push(o.warning);
      entries.set(o.id, {
        id: o.id,
        bundles: job.bundles,
        kind: o.kind,
        file,
        bytes: o.bytes.length,
        sha256: hash,
        sources,
        optionsHash: optHash,
        converterVersion: job.converterVersion,
        ...o.meta,
      } as ManifestEntry);
    }
  }

  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    game: options.game,
    entries: [...entries.values()].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  const manifestBytes = serializeManifest(manifest);
  const manifestWritten = await writeIfChanged(join(options.out, MANIFEST_FILE), manifestBytes);
  if (manifestWritten > 0) {
    filesWritten++;
    bytesWritten += manifestWritten;
  }

  const keep = new Set([MANIFEST_FILE, ...manifest.entries.map((e) => e.file)]);
  const removed = (await listTree(options.out)).filter((f) => !keep.has(f));
  for (const f of removed) {
    await rm(join(options.out, f));
    log(`  entferne ${f}`);
  }
  if (removed.length > 0) await removeEmptyDirs(options.out);

  return { converted, reused, filesWritten, bytesWritten, removed, warnings };
}

export interface CheckResult {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly changed: readonly string[];
}

/**
 * CI-Gate: baut vollständig und ohne Cache in einen Temp-Ordner und vergleicht
 * byteweise mit `out`. Fängt handeditierte, veraltete und fehlende Assets.
 */
export async function check(
  jobs: readonly Job[],
  options: Omit<BuildOptions, "out" | "only" | "force"> & { readonly out: string },
): Promise<CheckResult> {
  const temp = await mkdtemp(join(tmpdir(), "clove-assets-"));
  try {
    await build(jobs, { root: options.root, game: options.game, out: temp, force: true });
    const expected = await listTree(temp);
    const actual = new Set(await listTree(options.out));
    const missing = expected.filter((f) => !actual.has(f));
    const extra = [...actual].filter((f) => !expected.includes(f));
    const changed: string[] = [];
    for (const f of expected) {
      if (!actual.has(f)) continue;
      const [a, b] = await Promise.all([readBytes(join(temp, f)), readBytes(join(options.out, f))]);
      if (Buffer.compare(a, b) !== 0) changed.push(f);
    }
    return { missing, extra, changed };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/** Prüft die committeten Ausgaben gegen ihr Manifest, ohne neu zu konvertieren. */
export async function verify(out: string): Promise<string[]> {
  const manifest = await readManifest(out);
  if (!manifest) return [`${MANIFEST_FILE} fehlt in ${out}`];
  const problems: string[] = [];
  for (const e of manifest.entries) {
    const path = join(out, e.file);
    if (!existsSync(path)) {
      problems.push(`${e.file}: fehlt`);
      continue;
    }
    const bytes = await readBytes(path);
    if (bytes.length !== e.bytes) problems.push(`${e.file}: ${bytes.length} statt ${e.bytes} Byte`);
    else if (sha256(bytes) !== e.sha256) problems.push(`${e.file}: Hash weicht ab`);
  }
  const keep = new Set([MANIFEST_FILE, ...manifest.entries.map((e) => e.file)]);
  for (const f of await listTree(out)) if (!keep.has(f)) problems.push(`${f}: nicht im Manifest`);
  return problems;
}

export interface ReportRow {
  readonly name: string;
  readonly files: number;
  readonly bytes: number;
}

/** Größen je Bundle und je Asset-Art; `total` zählt jede Datei einmal. */
export async function report(
  out: string,
): Promise<{ bundles: ReportRow[]; kinds: ReportRow[]; total: ReportRow }> {
  const manifest = await readManifest(out);
  if (!manifest) throw new Error(`${MANIFEST_FILE} fehlt in ${out}`);
  const sum = (key: (e: ManifestEntry) => readonly string[]) => {
    const rows = new Map<string, { files: number; bytes: number }>();
    for (const e of manifest.entries) {
      for (const k of key(e)) {
        const r = rows.get(k) ?? { files: 0, bytes: 0 };
        rows.set(k, { files: r.files + 1, bytes: r.bytes + e.bytes });
      }
    }
    return [...rows]
      .map(([name, r]) => ({ name, ...r }))
      .toSorted((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  };
  return {
    bundles: sum((e) => e.bundles),
    kinds: sum((e) => [e.kind]),
    total: {
      name: "gesamt",
      files: manifest.entries.length,
      bytes: manifest.entries.reduce((s, e) => s + e.bytes, 0),
    },
  };
}
