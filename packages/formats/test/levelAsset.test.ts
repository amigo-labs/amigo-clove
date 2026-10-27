import { describe, expect, test } from "bun:test";
import {
  ContourDatError,
  EventOp,
  IntroDatError,
  SPAWN_KIND,
  parseContourDat,
  parseIntroDat,
} from "../src/index";

const enc = (s: string) => new TextEncoder().encode(s);

describe("Level-Asset", () => {
  test("Spawn-Kind kollidiert mit keinem Opcode", () => {
    expect(SPAWN_KIND).not.toBeOneOf(Object.values(EventOp));
  });
});

describe("METROID.dat", () => {
  test("fehlender Terminator und Müll werden abgelehnt", () => {
    expect(() => parseContourDat(enc(" 1 \r\n 2 \r\n"))).toThrow(ContourDatError);
    expect(() => parseContourDat(enc("x\r\n"))).toThrow(ContourDatError);
  });
});

describe("intro.dat", () => {
  test("Abweichungen im Schema werden erkannt", () => {
    expect(() => parseIntroDat(enc('1\r\n"a"\r\n'))).toThrow(IntroDatError);
  });
});
