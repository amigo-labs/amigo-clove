#!/usr/bin/env bun
/**
 * Asset-Pipeline. Aufruf über die Root-Skripte:
 *
 *   bun run assets:build  [--only=level1,core] [--force]
 *   bun run assets:check    # CI-Gate: frischer Build ≡ committeter Baum
 *   bun run assets:verify   # Hashes der Ausgaben gegen das Manifest
 *   bun run assets:report   # Größen je Bundle und Art
 */
import { join, resolve } from "node:path";
import { planDove } from "./dove/config";
import { build, check, report, verify } from "./pipeline";

const ROOT = join(import.meta.dir, "../../..");

interface Args {
  command: string;
  out: string;
  only?: string[];
  force: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const [command = "", ...rest] = argv;
  const args: Args = { command, out: join(ROOT, "assets/dove"), force: false };
  for (const a of rest) {
    if (a === "--force") args.force = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").filter(Boolean);
    else if (a.startsWith("--out=")) args.out = resolve(a.slice(6));
    else throw new Error(`unbekannte Option ${a}`);
  }
  return args;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const game = "dove";
  switch (args.command) {
    case "build": {
      const started = performance.now();
      const stats = await build(planDove(ROOT), {
        root: ROOT,
        out: args.out,
        game,
        force: args.force,
        log: console.log,
        ...(args.only ? { only: args.only } : {}),
      });
      for (const w of stats.warnings) console.warn(`Warnung: ${w}`);
      console.log(
        `${stats.converted} konvertiert, ${stats.reused} aus dem Cache, ` +
          `${stats.filesWritten} Dateien / ${stats.bytesWritten} Bytes geschrieben, ` +
          `${stats.removed.length} entfernt (${((performance.now() - started) / 1000).toFixed(1)} s)`,
      );
      return 0;
    }
    case "check": {
      const r = await check(planDove(ROOT), { root: ROOT, out: args.out, game });
      const lines = [
        ...r.missing.map((f) => `fehlt:        ${f}`),
        ...r.extra.map((f) => `überzählig:   ${f}`),
        ...r.changed.map((f) => `abweichend:   ${f}`),
      ];
      if (lines.length === 0) {
        console.log("Assets sind aktuell.");
        return 0;
      }
      console.error(lines.join("\n"));
      console.error(
        "Assets weichen vom frischen Build ab — `bun run assets:build` ausführen und committen.",
      );
      return 1;
    }
    case "verify": {
      const problems = await verify(args.out);
      if (problems.length === 0) {
        console.log("Alle Assets passen zum Manifest.");
        return 0;
      }
      console.error(problems.join("\n"));
      return 1;
    }
    case "report": {
      const r = await report(args.out);
      const row = (x: { name: string; files: number; bytes: number }) =>
        `${x.name.padEnd(12)} ${String(x.files).padStart(4)} Dateien ${mb(x.bytes).padStart(10)}`;
      console.log("Bundles:");
      for (const b of r.bundles) console.log(`  ${row(b)}`);
      console.log("Arten:");
      for (const k of r.kinds) console.log(`  ${row(k)}`);
      console.log(`  ${row(r.total)}`);
      return 0;
    }
    default:
      console.error(
        "Aufruf: cli.ts build|check|verify|report [--only=<bundle,…>] [--force] [--out=<dir>]",
      );
      return 2;
  }
}

process.exit(await main());
