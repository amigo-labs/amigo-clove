#!/usr/bin/env bun
/**
 * Asset-Pipeline. Aufruf über die Root-Skripte:
 *
 *   bun run assets:build  [--game=dove|dovez] [--only=level1,core] [--force] [--force-encode]
 *   bun run assets:verify   # CI-Gate ohne Konvertierung: Dateien ≡ Manifest, Manifest ≡ Quellen/Optionen
 *   bun run assets:check    # lokal, gründlich: frischer Build ≡ committeter Baum (Opus/Video übernommen)
 *   bun run assets:report   # Größen je Bundle und Art
 *
 * Ohne `--game` gelten die Befehle für beide Spiele, jeweils nach `assets/<spiel>/`.
 */
import { join, resolve } from "node:path";
import { planDove } from "./dove/config";
import { planDoveZ } from "./dovez/config";
import type { Job } from "./job";
import { build, check, report, stale, verify } from "./pipeline";

const ROOT = join(import.meta.dir, "../../..");

const GAMES: Readonly<Record<string, (root: string) => Job[]>> = {
  dove: planDove,
  dovez: planDoveZ,
};

interface Args {
  command: string;
  games: string[];
  out?: string;
  only?: string[];
  force: boolean;
  /** Auch Opus und Video neu kodieren (`volatile`-Jobs). */
  forceEncode: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const [command = "", ...rest] = argv;
  const args: Args = { command, games: Object.keys(GAMES), force: false, forceEncode: false };
  for (const a of rest) {
    if (a === "--force") args.force = true;
    else if (a === "--force-encode") args.forceEncode = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").filter(Boolean);
    else if (a.startsWith("--out=")) args.out = resolve(a.slice(6));
    else if (a.startsWith("--game=")) {
      const game = a.slice(7);
      if (!GAMES[game]) throw new Error(`unbekanntes Spiel ${game}`);
      args.games = [game];
    } else throw new Error(`unbekannte Option ${a}`);
  }
  if (args.out && args.games.length !== 1) throw new Error("--out braucht --game");
  return args;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function runGame(args: Args, game: string): Promise<number> {
  const out = args.out ?? join(ROOT, "assets", game);
  const plan = () => (GAMES[game] as (root: string) => Job[])(ROOT);
  console.log(`== ${game} ==`);
  switch (args.command) {
    case "build": {
      const started = performance.now();
      const stats = await build(plan(), {
        root: ROOT,
        out,
        game,
        force: args.force,
        forceVolatile: args.forceEncode,
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
      const r = await check(plan(), { root: ROOT, out, game });
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
      const problems = [...(await verify(out)), ...(await stale(plan(), { root: ROOT, out }))];
      if (problems.length === 0) {
        console.log("Alle Assets passen zum Manifest, das Manifest zu Quellen und Optionen.");
        return 0;
      }
      console.error(problems.join("\n"));
      console.error(
        "Veraltet oder verändert — `bun run assets:build` lokal ausführen und committen.",
      );
      return 1;
    }
    case "report": {
      const r = await report(out);
      const row = (x: { name: string; files: number; bytes: number }) =>
        `${x.name.padEnd(34)} ${String(x.files).padStart(4)} Dateien ${mb(x.bytes).padStart(10)}`;
      console.log("Bundles:");
      for (const b of r.bundles) console.log(`  ${row(b)}`);
      console.log("Arten:");
      for (const k of r.kinds) console.log(`  ${row(k)}`);
      console.log(`  ${row(r.total)}`);
      return 0;
    }
    default:
      console.error(
        "Aufruf: cli.ts build|check|verify|report [--game=dove|dovez] [--only=<bundle,…>] " +
          "[--force] [--force-encode] [--out=<dir>]",
      );
      return 2;
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  let code = 0;
  for (const game of args.games) code = Math.max(code, await runGame(args, game));
  return code;
}

process.exit(await main());
