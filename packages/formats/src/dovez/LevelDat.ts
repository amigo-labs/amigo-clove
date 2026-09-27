import {
  SchemaError,
  readSchema,
  schemaCoverage,
  writeSchema,
  type Row,
  type RowOf,
  type Schema,
  type SchemaCoverage,
} from "./binarySchema";

/**
 * DoveZ-Level-Skript `<Level>.dat` (im `.dlp`-Paket). VB6-`Get #` in
 * Dateireihenfolge; die Grammatik stammt aus `LadeDaten` in `DoveZ.exe`
 * (`0x4C72C0`), Befund: `docs/formats/dovez-level-dat.md`.
 *
 * Provisorische Namen, Stand der Dekodierung siehe dort.
 */

export class DovezLevelDatError extends Error {
  override name = "DovezLevelDatError";
}

export const DOVEZ_LEVEL_MAGIC = "DOVE2 - V. 0.15";

/** Bild einer Sprite-Gruppe; `bmp` `"-"` beendet die Folge (das vorige Bild bleibt stehen). */
const FRAME = [
  { name: "bmp", type: "str" },
  { name: "srcX", type: "i32" },
  { name: "srcY", type: "i32" },
  { name: "srcW", type: "i32" },
  { name: "srcH", type: "i32" },
  /** Ticks je Bild. */
  { name: "delay", type: "i32" },
] as const satisfies Schema;

const GROUP = [
  /** Editor-ID, beim Laden verworfen; referenziert wird über die Position. */
  { name: "unusedEditorId", type: "i32" },
  { name: "name", type: "str" },
  /** ≠ 0: Direct3D (Farbe, Alpha, Drehung, additiv), 0: DirectDraw-Blit mit Colorkey. */
  { name: "d3d", type: "i16" },
  { count: "frames" },
  { list: "frames", of: FRAME },
] as const satisfies Schema;

/** Teil eines Gegners (Sprite, Waffe, eigene Route, eigene Lebenspunkte). */
const PART = [
  { name: "alpha", type: "f32" },
  /** ≠ 0: Zerstörung tötet den ganzen Gegner. */
  { name: "vital", type: "i16" },
  { name: "blue", type: "f32" },
  { name: "green", type: "f32" },
  /** ≠ 0: Treffer ziehen vom Gegner ab, sonst hat das Teil eigene `hitPoints`. */
  { name: "damagesBody", type: "i16" },
  { name: "hitPoints", type: "i32" },
  { name: "group", type: "i32" },
  { name: "red", type: "f32" },
  /** Eigene Route (−1000: keine). */
  { name: "route", type: "i32" },
  { name: "hasRoute", type: "i16" },
  /** Gegnerwaffe; −1: stattdessen `EnemyType.spawnSpec` ausspucken. */
  { name: "weapon", type: "i32" },
  /** 0 nie, 1–3 zufällig (p = 0,002/0,005/0,02), 4–6 alle 25/50/100 Ticks, 7 einmal. */
  { name: "fireMode", type: "i32" },
  /** ≠ 0: Treffer ohne Schaden. */
  { name: "armored", type: "i16" },
  /** Grad; gezielte Waffen überschreiben sie jeden Tick. */
  { name: "rotation", type: "f32" },
  { name: "x", type: "i32" },
  { name: "y", type: "i32" },
] as const satisfies Schema;

const ENEMY = [
  /** × (1 + 0,5 · zwei Spieler); ganzzahlig zugleich die Punkte. */
  { name: "hitPoints", type: "i32" },
  { count: "parts" },
  { name: "name", type: "str" },
  /** px/Tick. */
  { name: "speed", type: "f32" },
  { name: "collidesWithTerrain", type: "i32" },
  /** > 0: rammt andere Gegner, Rechteck um (Wert − 1) px eingerückt. */
  { name: "ramsEnemies", type: "i32" },
  /** > 0: eins von 8 Bildern nach Bewegungsrichtung statt Animation. */
  { name: "directionalFrames", type: "i32" },
  /** 1-basierte Gruppe für Trümmer beim Tod, 0: keine. */
  { name: "wreckGroup", type: "i32" },
  /** Stärke der Druckwelle beim Tod. */
  { name: "deathShockwave", type: "i32" },
  { name: "armorPassThrough", type: "i32" },
  { name: "novaImmune", type: "i32" },
  /** Für Teile mit Waffe −1: Route · 1000 + Gegnertyp. */
  { name: "spawnSpec", type: "i32" },
  /** > 0: wirkt wie Landschaft. */
  { name: "solid", type: "i32" },
  /** Beim Tod: Route · 1000 + Typ · 10 + (Anzahl − 1). */
  { name: "deathSpawn", type: "i32" },
  /** 0 kein Aufblitzen, 1 getroffenes Teil, 2 alle Teile. */
  { name: "hitFlash", type: "i32" },
  /** Explosiv: Gegnerschaden · 10000 + Radius · 10 + (Spielerschaden / 10 + 1). */
  { name: "explosionSpec", type: "i32" },
  { name: "boss", type: "i32" },
  { name: "partDebris", type: "i32" },
  { name: "noComboReset", type: "i32" },
  /** Lange Kettenexplosion beim Tod. */
  { name: "bigDeath", type: "i32" },
  { list: "parts", of: PART },
] as const satisfies Schema;

