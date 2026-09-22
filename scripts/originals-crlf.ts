/**
 * Stellt die Zeilenenden der Originalinstallationen wieder her.
 *
 * Beim ersten Commit (2b11c2c) hat Git 20 Textdateien der Originale von CRLF auf
 * LF normalisiert. Seit M0 verhindert `.gitattributes` (`-text`) jede weitere
 * Konvertierung; dieses Skript bringt die bereits betroffenen Dateien zurück.
 *
 *   bun scripts/originals-crlf.ts reconstruct
 *       Wandelt im Repo LF → CRLF. Eine *Annahme*: Ob ein Original gemischte
 *       oder reine LF-Zeilenenden hatte, ist aus dem Repo nicht mehr erkennbar.
 *
 *   bun scripts/originals-crlf.ts verify <DOVE-Ordner> <DoveZ-Ordner>
 *       Vergleicht die Repo-Dateien byte-genau mit einer echten Installation.
 *       Exit-Code 1 bei jeder Abweichung.
 *
 *   bun scripts/originals-crlf.ts restore <DOVE-Ordner> <DoveZ-Ordner>
 *       Kopiert die 20 Dateien byte-genau aus der Installation ins Repo.
 *       Das ist die maßgebliche Variante, wenn die Installation vorliegt.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** Die von Git normalisierten Dateien, relativ zum jeweiligen Installationsordner. */
const AFFECTED: Readonly<Record<"dove" | "dovez", readonly string[]>> = {
  dove: [
    "Data/Grafik/METROID.dat",
    ...Array.from({ length: 12 }, (_, i) => `Data/Level${i}.dat`),
    "Data/intro.dat",
    "Help/Help Guide.htm",
    "Liesmich.txt",
    "Readme.txt",
  ],
  dovez: ["DoveZ.url", "Liesmich.txt", "ReadMe.txt"],
};

const REPO_DIR = { dove: "original-dove", dovez: "original-dovez" } as const;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function lfToCrlf(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    if (b === 0x0a && bytes[i - 1] !== 0x0d) out.push(0x0d);
    out.push(b);
  }
  return Uint8Array.from(out);
}

function* files(): Generator<{ game: "dove" | "dovez"; rel: string; repoPath: string }> {
  for (const game of ["dove", "dovez"] as const) {
    for (const rel of AFFECTED[game]) {
      yield { game, rel, repoPath: join(ROOT, REPO_DIR[game], rel) };
    }
  }
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function reconstruct(): void {
  for (const { repoPath, game, rel } of files()) {
    const before = readFileSync(repoPath);
    const after = lfToCrlf(before);
    const changed = !equal(before, after);
    if (changed) writeFileSync(repoPath, after);
    console.log(
      `${changed ? "CRLF" : "ok  "}  ${REPO_DIR[game]}/${rel}  ${before.length} → ${after.length} B`,
    );
  }
}

function compare(installs: Record<"dove" | "dovez", string>, copy: boolean): number {
  let mismatches = 0;
  for (const { repoPath, game, rel } of files()) {
    const source = join(installs[game], rel);
    if (!existsSync(source)) {
      console.log(`FEHLT ${source}`);
      mismatches++;
      continue;
    }
    const original = readFileSync(source);
    const repo = readFileSync(repoPath);
    const same = equal(original, repo);
    if (!same) mismatches++;
    if (copy && !same) writeFileSync(repoPath, original);
    console.log(
      `${same ? "gleich" : copy ? "kopiert" : "ANDERS"}  ${REPO_DIR[game]}/${rel}  ` +
        `Repo ${repo.length} B ${sha256(repo)}  Original ${original.length} B ${sha256(original)}`,
    );
  }
  return mismatches;
}

const [mode, dove, dovez] = process.argv.slice(2);
if (mode === "reconstruct") {
  reconstruct();
} else if ((mode === "verify" || mode === "restore") && dove && dovez) {
  const mismatches = compare({ dove, dovez }, mode === "restore");
  console.log(
    mismatches === 0
      ? "Alle 20 Dateien stimmen byte-genau überein."
      : `${mismatches} Datei(en) ${mode === "restore" ? "aus der Installation übernommen" : "weichen ab"}.`,
  );
  if (mode === "verify" && mismatches > 0) process.exit(1);
} else {
  console.error(
    "Aufruf: bun scripts/originals-crlf.ts reconstruct\n" +
      "       bun scripts/originals-crlf.ts verify|restore <DOVE-Ordner> <DoveZ-Ordner>",
  );
  process.exit(2);
}
