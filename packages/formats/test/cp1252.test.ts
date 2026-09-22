import { describe, expect, test } from "bun:test";
import { decodeCp1252, encodeCp1252 } from "../src/index";

describe("CP1252", () => {
  test("jedes Byte übersteht den Round-Trip", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(encodeCp1252(decodeCp1252(all))).toEqual(all);
  });

  test("Umlaute, § und die 0x80-Zeile werden korrekt abgebildet", () => {
    expect(decodeCp1252(Uint8Array.of(0xe4, 0xf6, 0xfc, 0xdf, 0xa7, 0x80, 0x84))).toBe("äöüß§€„");
  });

  test("nicht darstellbare Zeichen werfen statt still zu ersetzen", () => {
    expect(() => encodeCp1252("→")).toThrow(RangeError);
  });
});
