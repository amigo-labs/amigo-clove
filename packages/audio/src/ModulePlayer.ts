/**
 * Tracker-Module (XM/IT) über libopenmpt im AudioWorklet.
 *
 * Verwendet den Worklet-Prozessor `libopenmpt-processor` aus `chiptune3`
 * (libopenmpt 0.8.7, BSD; Wrapper MIT). Die Worklet-Dateien liefert die Shell
 * unter `workletUrl` aus (siehe `packages/shell/vite.config.ts`), damit ihre
 * relativen Importe erhalten bleiben. Module bleiben unverändert — nahtlose
 * Loops macht libopenmpt nativ.
 */
export interface ModulePlayerOptions {
  /** URL von `chiptune3.worklet.js`. */
  readonly workletUrl: string;
  /** libopenmpt-Interpolationsfilter: 1 = keine (am nächsten an BASS 0.8, Spec R4). */
  readonly interpolationFilter?: number;
  readonly stereoSeparation?: number;
}

export class ModulePlayer {
  private node: AudioWorkletNode | undefined;
  private readonly ready: Promise<void>;
  readonly output: GainNode;
  private endedHandler: (() => void) | undefined;

  private constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    options: ModulePlayerOptions,
  ) {
    this.output = context.createGain();
    this.output.connect(destination);
    this.ready = context.audioWorklet.addModule(options.workletUrl).then(() => {
      const node = new AudioWorkletNode(context, "libopenmpt-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.port.onmessage = (e: MessageEvent<{ cmd: string }>) => {
        if (e.data.cmd === "end") this.endedHandler?.();
        if (e.data.cmd === "err") console.warn("ModulePlayer:", e.data);
      };
      node.port.postMessage({
        cmd: "config",
        val: {
          repeatCount: -1,
          stereoSeparation: options.stereoSeparation ?? 100,
          interpolationFilter: options.interpolationFilter ?? 1,
        },
      });
      node.connect(this.output);
      this.node = node;
    });
  }

  static async create(
    context: AudioContext,
    destination: AudioNode,
    options: ModulePlayerOptions,
  ): Promise<ModulePlayer> {
    const player = new ModulePlayer(context, destination, options);
    await player.ready;
    return player;
  }

  /** Spielt ein Modul; `loop = false` spielt es einmal (z. B. Game-Over-Jingle). */
  play(module: Uint8Array, loop = true): void {
    this.node?.port.postMessage({ cmd: "repeatCount", val: loop ? -1 : 0 });
    this.node?.port.postMessage({ cmd: "play", val: module.slice().buffer });
    this.setVolume(1);
  }

  stop(): void {
    this.node?.port.postMessage({ cmd: "stop" });
  }

  pause(paused: boolean): void {
    this.node?.port.postMessage({ cmd: paused ? "pause" : "unpause" });
  }

  setVolume(value: number): void {
    this.output.gain.cancelScheduledValues(this.context.currentTime);
    this.output.gain.value = value;
  }

  /** Lineares Ausblenden (Original: über 100 Ticks vor dem Boss). */
  fadeOut(seconds: number): void {
    const g = this.output.gain;
    const now = this.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + seconds);
  }

  onEnded(handler: () => void): void {
    this.endedHandler = handler;
  }

  dispose(): void {
    this.stop();
    this.node?.disconnect();
    this.output.disconnect();
  }
}
