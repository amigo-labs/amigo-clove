/**
 * Funk auf Russisch: `radio/<slug>` = `{ de, en, ru }` (Assetpipeline), die
 * russischen Funk-IDs passen zu den Level-Skripten, Untertitel laufen im Laufband.
 * Die RU-Aufnahmen (`…RU_*.wav`) fehlen in den Originaldaten: der Funkspruch ist
 * dann stumm (das Original täte dasselbe), nur die drei gleichnamigen Escape-WAVs
 * gibt es.
 */
import { describe, expect, test } from "bun:test";
import { dovezSlug } from "@clove/formats";
import { NO_INPUT, type PlayerInput } from "../src/sim/player";
import { World } from "../src/sim/world";
import { LEVEL_SLUGS, hasAsset, loadTestLevel, loadTestRadio } from "./assets";

const fire: PlayerInput = { ...NO_INPUT, fire: true };

/** Funk-IDs (klein) eines Textsatzes. */
const ids = (r: Record<string, unknown>) => new Set(Object.keys(r).map((k) => k.toLowerCase()));
/** Gibt es diese Stimme im Manifest des Levels? */
const hasVoice = (slug: string, wav: string) => hasAsset(`voice/${slug}/${dovezSlug(wav)}`);

describe("Funk auf Russisch", () => {
  test("jedes Level mit Funk hat de, en und ru; die Funk-IDs des Skripts finden ihre Texte", async () => {
    let levels = 0;
    const missing: string[] = [];
    for (const slug of LEVEL_SLUGS) {
      const radio = await loadTestRadio(slug);
      if (!radio) continue;
      levels++;
      const { level } = await loadTestLevel(slug);
      const [de, en, ru] = [ids(radio.de), ids(radio.en), ids(radio.ru)];
      for (const r of level.radio) {
        const id = r.id.trim().toLowerCase();
        if (!de.has(id) || !en.has(id)) continue; // Funk ohne Text in D/E: in keiner Sprache
        if (!ru.has(id)) missing.push(`${slug}: ${r.id}`);
      }
    }
    expect(levels).toBe(16);
    // einzige Lücke der russischen Fassung: der Funkspruch „Bombers“ in Spacestation II
    expect(missing).toEqual(["level2-2_spacestation_ii: Bombers"]);
  });

  test("Skyfight: russischer Notruf — Untertitel im Laufband, Stimme nach dem Namen der Datei", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const radio = (await loadTestRadio("level1-1_skyfight"))!;
    const w = new World(level, sprites, { radioTexts: radio.ru });
    const voices: [number, string][] = [];
    let ticker = "";
    for (let t = 0; t < 1200; t++) {
      for (const p of w.players) p.invulnerable = 2;
      w.step([fire]);
      for (const e of w.events) if (e.kind === "voice") voices.push([w.tick, e.wav]);
      w.events.length = 0;
      if (w.radio.ticker.includes("Космическую")) ticker = w.radio.ticker;
    }
    // Notruf 5001 ms statt 4598 ms; die Stimme heißt wie in `SkyfightR.txt`
    expect(voices[0]).toEqual([72, "SkyfightRU_notruf.wav"]);
    expect(ticker).toContain("Космическую станцию атакуют!");
    // …und diese Aufnahme gibt es nicht: der Ton bleibt aus, die englische liegt daneben
    expect(hasVoice("level1-1_skyfight", "SkyfightRU_notruf.wav")).toBe(false);
    expect(hasVoice("level1-1_skyfight", "SkyfightE_notruf.wav")).toBe(true);
  });

  test("nur die drei gleichnamigen Escape-Aufnahmen der russischen Fassung liegen vor", async () => {
    const radio = (await loadTestRadio("level7-5_escape"))!;
    const wavs = Object.values(radio.ru)
      .flat()
      .map((l) => l.wav);
    expect(wavs.map((w) => hasVoice("level7-5_escape", w))).toEqual(wavs.map(() => true));
    expect(wavs.some((w) => /RU_/i.test(w))).toBe(false);
  });
});
