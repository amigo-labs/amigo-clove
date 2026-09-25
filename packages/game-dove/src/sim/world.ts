import { hashArrays } from "@clove/core";
import { BG_SPEED_DEFAULT, LIVES_START, SHIP_SPEED_DEFAULT, STAR_COUNT } from "./constants";
import type { LevelData } from "./level";
import { VbRnd } from "./VbRnd";

/** Slot-Pool: `active` plus Suche nach dem ersten freien Slot (wie im Original). */
export class Pool {
  readonly active: Uint8Array;
  constructor(readonly capacity: number) {
    this.active = new Uint8Array(capacity);
  }
  alloc(): number {
    const i = this.active.indexOf(0);
    if (i >= 0) this.active[i] = 1;
    return i;
  }
  free(i: number): void {
    this.active[i] = 0;
  }
  clear(): void {
    this.active.fill(0);
  }
}

/** Optionen des Originals (Optionsbildschirm) und Debug-Schalter. */
export interface SimOptions {
  /** „Gegner schießen“: 0 aus, 1 voll, 2 halb. Standard halb (Punktefaktor 1,0). */
  readonly enemyShots: 0 | 1 | 2;
  /** „Kollision mit Wand“ tötet. Standard aus. */
  readonly wallsKill: boolean;
  /** Punktefaktor `Me.[0x638]` in Hundertsteln; Standard 100. */
  readonly scoreFactor: number;
  /** „Waffenverlust nach dem Tod“ (`Me.[0x642]`). Standard an. */
  readonly weaponLoss: boolean;
  /** Debug: Spieler stirbt nie (für Durchlauftests). */
  readonly invincible: boolean;
}

export const DEFAULT_OPTIONS: SimOptions = {
  enemyShots: 2,
  wallsKill: false,
  scoreFactor: 100,
  weaponLoss: true,
  invincible: false,
};

/**
 * Der gesamte Simulationszustand. Nur Ganzzahlen und Q16.16 in Typed Arrays bzw.
 * Zahlenfeldern — `hash()` erfasst alles, was den nächsten Tick beeinflusst.
 */
export class World {
  readonly rnd: VbRnd;
  /** Effekte für den Renderer als Quintupel `[art, x, y, w, h]`; nicht gehasht. */
  readonly effects: number[] = [];
  /** Sounds als Paare `[index, parameter]`; nicht gehasht, einmal pro Frame abgespielt. */
  readonly sounds: number[] = [];

  // Level-Fortschritt
  tick = 0;
  checkpoint = 0;
  bossMode = false;
  finished = false;
  bgSpeed = BG_SPEED_DEFAULT;
  bgOffset = 0;
  shake = 0;
  halfToggle = 0;

  // Spieler
  px = 0;
  py = 0;
  prevX = 0;
  prevY = 0;
  speed = SHIP_SPEED_DEFAULT;
  tilt = 0;
  flame = 1;
  flameTimer = 0;
  invuln = 0;
  dead = 0;
  deathCounter = 0;
  lives = LIVES_START;
  score = 0;
  shownScore = 0;
  gauge = SHIP_SPEED_DEFAULT * 10;
  prevInput = 0;
  /** Feuer-Timer `Me.[0x12C](0…3)`: gefeuert bei `timer < F4`, dann `F4 + N`. */
  readonly fireTimer = new Int32Array(4);

  // Ausrüstung
  /** Farbwaffe `Me.[0x540]`: 0 keine, 1 blau (Laser), 2 grün (Bälle), 3 rot (Streuung). */
  colour = 0;
  /** Stufe `Me.[0x544]`: 0…2. */
  stage = 0;
  /** Anzahl Options `Me.[0x54C]`: 0…2. */
  optionCount = 0;
  /** Bombe `Me.[0x550]`. */
  bomb = 0;
  /** Schild-Timer `Me.[0x394]`. */
  shield = 0;
  shieldAngle = 0;
  orbitAngle = 0;
  /** Waffenausrichtung `Me.[0x25C]`: 80 vorn, 0 hinten; Richtung `Me.[0x25E]`. */
  pod = 80;
  podDir = 1;
  /** Blauer Laser in diesem Tick aktiv (`Me.[0x548]`). */
  laser = 0;
  /** Beam-Ladung `Me.[0x354]` (0…200). */
  charge = 0;
  /** Beam im Flug (`Me.[0x352]`): 0 keiner, 1–3 Teilbeams, 4 voller Beam. */
  beam = 0;
  beamX = 0;
  beamY = 0;
  beamDamage = 0;
  /** Boss-Budget des vollen Beams (`Me.[0x260]`). */
  bossBudget = 0;

  // Abgeleitete Darstellung (pro Tick neu berechnet, nicht gehasht)
  laserRows = 0;
  readonly laserY = new Int16Array(10);
  readonly laserFrom = new Int16Array(10);
  readonly laserTo = new Int16Array(10);
  /** 0 Kern, 1 Mitte, 2 Rand. */
  readonly laserTier = new Int8Array(10);
  orbCount = 0;
  orbVisible = 0;
  readonly orbX = new Int32Array(4);
  readonly orbY = new Int32Array(4);

  // Landschaft (Me.58C, 100 Slots)
  readonly tiles = new Pool(100);
  readonly tileType = new Int16Array(100);
  readonly tileX = new Int32Array(100);
  readonly tileY = new Int32Array(100);

