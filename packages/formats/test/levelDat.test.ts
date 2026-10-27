import { describe, expect, test } from "bun:test";
import {
  LevelDatError,
  encodeCp1252,
  formatEventLine,
  parseEventLine,
  parseLevelDat,
  serializeLevelDat,
} from "../src/index";

const dec = (b: Uint8Array) => new TextDecoder("windows-1252").decode(b);

describe("Event-Zeilen", () => {
  test.each([
    "",
    "166§",
    ";3 0 0!",
    ";1 4 0! 68§",
    "68§ 133§",
    "30§;1 4 0! 37§",
    ";0 1 -20!;4 6 65!",
  ])("'%s' round-trippt", (line) => {
    expect(formatEventLine(parseEventLine(line))).toBe(line);
  });

  test("zerlegt Kommandos und Spawns", () => {
    expect(parseEventLine(";1 4 0! 68§")).toEqual([
      { kind: "command", op: 1, a: 4, b: 0 },
      { kind: "spawn", y: 68 },
    ]);
  });

  test.each(["68§  12§", " 68§", ";1 4 0!;", "x", ";1 4! 5§", "68§ ;1 4 0!"])(
    "lehnt nicht-kanonische Zeile '%s' ab",
    (line) => {
      expect(() => parseEventLine(line)).toThrow(LevelDatError);
    },
  );
});

describe("LevelDat — Fehlerfälle", () => {
  const enc = encodeCp1252;

  test("Konturlänge, die nicht aufgeht, wird gemeldet", () => {
    const src = '"*"\n"*"\n"G"\n0\n0\n4\n2\n1\n2\n3\n4\n5\n0\n1\n0\n1\n"*"\n"*"\n0\n\n"bg"\n';
    expect(() => parseLevelDat(enc(src))).toThrow(/kein Vielfaches von 8/);
  });

  test("Minimaldatei round-trippt", () => {
    const src = '"*"\n"*"\n"*"\n"*"\n1\n\n1§\n"bg"\n';
    const lvl = parseLevelDat(enc(src));
    expect(lvl.events).toEqual([[], [{ kind: "spawn", y: 1 }]]);
    expect(dec(serializeLevelDat(lvl))).toBe(src);
  });

  test("CRLF-Dateien behalten ihr Zeilenende", () => {
    const src = '"*"\r\n"*"\r\n"*"\r\n"*"\r\n0\r\n\r\n"bg"\r\n';
    const lvl = parseLevelDat(enc(src));
    expect(lvl.eol).toBe("\r\n");
    expect(dec(serializeLevelDat(lvl))).toBe(src);
  });

  test("abgeschnittene Datei", () => {
    expect(() => parseLevelDat(enc('"*"\n"*"\n"*"\n"*"\n5\n\n'))).toThrow(LevelDatError);
  });
});
