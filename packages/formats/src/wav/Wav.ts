/**
 * RIFF/WAVE lesen und als PCM16 schreiben.
 *
 * DOVE liefert 14 Sounds als MS-ADPCM (4 bit) und 6 als PCM 8 bit — Browser
 * dekodieren MS-ADPCM nicht, daher wandelt die Asset-Pipeline alles nach PCM16.
 * Unterstützt werden PCM 8/16 bit und MS-ADPCM, jeweils mono oder stereo.
 */

export interface WavInfo {
  readonly format: number;
  readonly channels: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly blockAlign: number;
  /** Samples pro Kanal laut `fact`-Chunk, falls vorhanden. */
  readonly factSamples?: number;
}

export interface PcmAudio {
  readonly sampleRate: number;
  readonly channels: number;
  /** Interleaved, `frames · channels` Werte. */
  readonly samples: Int16Array;
}

export class WavError extends Error {
  override name = "WavError";
}

export const WAVE_FORMAT_PCM = 1;
export const WAVE_FORMAT_ADPCM = 2;

const ADAPTATION = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];

interface Chunks {
  info: WavInfo;
  fmt: DataView;
  data: Uint8Array;
}

function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

function readChunks(bytes: Uint8Array): Chunks {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") {
    throw new WavError("keine RIFF/WAVE-Datei");
  }
  let fmt: DataView | undefined;
  let data: Uint8Array | undefined;
  let factSamples: number | undefined;
  let p = 12;
  while (p + 8 <= bytes.byteLength) {
    const id = ascii(bytes, p);
    const size = view.getUint32(p + 4, true);
    const start = p + 8;
    if (start + size > bytes.byteLength) throw new WavError(`Chunk '${id}' abgeschnitten`);
    if (id === "fmt ") fmt = new DataView(bytes.buffer, bytes.byteOffset + start, size);
    else if (id === "data") data = bytes.subarray(start, start + size);
    else if (id === "fact" && size >= 4) factSamples = view.getUint32(start, true);
    p = start + size + (size & 1);
  }
  if (!fmt || fmt.byteLength < 16) throw new WavError("fmt-Chunk fehlt");
  if (!data) throw new WavError("data-Chunk fehlt");
  const info: WavInfo = {
    format: fmt.getUint16(0, true),
    channels: fmt.getUint16(2, true),
    sampleRate: fmt.getUint32(4, true),
    blockAlign: fmt.getUint16(12, true),
    bitsPerSample: fmt.getUint16(14, true),
    ...(factSamples === undefined ? {} : { factSamples }),
  };
  if (info.channels < 1 || info.channels > 2) {
    throw new WavError(`${info.channels} Kanäle werden nicht unterstützt`);
  }
  return { info, fmt, data };
}

export function readWavInfo(bytes: Uint8Array): WavInfo {
  return readChunks(bytes).info;
}

function clamp16(v: number): number {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}

function decodeMsAdpcm(info: WavInfo, fmt: DataView, data: Uint8Array): Int16Array {
  const ch = info.channels;
  if (fmt.byteLength < 22) throw new WavError("MS-ADPCM: fmt-Erweiterung fehlt");
  const samplesPerBlock = fmt.getUint16(18, true);
  const numCoef = fmt.getUint16(20, true);
  if (fmt.byteLength < 22 + numCoef * 4) throw new WavError("MS-ADPCM: Koeffiziententabelle fehlt");
  const coef1: number[] = [];
  const coef2: number[] = [];
  for (let i = 0; i < numCoef; i++) {
    coef1.push(fmt.getInt16(22 + i * 4, true));
    coef2.push(fmt.getInt16(24 + i * 4, true));
  }
  const header = 7 * ch;
  if (info.blockAlign <= header) throw new WavError(`MS-ADPCM: blockAlign ${info.blockAlign}`);
  if (samplesPerBlock !== ((info.blockAlign - header) * 8) / (4 * ch) + 2) {
    throw new WavError(`MS-ADPCM: samplesPerBlock ${samplesPerBlock} passt nicht zu blockAlign`);
  }

  const frames: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const c1 = new Int32Array(ch);
  const c2 = new Int32Array(ch);
  const delta = new Int32Array(ch);
  const s1 = new Int32Array(ch);
  const s2 = new Int32Array(ch);

  for (let block = 0; block + header <= data.byteLength; block += info.blockAlign) {
    const end = Math.min(block + info.blockAlign, data.byteLength);
    for (let c = 0; c < ch; c++) {
      const predictor = data[block + c] as number;
      if (predictor >= numCoef) throw new WavError(`MS-ADPCM: Prädiktor ${predictor}`);
      c1[c] = coef1[predictor] as number;
      c2[c] = coef2[predictor] as number;
      delta[c] = view.getInt16(block + ch + c * 2, true);
      s1[c] = view.getInt16(block + 3 * ch + c * 2, true);
      s2[c] = view.getInt16(block + 5 * ch + c * 2, true);
    }
    for (let c = 0; c < ch; c++) frames.push(s2[c] as number);
    for (let c = 0; c < ch; c++) frames.push(s1[c] as number);
    let c = 0;
    for (let p = block + header; p < end; p++) {
      const byte = data[p] as number;
      for (const nibble of [byte >> 4, byte & 0x0f]) {
        const signed = nibble >= 8 ? nibble - 16 : nibble;
        const d = delta[c] as number;
        const predicted =
          ((s1[c] as number) * (c1[c] as number) + (s2[c] as number) * (c2[c] as number)) >> 8;
        const sample = clamp16(predicted + signed * d);
        s2[c] = s1[c] as number;
        s1[c] = sample;
        delta[c] = Math.max(16, ((ADAPTATION[nibble] as number) * d) >> 8);
        frames.push(sample);
        c = (c + 1) % ch;
      }
    }
  }
  let out = Int16Array.from(frames);
  if (info.factSamples !== undefined && info.factSamples * ch < out.length) {
    out = out.slice(0, info.factSamples * ch);
  }
  return out;
}

/** Dekodiert PCM 8/16 bit oder MS-ADPCM nach interleaved PCM16. */
export function decodeWav(bytes: Uint8Array): PcmAudio {
  const { info, fmt, data } = readChunks(bytes);
  const { channels, sampleRate } = info;
  if (info.format === WAVE_FORMAT_PCM && info.bitsPerSample === 8) {
    const samples = new Int16Array(data.byteLength);
    for (let i = 0; i < data.byteLength; i++) samples[i] = ((data[i] as number) - 128) << 8;
    return { sampleRate, channels, samples };
  }
  if (info.format === WAVE_FORMAT_PCM && info.bitsPerSample === 16) {
    const samples = new Int16Array(data.byteLength >> 1);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
    return { sampleRate, channels, samples };
  }
  if (info.format === WAVE_FORMAT_ADPCM && info.bitsPerSample === 4) {
    return { sampleRate, channels, samples: decodeMsAdpcm(info, fmt, data) };
  }
  throw new WavError(`Format ${info.format} mit ${info.bitsPerSample} bit wird nicht unterstützt`);
}

/** Schreibt eine kanonische 44-Byte-Header-WAV mit PCM16. */
export function encodeWavPcm16(audio: PcmAudio): Uint8Array {
  const dataBytes = audio.samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, WAVE_FORMAT_PCM, true);
  view.setUint16(22, audio.channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * audio.channels * 2, true);
  view.setUint16(32, audio.channels * 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < audio.samples.length; i++)
    view.setInt16(44 + i * 2, audio.samples[i] as number, true);
  return out;
}
