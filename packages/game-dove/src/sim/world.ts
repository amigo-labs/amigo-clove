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

/**
 * Ein Bossskript (`Endgegner1…10`). `tick` läuft einmal pro Tick nach den Gegnern
 * (`DoEndgegner`), `hit` vor allen anderen Zielen in `HitTest`.
 */
export interface BossScript {
  tick(w: World): void;
  /** −1 kein Treffer, 0 absorbiert, > 0 Überschuss (der Schuss fliegt weiter). */
  hit(w: World, bx: number, by: number, bw: number, bh: number, damage: number): number;
}

/**
 * Pool mit Suchhinweis wie `M78C` (`0x43BCA0`): `For i = hint To last`, erster
 * freier Slot, danach `hint = i + 1`; beim Freigeben `If hint > i Then hint = i`
 * (`0x4772D2`); Levelstart `hint = 0` (`0x46E973`). Kein Umbruch — ist ab dem
 * Hinweis alles belegt, wird nichts angelegt. Levelskripte greifen auf feste
 * Slots zu (Level 3) und rechnen mit `hint − 1` als zuletzt belegtem Slot.
 */
export class HintPool extends Pool {
  hint = 0;
  override alloc(): number {
    for (let i = this.hint; i < this.capacity; i++) {
      if (!this.active[i]) {
        this.active[i] = 1;
        this.hint = i + 1;
        return i;
      }
    }
    return -1;
  }
  override free(i: number): void {
    this.active[i] = 0;
    if (this.hint > i) this.hint = i;
  }
  override clear(): void {
    this.active.fill(0);
    this.hint = 0;
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
  /** `Me.264`: Level geschafft — der Autopilot fliegt das Schiff hinaus. */
  levelDone = false;
  /** Autopilot-Zähler E (`0x4716CF`). */
  autopilot = 0;
  /** `Me.690`: 0 läuft, 3 Level beendet (Schiff hat den Bildschirm verlassen). */
  exit = 0;
  bgSpeed = BG_SPEED_DEFAULT;
  bgOffset = 0;
  shake = 0;
  halfToggle = 0;
  /** Laufende Option „Gegner schießen“ (`Me.634`); Bosse setzen sie zeitweise auf voll. */
  shotOption: number;

  // Levelskripte (`docs/measurements/dove-bosses.md`, „Levelskripte“)
  /** Zähler und gemerkte Slots der Skripte. */
  readonly scriptC = new Int32Array(16);
  /** Angezeigter Skripttext (Tutorial, Level 7), 0 = keiner; Texte in `scripts.ts`. */
  scriptText = 0;
  /** Deko-Blasen Level 3 (`Me.388`, 6 Slots): x in Q16.16, y, Alter. */
  readonly deco = new Pool(6);
  readonly decoX = new Int32Array(6);
  readonly decoX0 = new Int32Array(6);
  readonly decoY = new Int32Array(6);
  readonly decoT = new Int32Array(6);
  /** Bremsbänder Level 7. */
  readonly bands = new Pool(8);
  readonly bandX = new Int32Array(8);
  readonly bandY = new Int32Array(8);
  /** Windzonen Level 8 (`Me.620`, 4 Slots). */
  readonly winds = new Pool(4);
  readonly windX = new Int32Array(4);
  readonly windW = new Int32Array(4);
  readonly windS = new Int32Array(4);

  /** Dynamisches Pattern #100 (Boss 4): Punkte inkl. Start und Terminator x = −1. */
  readonly customPathX = new Int16Array(32);
  readonly customPathY = new Int16Array(32);
  customPathLen = 0;

  // Boss (`Me.3A0`): bis zu drei Teile, Zustand, Zähler
  /** Laufendes Bossskript (aus der Levelnummer, nicht gehasht). */
  boss: BossScript | undefined = undefined;
  bossState = 0;
  bossScored = 0;
  /** Gegnertyp je Teil (0-basiert, −1 = kein Teil). */
  readonly bossType = Int16Array.of(-1, -1, -1);
  readonly bossX = new Int32Array(3);
  readonly bossY = new Int32Array(3);
  readonly bossHP = new Int32Array(3);
  readonly bossHPMax = new Int32Array(3);
  readonly bossFrame = new Int16Array(3);
  /** Teil sichtbar (`Me.3F8` bzw. bossabhängig). */
  readonly bossVisible = new Uint8Array(3);
  /** Zähler und Unterzustände (`+1C…+30` und bossspezifische Felder). */
  readonly bossC = new Int32Array(24);
  /** Bis zu drei tödliche Strahlen (E4, E7, E10): x, y, w, h; w = 0 aus. */
  readonly bossBeamX = new Int32Array(3);
  readonly bossBeamY = new Int32Array(3);
  readonly bossBeamW = new Int32Array(3);
  readonly bossBeamH = new Int32Array(3);

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

  // Landschaft (Me.58C, Slots 0…100, Hinweis Me.598)
  readonly tiles = new HintPool(101);
  readonly tileType = new Int16Array(101);
  readonly tileX = new Int32Array(101);
  readonly tileY = new Int32Array(101);
  readonly tileVX = new Int32Array(101);
  readonly tileVY = new Int32Array(101);

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
  readonly extraVX = new Int32Array(13);
  readonly extraFrame = new Int8Array(13);
  readonly extraAnim = new Int16Array(13);

  // Gegner (Me.44C, Hinweis Me.458), Position und Geschwindigkeit in Q16.16
  readonly enemies = new HintPool(101);
  readonly enType = new Int16Array(101);
  readonly enPattern = new Int16Array(101);
  readonly enX = new Int32Array(101);
  readonly enY = new Int32Array(101);
  readonly enVX = new Int32Array(101);
  readonly enVY = new Int32Array(101);
  readonly enHP = new Int32Array(101);
  readonly enPoints = new Int32Array(101);
  readonly enFrame = new Int16Array(101);
  readonly enAnim = new Int16Array(101);
  readonly enWaypoint = new Int16Array(101);
  readonly enShotTimer = new Int32Array(101);
  /** Zustandszähler der Sonderbewegungen (Schweber: Abzugszähler, Faller: Phase). */
  readonly enAux = new Int32Array(101);

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
  /** Sprite-Rechteck in ss.spr je Schuss (Bosse schießen eigene Sprites). */
  readonly eshotSX = new Int16Array(50);
  readonly eshotSY = new Int16Array(50);
  readonly eshotW = new Int16Array(50);
  readonly eshotH = new Int16Array(50);

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
    this.shotOption = options.enemyShots;
  }

