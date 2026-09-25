import { ModulePlayer, SfxPool } from "@clove/audio";
import type { AssetStore, AudioHost } from "@clove/core";
import { SOUND_FILES, Sound } from "../sim/actions";
import { BOSS_TICK } from "../sim/constants";
import type { World } from "../sim/world";

/**
 * Ton für DOVE: spielt die Soundereignisse der Simulation einmal pro Frame
 * (dedupliziert, Spec R4) und die Tracker-Musik. Die Simulation bleibt stumm —
 * sie meldet nur `[Index, Parameter]`.
 */
export class DoveAudio {
  private laserStop: (() => void) | undefined;
  /** Bis zu drei überlappende Lade-Schleifen (BASS: 3 Stimmen je Sample). */
  private chargeStops: (() => void)[] = [];
  private currentMusic: string | undefined;
  private paused = false;

  private constructor(
    private readonly assets: AssetStore,
    private readonly sfx: SfxPool,
    private readonly music: ModulePlayer,
  ) {}

  static async create(host: AudioHost, assets: AssetStore): Promise<DoveAudio> {
    const sfx = new SfxPool(host.context, host.sfx);
    await Promise.all(
      SOUND_FILES.map(async (name) => {
        const id = `sound/${name}`;
        if (assets.has(id)) await sfx.load(id, await assets.bytes(id));
      }),
    );
    const music = await ModulePlayer.create(host.context, host.music, {
      workletUrl: host.moduleWorkletUrl,
    });
    return new DoveAudio(assets, sfx, music);
  }

  /** Musik per Asset-ID (`music/s1`); dieselbe ID läuft ungestört weiter. */
  async playMusic(id: string | undefined, loop = true): Promise<void> {
    if (id === this.currentMusic) return;
    this.currentMusic = id;
    if (!id || !this.assets.has(id)) {
      this.music.stop();
      return;
    }
    this.music.play(await this.assets.bytes(id), loop);
  }

  /** Musik zum Level: `S<L>`; Level 11 hat keine eigene und nimmt S0–S9 (`PlayMusik`). */
  static levelMusic(level: number, seed: number): string {
    return level === 11 ? `music/s${seed % 10}` : `music/s${level}`;
  }

  /** Bossmusik: end1 in Level 1, 3, 5, sonst end2. */
  static bossMusic(level: number): string {
    return level === 1 || level === 3 || level === 5 ? "music/end1" : "music/end2";
  }

  /** Pause: Musik läuft mit 25 %, Effekte verstummen (`BASS_SetGlobalVolumes(25, 0, 25)`). */
  pause(paused: boolean): void {
    this.paused = paused;
    this.music.setVolume(paused ? 0.25 : 1);
    if (paused) {
      this.stopLaser();
      this.stopCharge();
    }
  }

  /**
   * Musikpegel aus dem Level-Tick: in den 100 Ticks vor dem Boss linear von
   * 99 % auf 0 (`0x43F57E`), am Boss-Tick die Bossmusik mit vollem Pegel.
   */
  private updateMusic(world: World): void {
    if (this.paused) return;
    const boss = BOSS_TICK[world.level.number];
    if (boss === undefined) return;
    if (world.bossMode) {
      void this.playMusic(DoveAudio.bossMusic(world.level.number));
    } else if (world.tick >= boss - 100 && world.tick < boss) {
      this.music.setVolume((boss - world.tick) / 100);
    }
  }

  /** Einmal pro Frame nach den Simulationsticks. */
  update(world: World): void {
    this.updateMusic(world);
    const seen = new Set<number>();
    const q = world.sounds;
    for (let i = 0; i + 1 < q.length; i += 2) {
      const id = q[i] as number;
      const param = q[i + 1] as number;
      const key = id * 100_000 + param;
      if (seen.has(key)) continue;
      seen.add(key);
      this.playSound(id, param);
    }
    q.length = 0;
    // Das Ladegeräusch endet mit dem Auslösen (SampleStop in `BeamAbschuss`) und beim Tod.
    if (world.charge === 0 || world.dead) this.stopCharge();
    if (world.laser && !world.dead) {
      this.laserStop ??= this.sfx.loop(`sound/${SOUND_FILES[Sound.Blue]}`, 1);
    } else {
      this.stopLaser();
    }
  }

  /**
   * Lautstärke und Parameter wie die `BASS_SamplePlayEx`-Aufrufe des Originals
   * (`docs/measurements/dove-audio.md`): Lautstärke 0–100, Panorama roh / 100.
   */
  private playSound(id: number, param: number): void {
    const name = SOUND_FILES[id];
    if (!name) return;
    const key = `sound/${name}`;
    switch (id) {
      case Sound.Normal:
      case Sound.Jingle:
        this.sfx.play(key, 0, 0.5);
        break;
      case Sound.Explosion:
      case Sound.Antrieb:
      case Sound.Beam1:
      case Sound.Beam2:
        this.sfx.play(key, param / 100, 0.5);
        break;
      case Sound.Green:
        this.sfx.play(key, 0, param / 100);
        break;
      case Sound.Charge:
        // Schleife mit Frequenz 10·Ladung + 5000 Hz; charge.wav hat 11025 Hz.
        if (this.chargeStops.length >= 3) this.chargeStops.shift()?.();
        this.chargeStops.push(this.sfx.loop(key, 0.3, param / 11025));
        break;
      default:
        this.sfx.play(key);
    }
  }

  private stopCharge(): void {
    for (const stop of this.chargeStops) stop();
    this.chargeStops = [];
  }

  private stopLaser(): void {
    this.laserStop?.();
    this.laserStop = undefined;
  }

  dispose(): void {
    this.stopLaser();
    this.stopCharge();
    this.sfx.stopAll();
    this.music.dispose();
  }
}
