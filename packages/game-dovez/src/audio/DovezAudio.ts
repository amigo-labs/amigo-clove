import { SfxPool, StreamPlayer } from "@clove/audio";
import type { AssetStore, AudioHost } from "@clove/core";
import { dovezSlug } from "@clove/formats";
import type { AudioGains } from "../game/config";
import type { World } from "../sim/world";

/**
 * Ton für DoveZ (DirectSound über dx7vb, Musik über vbogg): spielt die
 * Ereignisse der Simulation einmal pro Frame, dedupliziert, und streamt
 * die Levelmusik. Befund: `docs/measurements/dovez-runtime.md` („Ton“).
 *
 * Pegel aus den Optionen (`game/config.ts`, Hundertstel dB, `10^(v/2000)`),
 * Vorgaben des Originals: Engine-Effekte −1000 (0,316), Level-Töne und
 * Funkstimmen 0 (1,0), Musik 90 %.
 */
const DEFAULT_GAINS: AudioGains = { sfx: 10 ** (-1000 / 2000), speech: 1, music: 0.9 };

export class DovezAudio {
  /** Laufende Schleifen der Level-Töne je Index (`SpielSoundOFF` hält sie an). */
  private readonly loops = new Map<number, () => void>();
  /** Laufende Schleifen der Engine-Effekte je Name (Boss-Finale, Waffen, Beam-Laden). */
  private readonly sfxLoops = new Map<string, { stop(): void; setRate(rate: number): void }>();
  private voice: string | undefined;
  /** Startzeit der laufenden Funkstimme (AudioContext-Zeit). */
  private voiceStarted = 0;
  /** In der Pause angehaltene Funkstimme und ihre Position in s. */
  private pausedVoice: { id: string; at: number } | undefined;
  /** In der Pause angehaltene Effekt-Schleifen. */
  private pausedLoops: string[] = [];

  private constructor(
    private readonly context: BaseAudioContext,
    private readonly assets: AssetStore,
    private readonly sfx: SfxPool,
    private readonly music: StreamPlayer,
    private readonly slug: string,
    private readonly gains: AudioGains,
  ) {}

  /** Lädt die 84 Effekte (`core`) und die Stimmen des Levels (`voice/<slug>`). */
  static async create(
    host: AudioHost,
    assets: AssetStore,
    slug: string,
    gains: AudioGains = DEFAULT_GAINS,
  ): Promise<DovezAudio> {
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
    return new DovezAudio(
      host.context,
      assets,
      sfx,
      new StreamPlayer(host.context, host.music),
      slug,
      gains,
    );
  }

  /**
   * Levelmusik (`music` im Level-Skript, Endung weg), Schleife per Neustart;
   * `restart` beginnt sie von vorn (`PlayOggFile` nach Continue).
   */
  playMusic(file: string, restart = false): void {
    const id = `music/${dovezSlug(file)}`;
    if (restart) this.music.stop();
    if (this.assets.has(id)) this.music.play(this.assets.url(id), true);
  }

  /** Continue: `Continue.ogg` einmal auf vollem Musikpegel (`StopOgg` vorher). */
  playContinueMusic(): void {
    this.music.stop();
    this.music.setVolume(this.gains.music);
    if (this.assets.has("music/continue"))
      this.music.play(this.assets.url("music/continue"), false);
  }

  stopMusic(): void {
    this.music.stop();
  }

  /** Levelende: `SpielSoundOFF` (Schleifen aus) und `StopOgg`. */
  stopLevel(): void {
    for (const stop of this.loops.values()) stop();
    this.loops.clear();
    for (const loop of this.sfxLoops.values()) loop.stop();
    this.sfxLoops.clear();
    this.music.stop();
  }

  /** Speicherbildschirm: `Save_Screen.ogg` auf dem Musikpegel, Schleife. */
  playSaveMusic(): void {
    this.music.setVolume(this.gains.music);
    if (this.assets.has("music/save_screen"))
      this.music.play(this.assets.url("music/save_screen"), true);
  }

  /** Engine-Effekt (−10 dB) oder mit `speech` auf Sprachpegel (0 dB), z. B. `speech.wav`. */
  effect(name: string, speech = false): void {
    this.sfx.play(`sound/${name}`, 0, speech ? this.gains.speech : this.gains.sfx);
  }

  /**
   * Pause beginnt: `SpielSoundOFF` (Level-Schleifen aus, sie kommen nicht
   * wieder), Funkstimme anhalten und Position merken, Musik stumm (läuft
   * weiter), `Pause.wav`. Die Effekt-Schleifen der Waffen und des Bosses
   * stoppen ebenfalls; `resume` startet sie neu (das Original fragt ihren
   * Puffer je Tick ab und startet ihn wieder).
   */
  pause(): void {
    for (const stop of this.loops.values()) stop();
    this.loops.clear();
    this.pausedLoops = [...this.sfxLoops.keys()];
    for (const loop of this.sfxLoops.values()) loop.stop();
    this.sfxLoops.clear();
    if (this.voice) {
      const at = this.context.currentTime - this.voiceStarted;
      if (at < this.sfx.duration(this.voice)) this.pausedVoice = { id: this.voice, at };
      this.stopVoice();
    }
    this.music.setVolume(0);
    this.effect("pause");
  }

  /**
   * Pause endet. `restore` (mit „WEITER“ verlassen): `Pause.wav` und die
   * Funkstimme an der gemerkten Stelle; den Musikpegel setzt `update` zurück.
   */
  resume(restore: boolean): void {
    for (const name of this.pausedLoops)
      this.sfxLoops.set(name, this.sfx.loopHandle(`sound/${name}`, this.gains.sfx));
    this.pausedLoops = [];
    const v = this.pausedVoice;
    this.pausedVoice = undefined;
    if (!restore) return;
    this.effect("pause");
    if (v) {
      this.voice = v.id;
      this.voiceStarted = this.context.currentTime - v.at;
      this.sfx.play(v.id, 0, this.gains.speech, 1, v.at);
    }
  }

  /** Einmal pro Frame nach den Simulationsticks; leert `world.events` nicht. */
  update(world: World): void {
    // Super-Nova: Musik auf 1/10 des Optionspegels (`MusikLautstärke([0x588084] \ 10)`)
    this.music.setVolume((this.gains.music * (world.nova ? 10 : world.musicVolume)) / 100);
    const seen = new Set<string>();
    for (const e of world.events) {
      const key = JSON.stringify(e);
      if (seen.has(key)) continue;
      seen.add(key);
      switch (e.kind) {
        case "sfx":
          this.sfx.play(`sound/${e.name}`, 0, this.gains.sfx, e.rate ?? 1);
          break;
        case "sfxLoop": {
          const loop = this.sfxLoops.get(e.name);
          if (e.on) {
            if (loop) loop.setRate(e.rate ?? 1);
            else
              this.sfxLoops.set(
                e.name,
                this.sfx.loopHandle(`sound/${e.name}`, this.gains.sfx, e.rate ?? 1),
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
            this.loops.set(e.sound, this.sfx.loop(id, this.gains.speech));
          } else this.sfx.play(id, 0, e.sfx ? this.gains.sfx : this.gains.speech);
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
          this.voiceStarted = this.context.currentTime;
          this.sfx.play(this.voice, 0, this.gains.speech);
          break;
        case "voiceStop":
          this.stopVoice();
          break;
      }
    }
  }

  /** Funkstimme aus (`KillFunktionsSound`). */
  stopVoice(): void {
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
