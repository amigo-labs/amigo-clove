/**
 * DoveZ-Formate gegen alle Originale: Pakete, Konturen `.r`, Alphamasken,
 * Funktexte und Kampagne. Befunde: `docs/formats/dovez-container.md`.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  containerRecords,
  contourOfImage,
  decodeBmp,
  decodeCp1251,
  decodeCp1252,
  inflateWeb,
  maskName,
  parseContourR,
  parsePlayScript,
  parseRadioText,
  readContainer,
  serializeContourR,
  type ContainerEntry,
} from "../src/index";
import { DOVEZ_DATA, dovezContainers, readBytes } from "./fixtures";

const inflate = (b: Uint8Array) => new Uint8Array(inflateSync(b));

const containers = new Map<string, ContainerEntry[]>();
for (const file of dovezContainers()) {
  containers.set(file, readContainer(await readBytes(join(DOVEZ_DATA, file)), inflate));
}
const lower = (entries: readonly ContainerEntry[]) =>
  new Map(entries.map((e) => [e.name.toLowerCase(), e]));

/** Anteil zeilengenau übereinstimmender `.r`-Konturen (Stand M6: 2525 / 2546). */
const EXACT_CONTOUR_BASELINE = 2525 / 2546;

describe("DoveZ-Pakete", () => {
  test("alle 52 Pakete parsen restlos, Inventar wie in der Spec", () => {
    expect(containers.size).toBe(52);
    const byExt = new Map<string, number>();
    for (const entries of containers.values()) {
      for (const e of entries) {
        const ext = e.name.split(".").pop()!.toLowerCase();
        byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(byExt)).toEqual({
      bmp: 3232,
      wav: 243,
      avi: 12,
      r: 2587,
      dat: 27,
      txt: 49,
    });
  });

  test("keine doppelten Namen innerhalb eines Pakets", () => {
    for (const [file, entries] of containers) {
      expect([file, lower(entries).size]).toEqual([file, entries.length]);
    }
  });

  test("DecompressionStream liefert dieselben Bytes wie zlib", async () => {
    const bytes = await readBytes(join(DOVEZ_DATA, "Standart.d2p"));
    const records = containerRecords(bytes);
    for (const r of records.slice(0, 8)) {
      expect(await inflateWeb(r.compressed)).toEqual(inflate(r.compressed));
    }
  });

  test("abgeschnittene Datei wird erkannt", () => {
    const bytes = new Uint8Array([4, 0, 0, 0, 10, 0, 0, 0, 1, 2]);
    expect(() => containerRecords(bytes)).toThrow("Datei endet vorher");
  });
});

describe("Konturen .r", () => {
  test("alle parsen, Round-Trip byte-identisch, top/bottom passen zu den Spannen", () => {
    let n = 0;
    let headerMismatch = 0;
    for (const entries of containers.values()) {
      for (const e of entries) {
        if (!e.name.toLowerCase().endsWith(".r")) continue;
        const c = parseContourR(e.data);
        expect(serializeContourR(c)).toEqual(e.data);
        const rows = Array.from({ length: c.height }, (_, y) => y).filter(
          (y) => (c.spans[y * 2] as number) >= 0,
        );
        if (c.top !== (rows[0] ?? -1) || c.bottom !== (rows.at(-1) ?? -1)) headerMismatch++;
        n++;
      }
    }
    expect(n).toBe(2587);
    // wenige Dateien haben einen veralteten Kopf (Sprite nach dem Speichern geändert)
    expect(headerMismatch).toBeLessThan(100);
  });

  test("Kreuzvalidierung gegen die BMPs", () => {
    let paired = 0;
    let exact = 0;
    let dimensions = 0;
    for (const entries of containers.values()) {
      const byName = lower(entries);
      for (const e of entries) {
        if (!e.name.toLowerCase().endsWith(".r")) continue;
        const bmp = byName.get(e.name.toLowerCase().replace(/\.r$/, ".bmp"));
        if (!bmp) continue;
        paired++;
        const stored = parseContourR(e.data);
        const image = decodeBmp(bmp.data);
        if (image.width === stored.width && image.height === stored.height) dimensions++;
        if (
          image.width === stored.width &&
          image.height === stored.height &&
          contourOfImage(image).spans.every((v, i) => v === stored.spans[i])
        )
          exact++;
      }
    }
    console.log(`DoveZ-Konturen zeilengenau: ${exact}/${paired}`);
    expect(paired).toBe(2546);
    expect(dimensions).toBe(paired);
    expect(exact / paired).toBeGreaterThanOrEqual(EXACT_CONTOUR_BASELINE);
  });
});

describe("Alphamasken", () => {
  test("83 Paare, Maße gleich bis auf atlantis_saule2", () => {
    const pairs: string[] = [];
    const mismatched: string[] = [];
    for (const [file, entries] of containers) {
      const byName = lower(entries);
      for (const e of entries) {
        const name = e.name.toLowerCase();
        // Masken werden über ihr Sprite gefunden
        const mask = byName.get(maskName(name));
        if (!name.endsWith(".bmp") || !mask) continue;
        pairs.push(`${file}/${name}`);
        const a = decodeBmp(e.data);
        const m = decodeBmp(mask.data);
        if (a.width !== m.width || a.height !== m.height) mismatched.push(name);
      }
    }
    expect(pairs.length).toBe(83);
    expect(mismatched).toEqual(["atlantis_saule2.bmp"]);
  });
});

describe("Funktexte", () => {
  // R.txt (Russisch, CP1251) bleibt außen vor: die RU-Aufnahmen fehlen in den .dfp,
  // und einige Untertitel enthalten selbst `;` — dort ist die Datei nicht eindeutig.
  test("D und E parsen, haben dieselben Abschnitte und WAVs, die WAVs liegen in der .dfp", () => {
    let files = 0;
    for (const [file, entries] of containers) {
      if (!file.endsWith(".dlp")) continue;
      const texts = entries.filter((e) => /[DE]\.txt$/i.test(e.name));
      if (texts.length === 0) continue;
      const parsed = new Map(
        texts.map((e) => {
          const lang = e.name.slice(-5, -4).toUpperCase();
          return [lang, parseRadioText(decodeCp1252(e.data))] as const;
        }),
      );
      files += texts.length;
      const de = parsed.get("D")!;
      const en = parsed.get("E")!;
      expect(Object.keys(de).toSorted()).toEqual(Object.keys(en).toSorted());
      const voices = containers.get(file.replace(/\.dlp$/, ".dfp"));
      const available = new Set((voices ?? []).map((v) => v.name.toLowerCase()));
      for (const [section, lines] of Object.entries(de)) {
        expect(lines.map((l) => l.wav.toLowerCase())).toEqual(
          en[section]!.map((l) => l.wav.toLowerCase()),
        );
        for (const l of lines)
          expect([file, l.wav, available.has(l.wav.toLowerCase())]).toEqual([file, l.wav, true]);
      }
    }
    expect(files).toBe(32);
  });

  test("R.txt ist CP1251", () => {
    const r = containers.get("Level1-1 Skyfight.dlp")!.find((e) => e.name === "SkyfightR.txt")!;
    expect(decodeCp1251(r.data)).toContain("Космическую станцию атакуют!");
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

describe("Kampagne Play.txt", () => {
  test("jede Anweisung verweist auf vorhandene Level, Ladebilder und Videos", () => {
    const play = containers.get("Play.d2p")!;
    expect(play.map((e) => e.name)).toEqual(["Play.txt"]);
    const steps = parsePlayScript(decodeCp1252(play[0]!.data));
    expect(steps.length).toBe(38);
    const loading = new Set(containers.get("Loading.d2p")!.map((e) => e.name.toLowerCase()));
    const videos = new Set(containers.get("Video.d2p")!.map((e) => e.name.toLowerCase()));
    for (const s of steps) {
      if (s.op === "load") {
        expect(containers.has(`${s.level}.dlp`)).toBe(true);
        expect(loading.has(s.loading.toLowerCase())).toBe(true);
      }
      if (s.op === "play") expect(videos.has(s.video.toLowerCase())).toBe(true);
    }
    expect(steps.filter((s) => s.op === "load").length).toBe(23);
    expect(steps.at(-1)).toEqual({ op: "credits" });
  });
});
