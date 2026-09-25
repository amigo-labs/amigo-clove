import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  WAVE_FORMAT_ADPCM,
  WAVE_FORMAT_PCM,
  WavError,
  decodeWav,
  encodeWavPcm16,
  readWavInfo,
} from "../src/index";
import { DOVE_DATA, readBytes } from "./fixtures";

const SOUND = join(DOVE_DATA, "Sound");
const SOUNDS = readdirSync(SOUND).toSorted();

interface Chunk {
  id: string;
  body: Uint8Array;
}

/** Minimaler RIFF-Schreiber, nur für Tests. */
function riff(chunks: Chunk[]): Uint8Array {
  const size = chunks.reduce((n, c) => n + 8 + c.body.length + (c.body.length & 1), 4);
  const out = new Uint8Array(8 + size);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) =>
    out.set(
      [...s].map((ch) => ch.charCodeAt(0)),
      at,
    );
  tag(0, "RIFF");
  v.setUint32(4, size, true);
  tag(8, "WAVE");
  let p = 12;
  for (const c of chunks) {
    tag(p, c.id);
    v.setUint32(p + 4, c.body.length, true);
    out.set(c.body, p + 8);
    p += 8 + c.body.length + (c.body.length & 1);
  }
  return out;
}

function adpcmFmt(blockAlign: number): Uint8Array {
  const coefs = [256, 0, 512, -256, 0, 0, 192, 64, 240, 0, 460, -208, 392, -232];
  const body = new Uint8Array(22 + coefs.length * 2);
  const v = new DataView(body.buffer);
  v.setUint16(0, WAVE_FORMAT_ADPCM, true);
  v.setUint16(2, 1, true);
  v.setUint32(4, 22050, true);
  v.setUint16(12, blockAlign, true);
  v.setUint16(14, 4, true);
  v.setUint16(16, 4 + coefs.length * 2, true);
  v.setUint16(18, (blockAlign - 7) * 2 + 2, true);
  v.setUint16(20, coefs.length / 2, true);
  coefs.forEach((c, i) => v.setInt16(22 + i * 2, c, true));
  return body;
}

function fact(n: number): Chunk {
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, n, true);
  return { id: "fact", body };
}

describe("MS-ADPCM", () => {
  test("synthetischer Block: Kopf-Samples, Prädiktion, Delta-Adaption", () => {
    // Prädiktor 0 (256, 0), delta 16, sample1 100, sample2 50, Nibbles 1 und -1.
    const block = new Uint8Array([0, 16, 0, 100, 0, 50, 0, 0x1f]);
    const audio = decodeWav(
      riff([
        { id: "fmt ", body: adpcmFmt(8) },
        { id: "data", body: block },
      ]),
    );
    expect([...audio.samples]).toEqual([50, 100, 116, 100]);
  });

  test("fact kürzt, verlängert aber nie", () => {
    const data = { id: "data", body: new Uint8Array([0, 16, 0, 100, 0, 50, 0, 0x1f]) };
    const fmt = { id: "fmt ", body: adpcmFmt(8) };
    expect(decodeWav(riff([fmt, fact(3), data])).samples.length).toBe(3);
    expect(decodeWav(riff([fmt, fact(99), data])).samples.length).toBe(4);
  });

  test("falsches samplesPerBlock wird abgelehnt", () => {
    const fmt = adpcmFmt(8);
    new DataView(fmt.buffer).setUint16(18, 5, true);
    expect(() =>
      decodeWav(
        riff([
          { id: "fmt ", body: fmt },
          { id: "data", body: new Uint8Array(8) },
        ]),
      ),
    ).toThrow(WavError);
  });
});

describe("PCM", () => {
  test("8 bit unsigned → PCM16", () => {
    const fmt = new Uint8Array(16);
    const v = new DataView(fmt.buffer);
    v.setUint16(0, WAVE_FORMAT_PCM, true);
    v.setUint16(2, 1, true);
    v.setUint32(4, 8000, true);
    v.setUint16(12, 1, true);
    v.setUint16(14, 8, true);
    const audio = decodeWav(
      riff([
        { id: "fmt ", body: fmt },
        { id: "data", body: new Uint8Array([0, 128, 255]) },
      ]),
    );
    expect(audio.sampleRate).toBe(8000);
    expect([...audio.samples]).toEqual([-32768, 0, 32512]);
  });

  test("encodeWavPcm16 ↔ decodeWav", () => {
    const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
    const bytes = encodeWavPcm16({ sampleRate: 11025, channels: 2, samples });
    expect(bytes.length).toBe(44 + samples.length * 2);
    const back = decodeWav(bytes);
    expect(back.sampleRate).toBe(11025);
    expect(back.channels).toBe(2);
    expect([...back.samples]).toEqual([...samples]);
  });
});

describe("DOVE-Sounds", () => {
  test("Inventar: 15× MS-ADPCM, 5× PCM 8 bit, alle mono (Spec sagte 14/6)", async () => {
    const formats = { adpcm: 0, pcm8: 0 };
    for (const name of SOUNDS) {
      const info = readWavInfo(await readBytes(join(SOUND, name)));
      expect(info.channels).toBe(1);
      if (info.format === WAVE_FORMAT_ADPCM) formats.adpcm++;
      else if (info.format === WAVE_FORMAT_PCM && info.bitsPerSample === 8) formats.pcm8++;
    }
    expect(SOUNDS.length).toBe(20);
    expect(formats).toEqual({ adpcm: 15, pcm8: 5 });
  });

  test.each(SOUNDS)("%s dekodiert vollständig", async (name) => {
    const bytes = await readBytes(join(SOUND, name));
    const info = readWavInfo(bytes);
    const audio = decodeWav(bytes);
    expect(audio.sampleRate).toBe(info.sampleRate);
    if (info.format === WAVE_FORMAT_ADPCM) {
      // Die data-Chunks enthalten nur ganze Blöcke. Der fact-Chunk ist in den
      // Originalen oft veraltet (Dateien wurden nach dem Kodieren gekürzt) und
      // nennt mehr Samples, als vorhanden sind — nie weniger.
      const perBlock = (info.blockAlign - 7) * 2 + 2;
      expect(audio.samples.length % perBlock).toBe(0);
      expect(audio.samples.length).toBeLessThanOrEqual(info.factSamples ?? Infinity);
      expect(audio.samples.some((s) => s !== 0)).toBe(true);
    }
  });

  test("domination.wav ist leer", async () => {
    expect(decodeWav(await readBytes(join(SOUND, "domination.wav"))).samples.length).toBe(0);
  });
});
