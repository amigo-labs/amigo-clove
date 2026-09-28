import { SfxPool, StreamPlayer } from "@clove/audio";
import type { AssetStore, AudioHost } from "@clove/core";
import { dovezSlug } from "@clove/formats";
import type { World } from "../sim/world";

/**
 * Ton für DoveZ (DirectSound über dx7vb, Musik über vbogg): spielt die
 * Ereignisse der Simulation einmal pro Frame, dedupliziert, und streamt
 * die Levelmusik. Befund: `docs/measurements/dovez-runtime.md` („Ton“).
 *
 * Pegel wie die Vorgaben des Originals (Hundertstel dB, `10^(v/2000)`):
 * Engine-Effekte −1000 (0,316), Level-Töne und Funkstimmen 0 (1,0), Musik 90 %.
 */
const SFX_GAIN = 10 ** (-1000 / 2000);
const SPEECH_GAIN = 1;
const MUSIC_GAIN = 0.9;

export class DovezAudio {
  /** Laufende Schleifen der Level-Töne je Index (`SpielSoundOFF` hält sie an). */
  private readonly loops = new Map<number, () => void>();
  /** Laufende Schleifen der Engine-Effekte je Name (Boss-Finale, Waffen, Beam-Laden). */
  private readonly sfxLoops = new Map<string, { stop(): void; setRate(rate: number): void }>();
  private voice: string | undefined;

  private constructor(
    private readonly assets: AssetStore,
    private readonly sfx: SfxPool,
    private readonly music: StreamPlayer,
    private readonly slug: string,
  ) {}

  /** Lädt die 84 Effekte (`core`) und die Stimmen des Levels (`voice/<slug>`). */
  static async create(host: AudioHost, assets: AssetStore, slug: string): Promise<DovezAudio> {
    const sfx = new SfxPool(host.context, host.sfx, { maxVoices: 24, maxPerSound: 6 });
    const ids = [
      ...assets.bundle("core").filter((id) => id.startsWith("sound/")),
      ...assets.bundle(`voice/${slug}`),
    ];
    await Promise.all(
      ids.map(async (id) => {
        try {
          await sfx.load(id, await assets.bytes(id));
        } catch {
          // nicht dekodierbar (z. B. Opus in altem Safari): stumm weiter
        }
      }),
    );
    return new DovezAudio(assets, sfx, new StreamPlayer(host.context, host.music), slug);
  }

  /** Levelmusik (`music` im Level-Skript, Endung weg), Schleife per Neustart. */
  playMusic(file: string): void {
    const id = `music/${dovezSlug(file)}`;
    if (this.assets.has(id)) this.music.play(this.assets.url(id), true);
  }

  /** Einmal pro Frame nach den Simulationsticks; leert `world.events` nicht. */
  update(world: World): void {
    this.music.setVolume((MUSIC_GAIN * world.musicVolume) / 100);
    const seen = new Set<string>();
    for (const e of world.events) {
      const key = JSON.stringify(e);
      if (seen.has(key)) continue;
      seen.add(key);
      switch (e.kind) {
        case "sfx":
          this.sfx.play(`sound/${e.name}`, 0, SFX_GAIN);
          break;
        case "sfxLoop": {
          const loop = this.sfxLoops.get(e.name);
          if (e.on) {
            if (loop) loop.setRate(e.rate ?? 1);
            else
              this.sfxLoops.set(
                e.name,
                this.sfx.loopHandle(`sound/${e.name}`, SFX_GAIN, e.rate ?? 1),
              );
          } else {
            loop?.stop();
            this.sfxLoops.delete(e.name);
          }
          break;
        }
        case "sound": {
          const file = world.level.sounds[e.sound]?.file;
          if (!file) break;
          const id = `sound/${dovezSlug(file)}`;
          if (e.mode === 1) {
            if (this.loops.has(e.sound) && !e.rewind) break;
            this.loops.get(e.sound)?.();
            this.loops.set(e.sound, this.sfx.loop(id, SPEECH_GAIN));
          } else this.sfx.play(id, 0, e.sfx ? SFX_GAIN : SPEECH_GAIN);
          break;
        }
        case "stopSound": {
          this.loops.get(e.sound)?.();
          this.loops.delete(e.sound);
          const file = world.level.sounds[e.sound]?.file;
          if (file) this.sfx.stop(`sound/${dovezSlug(file)}`);
          break;
        }
        case "soundOff":
          for (const stop of this.loops.values()) stop();
          this.loops.clear();
          for (const loop of this.sfxLoops.values()) loop.stop();
          this.sfxLoops.clear();
          break;
        case "voice":
          this.stopVoice();
          this.voice = `voice/${this.slug}/${dovezSlug(e.wav)}`;
          this.sfx.play(this.voice, 0, SPEECH_GAIN);
          break;
        case "voiceStop":
          this.stopVoice();
          break;
      }
    }
  }

  private stopVoice(): void {
    if (this.voice) this.sfx.stop(this.voice);
    this.voice = undefined;
  }

  dispose(): void {
    for (const stop of this.loops.values()) stop();
    for (const loop of this.sfxLoops.values()) loop.stop();
    this.sfx.stopAll();
    this.music.dispose();
  }
}