const ARG = [
  { name: "a", type: "f32" },
  { name: "b", type: "f32" },
] as const satisfies Schema;

/** Ein Befehl; jedes Argument ist `Var(a) + Var(b)` (Werte ab 32748 sind Variablen). */
const OP = [
  { name: "op", type: "i32" },
  { count: "args" },
  { list: "args", of: ARG },
] as const satisfies Schema;

const ROUTE = [
  { count: "ops" },
  { name: "name", type: "str" },
  { list: "ops", of: OP },
] as const satisfies Schema;

/**
 * Zeitleisten-Eintrag; `p1…p3` hängen von Ebene und `kind` ab
 * (`docs/formats/dovez-level-dat.md`). Ebene 4 z. B. `kind` 0: Gegner `p1`
 * auf Route `p2` bei y = `p3` spawnen.
 */
const ENTRY = [
  { name: "tick", type: "i32" },
  { name: "kind", type: "i32" },
  { name: "p1", type: "i32" },
  { name: "p2", type: "i32" },
  { name: "p3", type: "i32" },
] as const satisfies Schema;

const LAYER = [
  { name: "scrollSpeed", type: "f32" },
  { count: "entries" },
  { list: "entries", of: ENTRY },
] as const satisfies Schema;

/** Nie belegt (in keinem Level), zur Laufzeit ungelesen — vermutlich Editor-Notizen. */
const ANIM_NOTE = [
  { name: "unused00", type: "i32" },
  { name: "unused04", type: "i32" },
  { name: "unusedText", repeat: 5, of: [{ name: "v", type: "fixed30" }] },
] as const satisfies Schema;

/** Keyframe einer Spur; die Bewegungsart gilt für das Segment, das an diesem Key endet. */
const ANIM_KEY = [
  { name: "time", type: "i32" },
  { name: "x", type: "f32" },
  { name: "y", type: "f32" },
  { name: "red", type: "f32" },
  { name: "green", type: "f32" },
  { name: "blue", type: "f32" },
  { name: "alpha", type: "f32" },
  { name: "rotation", type: "i32" },
  { name: "scaleX", type: "f32" },
  { name: "scaleY", type: "f32" },
  { name: "frame", type: "i32" },
  { name: "motion", type: "i32" },
  { name: "speed", type: "f32" },
  { name: "visible", type: "i16" },
  { name: "additive", type: "i16" },
] as const satisfies Schema;

const ANIM_TRACK = [
  { count: "keys" },
  { name: "group", type: "i32" },
  { list: "keys", of: ANIM_KEY },
] as const satisfies Schema;

const ANIM = [
  { count: "tracks" },
  { name: "name", type: "str" },
  { name: "duration", type: "i32" },
  { name: "loop", type: "i16" },
  { name: "scrollWithLayer", type: "i16" },
  { count: "notes" },
  { list: "notes", of: ANIM_NOTE },
  { list: "tracks", of: ANIM_TRACK },
] as const satisfies Schema;

/** Salve einer Gegnerwaffe: `repeat + 1` Schüsse ab `startDelay`, alle `interval` Ticks. */
const WEAPON_SUB = [
  /** 1: am Routenende `spawnWeapon` abfeuern (Splitterschuss). */
  { name: "onRouteEnd", type: "i32" },
  { name: "spawnWeapon", type: "i32" },
  { name: "cullOffscreen", type: "i16" },
  { name: "damage", type: "f32" },
  { name: "repeat", type: "i32" },
  { name: "interval", type: "i32" },
  /** Route des Schusses, −1: geradeaus. */
  { name: "route", type: "i32" },
  /** Wird von Force und Drohnen nicht abgefangen. */
  { name: "unblockable", type: "i16" },
  { name: "shotType", type: "i32" },
  { name: "speed", type: "f32" },
  /** ≠ 0: einmal auf den Spieler zielen. */
  { name: "aimed", type: "i16" },
  { name: "startDelay", type: "i32" },
  { name: "offsetX", type: "f32" },
  { name: "offsetY", type: "f32" },
  /** Fliegt nach einem Spielertreffer weiter. */
  { name: "piercing", type: "i16" },
] as const satisfies Schema;

const WEAPON = [
  { name: "name", type: "str" },
  /** Geschützturm: das Teil dreht sich jeden Tick zum Spieler, die Mündung sitzt am gedrehten Rand. */
  { name: "turret", type: "i16" },
  { count: "salvos" },
  { list: "salvos", of: WEAPON_SUB },
] as const satisfies Schema;