  private scalars(): Int32Array {
    return Int32Array.of(
      this.rnd.seed,
      this.tick,
      this.checkpoint,
      +this.bossMode,
      +this.levelDone,
      this.autopilot,
      this.exit,
      this.bossState,
      this.bossScored,
      this.bgSpeed,
      this.bgOffset,
      this.shake,
      this.halfToggle,
      this.shotOption,
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
      this.tiles.hint,
      this.enemies.hint,
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
      this.scriptC,
      Int32Array.of(this.scriptText),
      this.deco.active,
      this.decoX,
      this.decoX0,
      this.decoY,
      this.decoT,
      this.bands.active,
      this.bandX,
      this.bandY,
      this.winds.active,
      this.windX,
      this.windW,
      this.windS,
      this.customPathX,
      this.customPathY,
      Int32Array.of(this.customPathLen),
      this.bossType,
      this.bossX,
      this.bossY,
      this.bossHP,
      this.bossHPMax,
      this.bossFrame,
      this.bossVisible,
      this.bossC,
      this.bossBeamX,
      this.bossBeamY,
      this.bossBeamW,
      this.bossBeamH,
      this.tiles.active,
      this.tileType,
      this.tileX,
      this.tileY,
      this.tileVX,
      this.tileVY,
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
      this.extraVX,
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
      this.eshotSX,
      this.eshotSY,
      this.eshotW,
      this.eshotH,
      this.explosions.active,
      this.expX,
      this.expY,
      this.expFrame,
    ]);
  }
}
