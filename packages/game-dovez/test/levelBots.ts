import type { PlayerInput } from "../src/sim/player";
import type { World } from "../src/sim/world";
import { botInput } from "./bot";
import { botInputVulnerable } from "./botVulnerable";
import { hunterInput } from "./hunter";
import { laneInput } from "./lanebot";

/** Level, in denen der Standard-Bot die Schwachstelle nicht trifft. */
export const BOTS: Readonly<Record<string, (w: World) => PlayerInput>> = {
  "level3-3_saw_machine": laneInput,
  "level4-3_cityboss": hunterInput,
  "level5-3_rumbler": botInputVulnerable,
};

/** Der Bot für ein Level: Sonderfall oder Standard. */
export const botFor = (slug: string): ((w: World) => PlayerInput) => BOTS[slug] ?? botInput;
