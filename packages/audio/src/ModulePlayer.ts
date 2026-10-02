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
}

export class ModulePlayer {
  private node: AudioWorkletNode | undefined;
  private readonly ready: Promise<void>;
  readonly output: GainNode;

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
      node.port.addEventListener("message", (e: MessageEvent<{ cmd: string }>) => {
        if (e.data.cmd === "err") console.warn("ModulePlayer:", e.data);
      });
      node.port.start();
      this.node = node;
      this.send({
        cmd: "config",
        val: {
          repeatCount: -1,
          stereoSeparation: 100,
          // Interpolationsfilter 1 = keine (am nächsten an BASS 0.8, Spec R4).
          interpolationFilter: 1,
        },
      });
      node.connect(this.output);
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

  /** Nachricht an den Worklet-Prozessor. */
  private send(message: { cmd: string; val?: unknown }): void {
    // MessagePort kennt kein targetOrigin — die Regel gilt nur für Window.postMessage.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    this.node?.port.postMessage(message);
  }

  /** Spielt ein Modul in Endlosschleife. */
  play(module: Uint8Array): void {
    this.send({ cmd: "repeatCount", val: -1 });
    this.send({ cmd: "play", val: module.slice().buffer });
    this.setVolume(1);
  }

  stop(): void {
    this.send({ cmd: "stop" });
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

  dispose(): void {
    this.stop();
    this.node?.disconnect();
    this.output.disconnect();
  }
}
