import type { AssetStore, AtlasJson, HudIcon, HudMeter, HudSnapshot, HudSprite } from "@clove/core";
import { bossStatus } from "../sim/bossStatus";
import type { World } from "../sim/world";
import type { Lang } from "./lang";

/** Sprites eines Atlas als `HudSprite` (Seite aus dem Manifest). */
export function atlasSprites(
  assets: AssetStore,
  atlas: AtlasJson,
): (name: string) => HudSprite | undefined {
  const cache = new Map<string, HudSprite | undefined>();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    const s = atlas.sprites[name];
    const page = s ? atlas.pages[s.page] : undefined;
    let out: HudSprite | undefined;
    if (s && page && assets.has(page)) {
      const e = assets.entry(page);
      out = {
        url: assets.url(page),
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        sheetW: e.kind === "image" ? e.width : 0,
        sheetH: e.kind === "image" ? e.height : 0,
      };
    }
    cache.set(name, out);
    return out;
  };
}

const FORCE_COLOURS = {
  de: ["blau", "rot", "gelb", "grün", "violett"],
  en: ["blue", "red", "yellow", "green", "violet"],
  ru: ["синяя", "красная", "жёлтая", "зелёная", "фиолетовая"],
} as const;

function icon(sprite: HudSprite | undefined, rest: Omit<HudIcon, "sprite">): HudIcon[] {
  return sprite ? [{ sprite, ...rest }] : rest.text ? [rest] : [];
}

/**
 * Was `SpielDisplay` und die Kombo-Anzeige zeigen, als Daten fürs HTML-HUD:
 * je Spieler Punkte (hochzählend), Energie, Beam (Typ, Ladung), Tempo,
 * Schussstärke, Extrawaffe; allein dazu D-Tonator-Slots bzw. Force; gemeinsame
 * Leben, Kombo und die Lebenspunkte des Bosses.
 */
export function dovezHud(
  w: World,
  sprite: (name: string) => HudSprite | undefined,
  lang: Lang,
): HudSnapshot {
  const two = w.playersMinus1 === 1;
  const players = w.players.map((p, n) => {
    const b = w.beams[n];
    const meters: HudMeter[] = [
      { id: "energy", value: Math.max(0, p.energy), max: p.maxEnergy },
      {
        id: "beam",
        value: b?.charge ?? 0,
        max: 165,
        full: (b?.charge ?? 0) >= 165,
        variant: b?.type ?? 0,
      },
      { id: "speed", value: Math.max(0, p.speed - 4), max: 6 },
      // wie `SpielDisplay`: bei Stärke 1 leer, 2 halb, 3 voll
      { id: "power", value: Math.max(0, Math.min(p.shotPower, 3) - 1), max: 2 },
    ];
    const icons: HudIcon[] = [];
    if (p.extraWeapon > 0)
      icons.push(
        ...icon(sprite(`${two ? "interface3" : "interface"}_extra${p.extraWeapon - 1}`), {
          label: `Extra ${p.extraWeapon}`,
        }),
      );
    if (!two && p.shipType === 0) {
      w.particles.forEach((r, k) => {
        if (!r.present) {
          icons.push({ text: "□", dim: true, label: `D-Tonator ${k + 1}` });
          return;
        }
        // Sorte 1…7: Symbol je Stufe; −1 Schild (dreimal `extra0`); 0: vorhanden, aber leer
        const selected = k === p.selected;
        const label = `D-Tonator ${k + 1}`;
        if (r.kind === 0) {
          icons.push({ text: "–", selected, label });
          return;
        }
        const shield = r.kind < 0;
        icons.push(
          ...icon(sprite(shield ? "extra0" : `extra${r.kind}`), {
            count: shield ? 3 : Math.max(1, r.level),
            selected,
            label,
          }),
        );
      });
    }
    if (!two && p.shipType === 1 && w.force.present) {
      icons.push(
        ...icon(sprite(`extra${w.force.color + 1}`), {
          count: w.force.level + 1,
          label: `Force ${FORCE_COLOURS[lang][w.force.color] ?? ""} ${w.force.level + 1}`,
        }),
      );
    }
    return { score: w.shownScore[n] ?? 0, meters, icons };
  });
  const S = w.comboHud;
  const hits = w.comboHits[0] ?? 0;
  const combo =
    (hits > 1 || S.shown > 1) && S.timer > 0 ? { hits: S.shown, bonus: S.bonus } : undefined;
  const boss = bossStatus(w.enemies, w.playersMinus1);
  return {
    lives: w.lives,
    players,
    ...(boss ? { boss } : {}),
    ...(combo ? { combo } : {}),
  };
}
