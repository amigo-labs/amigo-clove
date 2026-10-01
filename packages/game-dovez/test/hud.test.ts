/** HTML-HUD: Schnappschuss aus dem Weltzustand und Boss-Lebenspunkte. */
import { describe, expect, test } from "bun:test";
import type { HudSprite } from "@clove/core";
import { RADIO_LIFT, TICKER_Y, dovezHud, dovezMessages } from "../src/game/hud";
import { bossStatus } from "../src/sim/bossStatus";
import { cint } from "../src/sim/vb";
import { World } from "../src/sim/world";
import { loadTestLevel } from "./assets";

const sprite = (name: string): HudSprite => ({
  url: name,
  x: 0,
  y: 0,
  w: 16,
  h: 16,
  sheetW: 64,
  sheetH: 64,
});

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && w.state === 0; t++) {
    for (const p of w.players) p.invulnerable = Math.max(p.invulnerable, 2);
    w.step([]);
    w.events.length = 0;
  }
}

describe("DoveZ-HUD", () => {
  test("zeigt, was SpielDisplay zeigt: Punkte, Leben, Energie, Beam, Tempo, Stärke, Slots", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    run(w, 5);
    const hud = dovezHud(w, sprite, "de");
    expect(hud.lives).toBe(w.lives);
    expect(hud.boss).toBeUndefined();
    const p = hud.players[0]!;
    expect(p.score).toBe(w.shownScore[0]!);
    expect(p.meters.map((m) => m.id)).toEqual(["energy", "beam", "speed", "power"]);
    const energy = p.meters[0]!;
    expect(energy.value / energy.max).toBe(1);
    // D-Tonator: vier Slots, einer gewählt; vorhandene leere Slots (Sorte 0) ohne Schild
    expect(p.icons.length).toBe(4);
    expect(p.icons.filter((i) => i.selected).length).toBeLessThanOrEqual(1);
    w.particles.forEach((r, k) => {
      if (r.present && r.kind === 0) expect(p.icons[k]).toMatchObject({ text: "–" });
      if (r.present && r.kind < 0) expect(p.icons[k]).toMatchObject({ count: 3 });
    });
    // Schussstärke wie SpielDisplay: 1 leer, 2 halb, 3 voll
    const power = (n: number) => {
      w.players[0]!.shotPower = n;
      const m = dovezHud(w, sprite, "de").players[0]!.meters.find((x) => x.id === "power")!;
      return m.value / m.max;
    };
    expect([power(1), power(2), power(3)]).toEqual([0, 0.5, 1]);
  });

  test("Zwei Spieler: kleine Extrawaffen-Symbole wie interface3", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites, { players: 2 });
    run(w, 5);
    w.players[1]!.extraWeapon = 1;
    const p = dovezHud(w, sprite, "de").players[1]!;
    expect(p.icons[0]?.sprite?.url).toBe("interface3_extra0");
  });

  test("Boss: Lebenspunkte bis zum Abschuss, danach keiner mehr", async () => {
    const { level, sprites } = await loadTestLevel("level1-2_zeppelin_boss");
    const w = new World(level, sprites);
    for (let t = 0; t < 5000 && !w.bossAlive; t++) run(w, 1);
    const status = bossStatus(w.enemies, w.playersMinus1)!;
    expect(status.max).toBeGreaterThan(0);
    expect(status.hp).toBeGreaterThan(0);
    expect(dovezHud(w, sprite, "en").boss).toEqual(status);
    const i = w.enemies.items.findIndex((e) => e?.alive && e.def.boss === 1);
    const e = w.enemies.items[i]!;
    const part = e.parts.find((q) => q.visible && q.def.armored === 0)!;
    const [x, y] = w.enemies.partPos(e, part);
    const s = w.enemies.surface(part)!;
    const ew = w["makeEnemyWorld"]();
    w.enemies.hit(cint(x), cint(y), cint(x + s.rect.w), cint(y + s.rect.h), 1e9, 0, ew);
    expect(bossStatus(w.enemies, w.playersMinus1)).toBeUndefined();
  });
});

/** Tastenname einer Aktion je Satz, für die Einblendungen. */
const label = (a: number, set: number) => `${a}/${set}`;

describe("DoveZ-HUD: Einblendungen", () => {
  test("Tastenhinweis mit der belegten Taste und Laufband an ihrer Stelle", async () => {
    const { level, sprites } = await loadTestLevel("level1-1_skyfight");
    const w = new World(level, sprites);
    run(w, 2);
    w.env.hint = { action: 4, grey: 255 } as typeof w.env.hint;
    w.radio.ticker = "     -Achtung!";
    expect(dovezMessages(w, "de", label)).toEqual([
      { id: "hint0", text: "Drücke: 4/0", at: { x: 11, y: 450 }, style: "hint", opacity: 1 },
      {
        id: "ticker",
        text: "     -Achtung!",
        at: { x: 575, y: TICKER_Y - RADIO_LIFT },
        width: 225,
        style: "ticker",
      },
    ]);
    expect(dovezHud(w, sprite, "de", label).messages).toHaveLength(2);
    expect(dovezHud(w, sprite, "de").messages).toBeUndefined();
  });
});
