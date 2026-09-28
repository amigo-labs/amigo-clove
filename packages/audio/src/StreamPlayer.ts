/**
 * Gestreamte Musik (DoveZ: Vorbis-OGG, unverändert) über ein `<audio>`-Element
 * an einem `MediaElementAudioSourceNode`. `decodeAudioData` käme für 61 MB
 * Musik auf ~600 MB PCM (Spec „Ton, Musik, Video“). Ein Element je Player;
 * ein neues Stück ersetzt das laufende.
 */
export class StreamPlayer {
  private readonly element: HTMLAudioElement;
  private readonly source: MediaElementAudioSourceNode;
  private readonly gain: GainNode;
  private current: string | undefined;

  constructor(
    private readonly context: AudioContext,
    output: AudioNode,
  ) {
    this.element = new Audio();
    this.element.preload = "auto";
    this.element.crossOrigin = "anonymous";
    this.source = context.createMediaElementSource(this.element);
    this.gain = context.createGain();
    this.source.connect(this.gain).connect(output);
  }

  /** Spielt `url`; dieselbe URL läuft ungestört weiter. */
  play(url: string, loop = true): void {
    this.element.loop = loop;
    if (url === this.current && !this.element.paused) return;
    this.current = url;
    this.element.src = url;
    this.element.currentTime = 0;
    void this.element.play().catch(() => {});
  }

  stop(): void {
    this.current = undefined;
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
  }

  /** Pegel 0…1, optional als Rampe über `seconds`. */
  setVolume(volume: number, seconds = 0): void {
    const v = Math.max(0, Math.min(1, volume));
    const g = this.gain.gain;
    const now = this.context.currentTime;
    g.cancelScheduledValues(now);
    if (seconds <= 0) g.value = v;
    else {
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(v, now + seconds);
    }
  }

  get playing(): string | undefined {
    return this.element.paused ? undefined : this.current;
  }

  dispose(): void {
    this.stop();
    this.source.disconnect();
    this.gain.disconnect();
  }
}
