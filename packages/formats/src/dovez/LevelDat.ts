import {
  SchemaError,
  readSchema,
  schemaCoverage,
  writeSchema,
  type Row,
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

const FRAME: Schema = [
  { name: "bmp", type: "str" },
  { name: "x", type: "i32" },
  { name: "y", type: "i32" },
  { name: "w", type: "i32" },
  { name: "h", type: "i32" },
  { name: "delay", type: "i32" },
];

const GROUP: Schema = [
  { name: "slot", type: "i32" },
  { name: "name", type: "str" },
  { name: "flag", type: "i16" },
  { count: "frames" },
  { list: "frames", of: FRAME },
];

const PART: Schema = [
  { name: "unknown1c", type: "f32" },
  { name: "unknown2c", type: "i16" },
  { name: "unknown18", type: "f32" },
  { name: "unknown14", type: "f32" },
  { name: "unknown24", type: "i16" },
  { name: "unknown28", type: "i32" },
  { name: "group", type: "i32" },
  { name: "unknown10", type: "f32" },
  { name: "unknown0c", type: "i32" },
  { name: "unknown08", type: "i16" },
  { name: "unknown30", type: "i32" },
  { name: "unknown34", type: "i32" },
  { name: "unknown2e", type: "i16" },
  { name: "unknown20", type: "i32" },
  { name: "x", type: "i32" },
  { name: "y", type: "i32" },
];

const ENEMY: Schema = [
  { name: "unknown0c", type: "i32" },
  { count: "parts" },
  { name: "name", type: "str" },
  { name: "unknown10", type: "f32" },
  { name: "unknown20", repeat: 16, of: [{ name: "v", type: "i32" }] },
  { list: "parts", of: PART },
];

const ARG: Schema = [
  { name: "a", type: "f32" },
  { name: "b", type: "f32" },
];

const OP: Schema = [{ name: "op", type: "i32" }, { count: "args" }, { list: "args", of: ARG }];

const ROUTE: Schema = [{ count: "ops" }, { name: "name", type: "str" }, { list: "ops", of: OP }];

const ENTRY: Schema = [
  { name: "tick", type: "i32" },
  { name: "unknown04", type: "i32" },
  { name: "unknown08", type: "i32" },
  { name: "unknown0c", type: "i32" },
  { name: "unknown10", type: "i32" },
];

const LAYER: Schema = [
  { name: "scrollSpeed", type: "f32" },
  { count: "entries" },
  { list: "entries", of: ENTRY },
];

/** Nie belegt (in keinem Level), zur Laufzeit ungelesen — vermutlich Editor-Notizen. */
const ANIM_NOTE: Schema = [
  { name: "unknown00", type: "i32" },
  { name: "unknown04", type: "i32" },
  { name: "unknownText", repeat: 5, of: [{ name: "v", type: "fixed30" }] },
];

/** Keyframe einer Spur; die Bewegungsart gilt für das Segment, das an diesem Key endet. */
const ANIM_KEY: Schema = [
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
];

const ANIM_TRACK: Schema = [
  { count: "keys" },
  { name: "group", type: "i32" },
  { list: "keys", of: ANIM_KEY },
];

const ANIM: Schema = [
  { count: "tracks" },
  { name: "name", type: "str" },
  { name: "duration", type: "i32" },
  { name: "loop", type: "i16" },
  { name: "scrollWithLayer", type: "i16" },
  { count: "notes" },
  { list: "notes", of: ANIM_NOTE },
  { list: "tracks", of: ANIM_TRACK },
];

const WEAPON_SUB: Schema = [
  { name: "unknown14", type: "i32" },
  { name: "unknown18", type: "i32" },
  { name: "unknown34", type: "i16" },
  { name: "unknown20", type: "f32" },
  { name: "unknown04", type: "i32" },
  { name: "unknown08", type: "i32" },
  { name: "unknown10", type: "i32" },
  { name: "unknown1c", type: "i16" },
  { name: "unknown30", type: "i32" },
  { name: "unknown24", type: "f32" },
  { name: "unknown0c", type: "i16" },
  { name: "unknown00", type: "i32" },
  { name: "unknown28", type: "i32" },
  { name: "unknown2c", type: "i32" },
  { name: "unknown36", type: "i16" },
];

const WEAPON: Schema = [
  { name: "name", type: "str" },
  { name: "unknown04", type: "i16" },
  { count: "subs" },
  { list: "subs", of: WEAPON_SUB },
];

const SHOT: Schema = [
  { name: "name", type: "str" },
  { name: "unknown1c", type: "i32" },
  { name: "unknown34", type: "f32" },
  { name: "unknown30", type: "f32" },
  { name: "unknown28", type: "i16" },
  { name: "unknown20", type: "i32" },
  { name: "unknown2c", type: "i32" },
  { name: "unknown24", type: "i32" },
  { name: "unknown04", type: "i32" },
  { name: "unknown08", type: "i32" },
  { name: "unknown0c", type: "i32" },
  { name: "unknown10", type: "i32" },
  { name: "unknown38", type: "i32" },
  { name: "unknown3c", type: "i32" },
  { name: "unknown14", type: "i16" },
  { name: "unknown00", type: "i16" },
];

const SOUND: Schema = [
  { name: "file", type: "str" },
  { name: "unknown", type: "i32" },
];

const RADIO: Schema = [
  { name: "unknown00", type: "str" },
  { name: "id", type: "str" },
  { name: "unknown08", type: "i16" },
  { name: "unknown0c", type: "i32" },
];

export const DOVEZ_LEVEL_SCHEMA: Schema = [
  { name: "magic", type: `fixed${DOVEZ_LEVEL_MAGIC.length}` },
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
  { name: "unknownMe588", type: "i32" },
  { name: "unknownMe1d4", type: "i32" },
  { name: "unknownMe1dc", type: "i32" },
  { name: "unknownMe1d8", type: "f32" },
  { name: "music", type: "str" },
  { name: "title", type: "str" },
  { name: "unknownTail", repeat: 6, of: [{ name: "v", type: "f32" }] },
];

export type DovezLevelRow = Row;

export function parseDovezLevelDat(bytes: Uint8Array): DovezLevelRow {
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
  return row;
}

export function serializeDovezLevelDat(level: DovezLevelRow): Uint8Array {
  return writeSchema(level, DOVEZ_LEVEL_SCHEMA);
}

export function dovezLevelCoverage(level: DovezLevelRow): SchemaCoverage {
  return schemaCoverage(level, DOVEZ_LEVEL_SCHEMA);
}
