/**
 * Ein AudioContext, drei Pegel: Master → Musik, Effekte. Die Shell erzeugt den
 * Bus (bei der ersten Nutzergeste), das Spiel spielt nur über ihn ab.
 */
export class AudioBus {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;

  constructor(readonly context: AudioContext) {
    this.master = context.createGain();
    this.music = context.createGain();
    this.sfx = context.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(context.destination);
  }

  /** Browser starten Kontexte ohne Nutzergeste angehalten. */
  resume(): Promise<void> {
    return this.context.state === "suspended" ? this.context.resume() : Promise.resolve();
  }

  setVolume(channel: "master" | "music" | "sfx", value: number): void {
    this[channel].gain.value = Math.max(0, Math.min(1, value));
  }

  dispose(): void {
    this.master.disconnect();
    void this.context.close();
  }
}
