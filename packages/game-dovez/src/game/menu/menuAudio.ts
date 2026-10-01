import { SfxPool, StreamPlayer } from "@clove/audio";
import type { GameHost } from "@clove/core";
import { dbGain } from "../config";

/**
 * Töne und Musik außerhalb der Level (`LoadMenuSound`: `dude`, `plingding`,
 * `speech`; `Logo.wav`; `intro.ogg` in Endlosschleife). Das HTML-Menü der
 * Shell spielt sie über `sounds` der Bildschirme.
 */
export class MenuAudio {
  readonly music: StreamPlayer;
  private constructor(
    private readonly host: GameHost,
    private readonly sfx: SfxPool,
  ) {
    this.music = new StreamPlayer(host.audio!.context, host.audio!.music);
  }

  static async create(host: GameHost): Promise<MenuAudio | undefined> {
    if (!host.audio) return undefined;
    const sfx = new SfxPool(host.audio.context, host.audio.sfx, { maxVoices: 8, maxPerSound: 2 });
    await Promise.all(
      ["sound/dude", "sound/plingding", "sound/speech", "sound/logo"].map(async (id) => {
        try {
          if (host.assets.has(id)) await sfx.load(id, await host.assets.bytes(id));
        } catch {
          // nicht dekodierbar: stumm
        }
      }),
    );
    return new MenuAudio(host, sfx);
  }

  play(name: string, db: number): void {
    this.sfx.play(`sound/${name}`, 0, dbGain(db));
  }

  stop(name: string): void {
    this.sfx.stop(`sound/${name}`);
  }

  /** `intro.ogg` von vorn, in Schleife, auf dem Musikpegel. */
  startMusic(level: number): void {
    const id = "music/intro";
    this.music.stop();
    this.music.setVolume(level / 100);
    if (this.host.assets.has(id)) this.music.play(this.host.assets.url(id), true);
  }

  dispose(): void {
    this.music.dispose();
    this.sfx.stopAll();
  }
}
