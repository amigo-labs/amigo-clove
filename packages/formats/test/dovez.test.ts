/**
 * DoveZ-Formate: rein synthetische Grammatik- und Containerprüfungen.
 * Die byte-genauen Prüfungen gegen die Originalinstallation sind entfallen,
 * da die Originale nicht mehr im Repo liegen.
 */
import { describe, expect, test } from "bun:test";
import { containerRecords, decodeCp1251, encodeCp1251, parseRadioText } from "../src/index";

describe("DoveZ-Pakete", () => {
  test("abgeschnittene Datei wird erkannt", () => {
    const bytes = new Uint8Array([4, 0, 0, 0, 10, 0, 0, 0, 1, 2]);
    expect(() => containerRecords(bytes)).toThrow("Datei endet vorher");
  });
});

describe("Funktexte", () => {
  test("Grammatik: Untertitel mit „;“, „;;0;“-Rest, vertauschte Felder", () => {
    // Gruppenanfang = Sprecher + WAV (oder vertauscht Dauer + WAV); alles davor ist Untertitel
    const t = parseRadioText(
      "[A]\r\nframe;a.wav;10;Eins; zwei;;0;\r\n\r\n[B]\r\n0; 1489; b.wav; Text; 0 ; c.wav ; 7; Sieben; acht\r\n",
    );
    expect(t["A"]).toEqual([{ frame: true, wav: "a.wav", ms: 10, text: "Eins; zwei" }]);
    expect(t["B"]).toEqual([
      { frame: false, wav: "b.wav", ms: 1489, text: "Text", swapped: true },
      { frame: false, wav: "c.wav", ms: 7, text: "Sieben; acht" },
    ]);
    // ein unbekannter Sprecher am Anfang bleibt ein Fehler
    expect(() => parseRadioText("[A]\nEins; a.wav; 1; t")).toThrow("Sprecher");
    expect(() => parseRadioText("[A]\nframe; a.txt; 1; t")).toThrow("keine WAV");
  });

  test("CP1251: Kodieren und Dekodieren sind zueinander invers", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(encodeCp1251(decodeCp1251(all))).toEqual(all);
    expect(encodeCp1251("Привет, Брюс!")).toEqual(
      Uint8Array.from([
        0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xc1, 0xf0, 0xfe, 0xf1, 0x21,
      ]),
    );
    expect(() => encodeCp1251("ä")).toThrow("nicht darstellbar");
  });

  test("Grammatik: Viergruppen, abgeschnittene letzte Gruppe, Sprecher mitten in der Zeile", () => {
    const t = parseRadioText(
      "[A]\r\nFrame; x.wav; 10; Hallo ; 0 ; y.wav ; 20; Du;Frame;z.wav;30;Drei\r\n\r\n[B]\r\nframe;q.wav;\r\n",
    );
    expect(t).toEqual({
      A: [
        { frame: true, wav: "x.wav", ms: 10, text: "Hallo" },
        { frame: false, wav: "y.wav", ms: 20, text: "Du" },
        { frame: true, wav: "z.wav", ms: 30, text: "Drei" },
      ],
      B: [{ frame: true, wav: "q.wav", ms: null, text: "" }],
    });
    expect(() => parseRadioText("[A]\nBob; x.wav; 1; t")).toThrow("Sprecher");
  });
});