const SHOT = [
  { name: "name", type: "str" },
  /** 0: eingebaute blinkende 16×16-Kugel, 1: Sprite-Gruppe `group`. */
  { name: "kind", type: "i32" },
  { name: "blue", type: "f32" },
  { name: "green", type: "f32" },
  /** Sprite in Flugrichtung drehen. */
  { name: "rotate", type: "i16" },
  { name: "group", type: "i32" },
  { name: "red", type: "f32" },
  /** 0 keine, 1 Nachbilder, 2 Glühen. */
  { name: "trail", type: "i32" },
  { name: "hitLeft", type: "i32" },
  { name: "hitTop", type: "i32" },
  { name: "hitRight", type: "i32" },
  { name: "hitBottom", type: "i32" },
  /** Einblenden in Ticks. */
  { name: "fadeIn", type: "i32" },
  { name: "sound", type: "i32" },
  { name: "ignoreWalls", type: "i16" },
  { name: "additive", type: "i16" },
] as const satisfies Schema;

const SOUND = [
  /** Datei in `Sound.d2p`. */
  { name: "file", type: "str" },
  /** Zusätzliche gleichzeitige Kopien (reihum). */
  { name: "extraVoices", type: "i32" },
] as const satisfies Schema;

/** Funkspruch-Auslöser; der Text steht unter `[id]` in `<radioPrefix><Sprache>.txt`. */
const RADIO = [
  /** Wird zur Laufzeit je Segment mit dem Sprecher überschrieben. */
  { name: "unusedSpeaker", type: "str" },
  { name: "id", type: "str" },
  /** Von keiner der drei Stellen gelesen, die das Funk-Array benutzen. */
  { name: "unusedFlag", type: "i16" },
  /** Höchstzahl der Wiedergaben, 0: unbegrenzt. */
  { name: "maxPlays", type: "i32" },
] as const satisfies Schema;

export const DOVEZ_LEVEL_SCHEMA = [
  { name: "magic", type: "fixed15" },
  { name: "background", type: "str" },
  { count: "groups" },
  { list: "groups", of: GROUP },
  { count: "enemies" },
  { list: "enemies", of: ENEMY },
  { count: "routes" },
  { list: "routes", of: ROUTE },
  { name: "layers", repeat: 7, of: LAYER },
  { count: "anims" },
  { list: "anims", of: ANIM },
  { count: "weapons" },
  { list: "weapons", of: WEAPON },
  { count: "shots" },
  { list: "shots", of: SHOT },
  { count: "sounds" },
  { list: "sounds", of: SOUND },
  { name: "radioPrefix", type: "str" },
  { count: "radio" },
  { list: "radio", of: RADIO },
  /** Levelende in Ticks; 99999 in Bosslevels. */
  { name: "levelLength", type: "i32" },
  /** Wasserhöhe vom unteren Rand (550: alles unter Wasser). */
  { name: "waterHeight", type: "i32" },
  /** Anzahl regenartiger Partikel, 0: aus. */
  { name: "weatherParticles", type: "i32" },
  /** px/Tick² für Trümmer, Partikel und manche Schüsse. */
  { name: "gravity", type: "f32" },
  { name: "music", type: "str" },
  { name: "title", type: "str" },
  { name: "waterTopRed", type: "f32" },
  { name: "waterTopGreen", type: "f32" },
  { name: "waterTopBlue", type: "f32" },
  { name: "waterBottomRed", type: "f32" },
  { name: "waterBottomGreen", type: "f32" },
  { name: "waterBottomBlue", type: "f32" },
] as const satisfies Schema;

export type DovezLevel = RowOf<typeof DOVEZ_LEVEL_SCHEMA>;
export type DovezGroup = RowOf<typeof GROUP>;
export type DovezFrame = RowOf<typeof FRAME>;
export type DovezEnemy = RowOf<typeof ENEMY>;
export type DovezPart = RowOf<typeof PART>;
export type DovezRoute = RowOf<typeof ROUTE>;
export type DovezRouteOp = RowOf<typeof OP>;
export type DovezLayer = RowOf<typeof LAYER>;
export type DovezTimelineEntry = RowOf<typeof ENTRY>;
export type DovezAnim = RowOf<typeof ANIM>;
export type DovezAnimTrack = RowOf<typeof ANIM_TRACK>;
export type DovezAnimKey = RowOf<typeof ANIM_KEY>;
export type DovezWeapon = RowOf<typeof WEAPON>;
export type DovezWeaponSalvo = RowOf<typeof WEAPON_SUB>;
export type DovezShot = RowOf<typeof SHOT>;
export type DovezSound = RowOf<typeof SOUND>;
export type DovezRadio = RowOf<typeof RADIO>;

export function parseDovezLevelDat(bytes: Uint8Array): DovezLevel {
  let row: Row;
  try {
    row = readSchema(bytes, DOVEZ_LEVEL_SCHEMA);
  } catch (e) {
    if (e instanceof SchemaError) throw new DovezLevelDatError(e.message);
    throw e;
  }
  if (row["magic"] !== DOVEZ_LEVEL_MAGIC) {
    throw new DovezLevelDatError(`Magic ${JSON.stringify(row["magic"])}`);
  }
  return row as unknown as DovezLevel;
}

export function serializeDovezLevelDat(level: DovezLevel): Uint8Array {
  return writeSchema(level as unknown as Row, DOVEZ_LEVEL_SCHEMA);
}

export function dovezLevelCoverage(level: DovezLevel): SchemaCoverage {
  return schemaCoverage(level as unknown as Row, DOVEZ_LEVEL_SCHEMA);
}
