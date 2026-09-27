import { describe, expect, test } from "bun:test";
import { readSchema, schemaCoverage, writeSchema, type Schema } from "../src/dovez/binarySchema";

const SCHEMA: Schema = [
  { name: "magic", type: "fixed3" },
  { count: "items" },
  { name: "title", type: "str" },
  { name: "unknownFlag", type: "i16" },
  { list: "items", of: [{ name: "x", type: "f32" }] },
  { name: "pair", repeat: 2, of: [{ name: "v", type: "i32" }] },
];

function bytes(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

const SAMPLE = bytes(
  [0x41, 0x42, 0x43], // "ABC"
  [1, 0, 0, 0], // Obergrenze 1 → zwei Einträge
  [2, 0, 0, 0, 0x68, 0xe4], // "hä" (CP1252)
  [0xff, 0xff], // -1
  [0, 0, 0x80, 0x3f], // 1.0
  [0, 0, 0x20, 0xc1], // -10.0
  [7, 0, 0, 0],
  [0xfe, 0xff, 0xff, 0xff],
);

describe("Binärschema", () => {
  test("liest Zähler vor der Liste, Strings, i16, f32, feste Wiederholung", () => {
    const row = readSchema(SAMPLE, SCHEMA);
    expect(row).toEqual({
      magic: "ABC",
      title: "hä",
      unknownFlag: -1,
      items: [{ x: 1 }, { x: -10 }],
      pair: [{ v: 7 }, { v: -2 }],
    });
    expect(writeSchema(row, SCHEMA)).toEqual(SAMPLE);
  });

  test("Coverage zählt jedes Byte genau einmal", () => {
    const c = schemaCoverage(readSchema(SAMPLE, SCHEMA), SCHEMA);
    expect(c).toEqual({ named: 3 + 2 + 8 + 8, unknown: 2, structure: 8 });
    expect(c.named + c.unknown + c.structure).toBe(SAMPLE.length);
  });

  test("Obergrenze -1 ist eine leere Liste", () => {
    const empty = bytes(
      [0x41, 0x42, 0x43],
      [0xff, 0xff, 0xff, 0xff],
      [0, 0, 0, 0],
      [0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    );
    const row = readSchema(empty, SCHEMA);
    expect(row["items"]).toEqual([]);
    expect(writeSchema(row, SCHEMA)).toEqual(empty);
  });

  test("Restbytes und abgeschnittene Dateien sind Fehler", () => {
    expect(() => readSchema(bytes([...SAMPLE], [0]), SCHEMA)).toThrow("nach dem Ende");
    expect(() => readSchema(SAMPLE.subarray(0, 20), SCHEMA)).toThrow("Datei endet");
  });

  test("feste Stringlänge und Wiederholungszahl werden beim Schreiben geprüft", () => {
    const row = readSchema(SAMPLE, SCHEMA);
    expect(() => writeSchema({ ...row, magic: "ABCD" }, SCHEMA)).toThrow("4 statt 3");
    expect(() => writeSchema({ ...row, pair: [{ v: 1 }] }, SCHEMA)).toThrow("1 statt 2");
  });
});
