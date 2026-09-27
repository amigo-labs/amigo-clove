import { describe, expect, test } from "bun:test";
import {
  AssetStore,
  createSaveFile,
  parseSaveFile,
  resolveLocale,
  translator,
  type Fetch,
  type Manifest,
  type ManifestEntry,
} from "../src/index";

describe("i18n", () => {
  test("feste Sprache gewinnt, sonst erste passende Browsersprache, sonst Englisch", () => {
    expect(resolveLocale("de", ["en-US"])).toBe("de");
    expect(resolveLocale("auto", ["fr-FR", "de-AT", "en"])).toBe("de");
    expect(resolveLocale("auto", ["EN-gb"])).toBe("en");
    expect(resolveLocale("auto", ["fr", "it"])).toBe("en");
    expect(resolveLocale("auto", [])).toBe("en");
  });

  test("Platzhalter werden ersetzt, unbekannte bleiben stehen", () => {
    const t = translator({ de: { hi: "Hallo {name}, {n} MB {x}" }, en: { hi: "Hi {name}" } }, "de");
    expect(t("hi", { name: "Kauto", n: 3 })).toBe("Hallo Kauto, 3 MB {x}");
  });
});

describe("Spielstanddatei", () => {
  const games = { dove: { config: "1;0;1", highscore: "[]" } };

  test("Round-Trip über JSON", () => {
    const file = createSaveFile(games, new Date(Date.UTC(2026, 8, 27, 12)));
    expect(file.exported).toBe("2026-09-27T12:00:00.000Z");
    expect(parseSaveFile(JSON.stringify(file))).toEqual(file);
  });

  test("Fremdes wird mit Meldung abgelehnt", () => {
    const ok = createSaveFile(games, new Date(0));
    const variant = (patch: Record<string, unknown>) => JSON.stringify({ ...ok, ...patch });
    expect(() => parseSaveFile("{")).toThrow("kein gültiges JSON");
    expect(() => parseSaveFile(variant({ format: "x" }))).toThrow("unbekanntes Format");
    expect(() => parseSaveFile(variant({ version: 0 }))).toThrow("ungültige Version");
    expect(() => parseSaveFile(variant({ version: 99 }))).toThrow("neuer als diese Fassung");
    expect(() => parseSaveFile(variant({ games: [] }))).toThrow("„games“ fehlt");
    expect(() => parseSaveFile(variant({ games: { dove: { a: 1 } } }))).toThrow("kein Text");
  });
});

function entry(id: string, bundles: string[], bytes: number): ManifestEntry {
  return {
    id,
    bundles,
    kind: "data",
    file: `${id}.json`,
    bytes,
    sha256: "x",
    sources: [],
    optionsHash: "o",
    converterVersion: 1,
  };
}

describe("AssetStore.preload", () => {
  const manifest: Manifest = {
    version: 1,
    game: "t",
    entries: [entry("a", ["core"], 10), entry("b", ["core", "screens"], 20), entry("c", ["x"], 5)],
  };

  test("lädt jede ID einmal und meldet Bytes laut Manifest", async () => {
    const fetched: string[] = [];
    const fetchFn: Fetch = async (url) => {
      fetched.push(url);
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) };
    };
    const store = new AssetStore(manifest, "/t/", fetchFn);
    const progress: [number, number][] = [];
    await store.preload(["core", "screens"], (l, t) => progress.push([l, t]), 1);
    expect(fetched).toEqual(["/t/a.json", "/t/b.json"]);
    expect(progress).toEqual([
      [0, 30],
      [10, 30],
      [30, 30],
    ]);
    await store.bytes("b");
    expect(fetched.length).toBe(2);
  });
});
