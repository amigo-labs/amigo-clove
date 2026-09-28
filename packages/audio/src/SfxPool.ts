/**
 * Soundeffekte aus vorab dekodierten `AudioBuffer`n, nie `<audio>`.
 *
 * Stimmenbegrenzung — 3 je Sound wie BASS im Original, 8 insgesamt, jeweils
 * weicht die älteste — und eine optionale Sperrzeit verhindern Salven, etwa
 * wenn nach einem Catch-up mehrere Ticks denselben Effekt auslösen. Die
 * Deduplikation pro Frame macht der Aufrufer (Spec R4).
 */
export interface SfxOptions {
  readonly maxVoices?: number;
  /** Höchstens so viele gleichzeitige Stimmen je Sound (BASS: `max = 3`, älteste weicht). */
  readonly maxPerSound?: number;
  /** Mindestabstand zwischen zwei Starts desselben Sounds in Sekunden. */
  readonly cooldown?: number;
}

interface Voice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly started: number;
}

export class SfxPool {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastStart = new Map<string, number>();
  private voices: Voice[] = [];
  private readonly maxVoices: number;
  private readonly cooldown: number;
  private readonly maxPerSound: number;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly output: AudioNode,
    options: SfxOptions = {},
  ) {
    this.maxVoices = options.maxVoices ?? 8;
    this.cooldown = options.cooldown ?? 0;
    this.maxPerSound = options.maxPerSound ?? 3;
  }

  async load(id: string, bytes: Uint8Array): Promise<void> {
    if (this.buffers.has(id)) return;
    // decodeAudioData übernimmt den Buffer — Kopie, damit der Aufrufer seine Bytes behält.
    const copy = bytes.slice().buffer;
    this.buffers.set(id, await this.context.decodeAudioData(copy));
  }

  has(id: string): boolean {
    return this.buffers.has(id);
  }

  /**
   * Spielt `id` ab; `pan` −1…1, `volume` 0…1, `rate` Abspieltempo (Tonhöhe).
   * Liefert `false`, wenn unterdrückt.
   */
  play(id: string, pan = 0, volume = 1, rate = 1): boolean {
    const buffer = this.buffers.get(id);
    if (!buffer || buffer.length === 0) return false;
    const now = this.context.currentTime;
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < this.cooldown) return false;
    this.lastStart.set(id, now);

    this.voices = this.voices.filter((v) => v.started + (v.source.buffer?.duration ?? 0) > now);
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= this.maxPerSound) {
      same[0]!.source.stop();
      this.voices.splice(this.voices.indexOf(same[0]!), 1);
    }
    if (this.voices.length >= this.maxVoices) {
      const oldest = this.voices.shift();
      oldest?.source.stop();
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(gain).connect(panner).connect(this.output);
    source.start();
    this.voices.push({ id, source, started: now });
    return true;
  }

  /** Endlosschleife (z. B. der blaue Laser); liefert die Stopp-Funktion. */
  loop(id: string, volume = 1, rate = 1): () => void {
    return this.loopHandle(id, volume, rate).stop;
  }

  /** Endlosschleife mit veränderlicher Abspielrate (z. B. der Ladeton des Beams). */
  loopHandle(id: string, volume = 1, rate = 1): { stop(): void; setRate(rate: number): void } {
    const buffer = this.buffers.get(id);
    if (!buffer || buffer.length === 0) return { stop: () => {}, setRate: () => {} };
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.output);
    source.start();
    return {
      stop: () => {
        source.stop();
        gain.disconnect();
      },
      setRate: (r) => {
        source.playbackRate.value = r;
      },
    };
  }

  /** Hält alle laufenden Stimmen eines Sounds an (nicht die Schleifen aus `loop`). */
  stop(id: string): void {
    this.voices = this.voices.filter((v) => {
      if (v.id !== id) return true;
      v.source.stop();
      return false;
    });
  }

  stopAll(): void {
    for (const v of this.voices) v.source.stop();
    this.voices = [];
  }

  get activeVoices(): number {
    return this.voices.length;
  }
}
