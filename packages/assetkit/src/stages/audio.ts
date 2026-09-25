import { decodeWav, encodeWavPcm16 } from "@clove/formats";

export const SOUND_CONVERTER_VERSION = 1;

export interface SoundResult {
  readonly bytes: Uint8Array;
  readonly sampleRate: number;
  readonly channels: number;
  readonly frames: number;
}

/**
 * MS-ADPCM / PCM8 → PCM16-WAV. Abtastrate bleibt original (8000–22050 Hz);
 * `decodeAudioData` resampelt im Browser ohnehin auf die Kontextrate.
 */
export function convertSound(wav: Uint8Array): SoundResult {
  const audio = decodeWav(wav);
  return {
    bytes: encodeWavPcm16(audio),
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    frames: audio.samples.length / audio.channels,
  };
}
