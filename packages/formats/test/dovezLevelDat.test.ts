/**
 * DoveZ-Level-Skripte gegen alle 27 Originale. Befund:
 * `docs/formats/dovez-level-dat.md`.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  DovezLevelDatError,
  dovezLevelCoverage,
  parseDovezLevelDat,
  readContainer,
  serializeDovezLevelDat,
  type DovezLevel,
} from "../src/index";
import { DOVEZ_DATA, dovezContainers, readBytes } from "./fixtures";

const inflate = (b: Uint8Array) => new Uint8Array(inflateSync(b));

const files = new Map<string, Uint8Array>();
for (const file of dovezContainers().filter((f) => f.endsWith(".dlp"))) {
  for (const e of readContainer(await readBytes(join(DOVEZ_DATA, file)), inflate)) {
    if (e.name.toLowerCase().endsWith(".dat")) files.set(e.name, e.data);
  }
}
const levels = new Map<string, DovezLevel>(
  [...files].map(([name, bytes]) => [name, parseDovezLevelDat(bytes)]),
);

const sum = (f: (l: DovezLevel) => number) => [...levels.values()].reduce((a, l) => a + f(l), 0);

describe("DoveZ-Level-Skript", () => {
  test("alle 27 parsen restlos, Round-Trip byte-identisch", () => {
    expect(files.size).toBe(27);
    for (const [name, bytes] of files) {
      expect([name, serializeDovezLevelDat(levels.get(name)!)]).toEqual([name, bytes]);
    }
  });

  test("kein Byte mit offener Bedeutung", () => {
    let named = 0;
    let unused = 0;
    let unknown = 0;
    let structure = 0;
    for (const [name, level] of levels) {
      const c = dovezLevelCoverage(level);
      expect([name, c.named + c.unused + c.unknown + c.structure]).toEqual([
        name,
        files.get(name)!.length,
      ]);
      named += c.named;
      unused += c.unused;
      unknown += c.unknown;
      structure += c.structure;
    }
    const total = named + unused + unknown + structure;
    console.log(
      `DoveZ-.dat: ${total} Byte, benannt ${named}, ungelesen ${unused}, ` +
        `Struktur ${structure}, offen ${unknown}`,
    );
    expect(unknown).toBe(0);
  });

  test("Inventar", () => {
    expect(sum((l) => l.groups.length)).toBe(994);
    expect(sum((l) => l.enemies.length)).toBe(267);
    expect(sum((l) => l.routes.length)).toBe(519);
    expect(sum((l) => l.anims.length)).toBe(95);
    expect(sum((l) => l.anims.reduce((a, x) => a + x.notes.length, 0))).toBe(0);
    for (const l of levels.values()) expect(l.layers.length).toBe(7);
  });

  test("jeder Verweis liegt im Bereich", () => {
    for (const [name, l] of levels) {
      const bad: string[] = [];
      const check = (what: string, i: number, n: number) => {
        if (!(i >= 0 && i < n)) bad.push(`${what} ${i}/${n}`);
      };
      for (const e of l.enemies) {
        for (const p of e.parts) {
          check("Teil→Gruppe", p.group, l.groups.length);
          if (p.weapon !== -1) check("Teil→Waffe", p.weapon, l.weapons.length);
          if (p.route !== -1000) check("Teil→Route", p.route, l.routes.length);
        }
      }
      for (const w of l.weapons) {
        for (const s of w.salvos) {
          check("Salve→Schusstyp", s.shotType, l.shots.length);
          if (s.route !== -1) check("Salve→Route", s.route, l.routes.length);
        }
      }
      for (const s of l.shots) if (s.kind === 1) check("Schuss→Gruppe", s.group, l.groups.length);
      for (const a of l.anims)
        for (const t of a.tracks) check("Spur→Gruppe", t.group, l.groups.length);
      l.layers.forEach((layer, i) => {
        for (const e of layer.entries) {
          if (i === 4) {
            if (e.kind === 0) {
              check("Spawn→Gegner", e.p1, l.enemies.length);
              check("Spawn→Route", e.p2, l.routes.length);
            } else if (e.kind === 1) check("Ton", e.p1, l.sounds.length);
            else if (e.kind === 2) check("Funk", e.p1, l.radio.length);
          } else if (e.kind === 0) check("Kachel→Gruppe", e.p1, l.groups.length);
          else if (e.kind === 1) check("Effekt→Animation", e.p2, l.anims.length);
        }
      });
      expect([name, bad]).toEqual([name, []]);
    }
  });

  test("Routen: Opcodes 0…44, Argumentzahl je Opcode fest", () => {
    const arity = new Map<number, Set<number>>();
    for (const l of levels.values()) {
      for (const r of l.routes) {
        for (const op of r.ops) {
          expect(op.op).toBeGreaterThanOrEqual(0);
          expect(op.op).toBeLessThanOrEqual(44);
          arity.set(op.op, (arity.get(op.op) ?? new Set()).add(op.args.length));
        }
      }
    }
    // einzige Ausnahme: Step (4) hat 48-mal ein drittes, nie gelesenes Argument
    const varying = [...arity].filter(([, n]) => n.size > 1).map(([op]) => op);
    expect(varying).toEqual([4]);
  });

  test("Zeitleiste: jede Ebene nach Tick sortiert (der Spieler überspringt kleinere Ticks)", () => {
    let negative = 0;
    for (const [name, l] of levels) {
      for (const layer of l.layers) {
        layer.entries.forEach((e, i) => {
          if (i > 0) expect([name, e.tick >= layer.entries[i - 1]!.tick]).toEqual([name, true]);
          if (e.tick < 0) negative++;
        });
      }
    }
    // feuern nur, falls ein Level vor Tick 0 beginnt (Me.560, offen bis M8)
    expect(negative).toBe(118);
  });

  test("Fehler: falsches Magic, abgeschnitten, Restbytes", () => {
    const bytes = files.get("Epilog.dat")!;
    const broken = bytes.slice();
    broken[0] = 0x58;
    expect(() => parseDovezLevelDat(broken)).toThrow(DovezLevelDatError);
    expect(() => parseDovezLevelDat(bytes.subarray(0, 1000))).toThrow("Datei endet");
    const longer = new Uint8Array(bytes.length + 1);
    longer.set(bytes);
    expect(() => parseDovezLevelDat(longer)).toThrow("nach dem Ende");
  });
});