  // Hintergrundobjekte (Me.5FC, 10 Slots), x in Q16.16
  readonly objects = new Pool(10);
  readonly objType = new Int16Array(10);
  readonly objX = new Int32Array(10);
  readonly objY = new Int32Array(10);

  // Sterne (nur background1), x in Q16.16
  readonly starX = new Int32Array(STAR_COUNT);
  readonly starY = new Int32Array(STAR_COUNT);

  // Extras (Me.230, 13 Slots)
  readonly extras = new Pool(13);
  readonly extraArt = new Int8Array(13);
  readonly extraX = new Int32Array(13);
  readonly extraY = new Int32Array(13);
  readonly extraFrame = new Int8Array(13);
  readonly extraAnim = new Int16Array(13);

  // Gegner (Me.44C, 100 Slots), Position und Geschwindigkeit in Q16.16
  readonly enemies = new Pool(100);
  readonly enType = new Int16Array(100);
  readonly enPattern = new Int16Array(100);
  readonly enX = new Int32Array(100);
  readonly enY = new Int32Array(100);
  readonly enVX = new Int32Array(100);
  readonly enVY = new Int32Array(100);
  readonly enHP = new Int32Array(100);
  readonly enPoints = new Int32Array(100);
  readonly enFrame = new Int16Array(100);
  readonly enAnim = new Int16Array(100);
  readonly enWaypoint = new Int16Array(100);
  readonly enShotTimer = new Int32Array(100);
  /** Zustandszähler der Sonderbewegungen (Schweber: Abzugszähler, Faller: Phase). */
  readonly enAux = new Int32Array(100);

  // Meteore (Me.214, 11 Slots)
  readonly meteors = new Pool(11);
  readonly metX = new Int32Array(11);
  readonly metY = new Int32Array(11);
  readonly metVX = new Int32Array(11);
  readonly metVY = new Int32Array(11);
  readonly metHP = new Int32Array(11);

  // Spielerschüsse (Original: 1000 Slots; 256 reichen auch für geteilte grüne Bälle)
  readonly shots = new Pool(256);
  /** 0 Basis, 1 Bombe, 2 grüner Ball, 3 rote Streuung. */
  readonly shotType = new Int8Array(256);
  readonly shotX = new Int32Array(256);
  readonly shotY = new Int32Array(256);
  readonly shotVX = new Int32Array(256);
  readonly shotVY = new Int32Array(256);
  /** Größe grüner Bälle (p6, 0…3). */
  readonly shotSize = new Int8Array(256);
  readonly shotDamage = new Int32Array(256);

  // Gegnerschüsse (Me.5D8, 50 Slots)
  readonly eshots = new Pool(50);
  readonly eshotKind = new Int8Array(50);
  readonly eshotX = new Int32Array(50);
  readonly eshotY = new Int32Array(50);
  readonly eshotVX = new Int32Array(50);
  readonly eshotVY = new Int32Array(50);

  // Explosionen
  readonly explosions = new Pool(64);
  readonly expX = new Int32Array(64);
  readonly expY = new Int32Array(64);
  readonly expFrame = new Int8Array(64);

  constructor(
    readonly level: LevelData,
    readonly options: SimOptions,
    seed: number,
  ) {
    this.rnd = new VbRnd(seed);
  }

  private scalars(): Int32Array {
    return Int32Array.of(
      this.rnd.seed,
      this.tick,
      this.checkpoint,
      +this.bossMode,
      +this.finished,
      this.bgSpeed,
      this.bgOffset,
      this.shake,
      this.halfToggle,
      this.px,
      this.py,
      this.prevX,
      this.prevY,
      this.speed,
      this.tilt,
      this.flame,
      this.flameTimer,
      this.invuln,
      this.dead,
      this.deathCounter,
      this.lives,
      this.score,
      this.shownScore,
      this.gauge,
      this.prevInput,
      this.colour,
      this.stage,
      this.optionCount,
      this.bomb,
      this.shield,
      this.shieldAngle,
      this.orbitAngle,
      this.pod,
      this.podDir,
      this.laser,
      this.charge,
      this.beam,
      this.beamX,
      this.beamY,
      this.beamDamage,
      this.bossBudget,
    );
  }

  /** xxHash32 über den kompletten Zustand. */
  hash(): number {
    return hashArrays([
      this.scalars(),
      this.tiles.active,
      this.tileType,
      this.tileX,
      this.tileY,
      this.objects.active,
      this.objType,
      this.objX,
      this.objY,
      this.starX,
      this.starY,
      this.extras.active,
      this.extraArt,
      this.extraX,
      this.extraY,
      this.extraFrame,
      this.extraAnim,
      this.enemies.active,
      this.enType,
      this.enPattern,
      this.enX,
      this.enY,
      this.enVX,
      this.enVY,
      this.enHP,
      this.enPoints,
      this.enFrame,
      this.enAnim,
      this.enWaypoint,
      this.enShotTimer,
      this.enAux,
      this.meteors.active,
      this.metX,
      this.metY,
      this.metVX,
      this.metVY,
      this.metHP,
      this.fireTimer,
      this.shots.active,
      this.shotType,
      this.shotX,
      this.shotY,
      this.shotVX,
      this.shotVY,
      this.shotSize,
      this.shotDamage,
      this.eshots.active,
      this.eshotKind,
      this.eshotX,
      this.eshotY,
      this.eshotVX,
      this.eshotVY,
      this.explosions.active,
      this.expX,
      this.expY,
      this.expFrame,
    ]);
  }
}
