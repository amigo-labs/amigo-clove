import { MANIFEST_VERSION, type Manifest, type ManifestEntry } from "@clove/core";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
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
  /** Cache ignorieren und alles neu konvertieren (außer `volatile`-Jobs). */
  readonly force?: boolean;
  /** Auch `volatile`-Jobs (Video) neu erzeugen. */
  readonly forceVolatile?: boolean;
  /**
   * `volatile`-Jobs nicht kodieren, sondern gültige Ausgaben aus diesem Baum
   * übernehmen (für `check`); fehlen sie oder sind veraltet, bleibt der Job leer.
   */
  readonly volatileFrom?: string;
  /** Gleichzeitig laufende Jobs (Vorgabe: Anzahl der Kerne). */
  readonly parallel?: number;
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

function bundlesOf(job: Job): string[] {
  return [...job.bundles, ...job.outputs.flatMap((o) => o.bundles ?? [])];
}

/** Gültige Cache-Einträge eines Jobs in `dir` (alle Ausgaben vorhanden und unverändert). */
async function cachedIn(
  job: Job,
  manifest: ReadonlyMap<string, ManifestEntry>,
  dir: string,
  sources: readonly { path: string; sha256: string }[],
  optHash: string,
): Promise<ManifestEntry[] | undefined> {
  const cached = job.outputs.map((o) => manifest.get(o.id)).filter((e): e is ManifestEntry => !!e);
  if (cached.length !== job.outputs.length) return undefined;
  const valid = await Promise.all(
    cached.map(async (e) => {
      if (e.optionsHash !== optHash || e.converterVersion !== job.converterVersion) return false;
      if (JSON.stringify(e.sources) !== JSON.stringify(sources)) return false;
      const path = join(dir, e.file);
      return existsSync(path) && sha256(await readBytes(path)) === e.sha256;
    }),
  );
  return valid.every(Boolean) ? cached : undefined;
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
  const selected = only ? jobs.filter((j) => bundlesOf(j).some((b) => only.has(b))) : jobs;
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
  const volatileSource = options.volatileFrom
    ? new Map(((await readManifest(options.volatileFrom))?.entries ?? []).map((e) => [e.id, e]))
    : undefined;

  const runJob = async (job: Job) => {
    const inputs = await Promise.all(job.sources.map((s) => readBytes(join(options.root, s))));
    const sources = job.sources.map((path, i) => ({ path, sha256: sha256(inputs[i]!) }));
    const optHash = optionsHash(job.options);
    const bundlesFor = (id: string) => job.outputs.find((o) => o.id === id)?.bundles ?? job.bundles;

    if (job.volatile && volatileSource && options.volatileFrom) {
      const cached = await cachedIn(job, volatileSource, options.volatileFrom, sources, optHash);
      if (!cached) {
        warnings.push(`${job.outputs.map((o) => o.id).join(", ")}: veraltet, nicht übernommen`);
        return;
      }
      for (const e of cached) {
        await mkdir(dirname(join(options.out, e.file)), { recursive: true });
        await copyFile(join(options.volatileFrom, e.file), join(options.out, e.file));
        entries.set(e.id, { ...e, bundles: bundlesFor(e.id) });
      }
      reused++;
      return;
    }

    const skipCache = job.volatile ? options.forceVolatile : options.force;
    const cached = skipCache ? undefined : await cachedIn(job, old, options.out, sources, optHash);
    if (cached) {
      reused++;
      for (const e of cached) entries.set(e.id, { ...e, bundles: bundlesFor(e.id) });
      return;
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
        bundles: bundlesFor(o.id),
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
  };

  // Planungsreihenfolge; die Planung stellt lange Jobs nach vorn.
  const queue = [...selected];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runJob(job);
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.parallel ?? availableParallelism()) }, worker),
  );

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

  return { converted, reused, filesWritten, bytesWritten, removed, warnings: warnings.toSorted() };
}

export interface CheckResult {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly changed: readonly string[];
}

/**
 * Gründliche lokale Prüfung (nicht in CI): baut vollständig und ohne Cache in
 * einen Temp-Ordner und vergleicht byteweise mit `out`. Fängt handeditierte,
 * veraltete und fehlende Assets; `volatile`-Ausgaben werden übernommen.
 */
export async function check(
  jobs: readonly Job[],
  options: Omit<BuildOptions, "out" | "only" | "force"> & { readonly out: string },
): Promise<CheckResult> {
  const temp = await mkdtemp(join(tmpdir(), "clove-assets-"));
  try {
    await build(jobs, {
      root: options.root,
      game: options.game,
      out: temp,
      force: true,
      volatileFrom: options.out,
    });
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

/**
 * Aktualität ohne Konvertierung: Passen Quellhashes, Optionen, Konverterversion
 * und Bundles jedes geplanten Jobs zum Manifest, und hat jeder Eintrag einen
 * Job? Zusammen mit `verify` das CI-Gate — Assets werden einmal lokal gebaut
 * und committet, CI hasht nur.
 */
export async function stale(
  jobs: readonly Job[],
  options: { readonly root: string; readonly out: string },
): Promise<string[]> {
  const manifest = await readManifest(options.out);
  if (!manifest) return [`${MANIFEST_FILE} fehlt in ${options.out}`];
  const entries = new Map(manifest.entries.map((e) => [e.id, e]));
  const hashes = new Map<string, string>();
  const hashOf = async (path: string) => {
    let h = hashes.get(path);
    if (h === undefined) {
      h = sha256(await readBytes(join(options.root, path)));
      hashes.set(path, h);
    }
    return h;
  };
  const problems: string[] = [];
  const planned = new Set<string>();
  for (const job of jobs) {
    const sources = await Promise.all(
      job.sources.map(async (path) => ({ path, sha256: await hashOf(path) })),
    );
    const optHash = optionsHash(job.options);
    for (const o of job.outputs) {
      planned.add(o.id);
      const e = entries.get(o.id);
      const bundles = o.bundles ?? job.bundles;
      if (!e) problems.push(`${o.id}: fehlt im Manifest`);
      else if (JSON.stringify(e.sources) !== JSON.stringify(sources))
        problems.push(`${o.id}: Quelle geändert`);
      else if (e.optionsHash !== optHash) problems.push(`${o.id}: Optionen geändert`);
      else if (e.converterVersion !== job.converterVersion)
        problems.push(
          `${o.id}: Konverterversion ${e.converterVersion} statt ${job.converterVersion}`,
        );
      else if (JSON.stringify(e.bundles) !== JSON.stringify(bundles))
        problems.push(`${o.id}: Bundles geändert`);
    }
  }
  for (const id of entries.keys())
    if (!planned.has(id)) problems.push(`${id}: kein Job erzeugt es`);
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
