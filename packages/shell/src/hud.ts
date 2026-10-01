import type { HudIcon, HudMessage, HudMeter, HudSnapshot, HudSprite } from "@clove/core";
import { h } from "./dom";
import type { GameRect, Stage } from "./overlay";
import type { ShellText, TextKey } from "./texts";

/** Ab dieser Randbreite (CSS-Pixel) stehen die Spielerblöcke neben dem Spielfeld. */
const SIDE_MIN = 176;
/** Ab dieser Randhöhe steht die Leiste unter dem Spielfeld, sonst halbtransparent darin. */
const BELOW_MIN = 60;
/** Symbole in doppelter Originalgröße. */
const ICON_SCALE = 2;

const METER_LABEL: Readonly<Record<HudMeter["id"], TextKey>> = {
  energy: "hudEnergy",
  beam: "hudBeam",
  shield: "hudShield",
  speed: "hudSpeed",
  power: "hudPower",
};

/** Wo die Spielerblöcke stehen, nach dem Platz um das Spielbild. */
export function hudLayout(
  r: GameRect,
  stageW: number,
  stageH: number,
): "side" | "below" | "inside" {
  const side = Math.min(r.x, stageW - r.x - r.w);
  if (side >= SIDE_MIN) return "side";
  if (stageH - r.y - r.h >= BELOW_MIN) return "below";
  return "inside";
}

function spriteStyle(s: HudSprite, k: number): string {
  return [
    `width:${s.w * k}px`,
    `height:${s.h * k}px`,
    `background-image:url("${encodeURI(s.url)}")`,
    `background-position:${-s.x * k}px ${-s.y * k}px`,
    `background-size:${s.sheetW * k}px ${s.sheetH * k}px`,
  ].join(";");
}

function iconKey(i: HudIcon): string {
  const s = i.sprite;
  return [s ? `${s.url}@${s.x},${s.y}` : i.text, i.count, i.selected, i.dim, i.label].join("|");
}

function iconNodes(i: HudIcon): HTMLElement {
  const n = Math.max(1, i.count ?? 1);
  const box = h("span", {
    class: "hud-icon",
    ...(i.label ? { title: i.label, "aria-label": i.label, role: "img" } : {}),
    ...(i.selected ? { "data-selected": true } : {}),
    ...(i.dim ? { "data-dim": true } : {}),
  });
  for (let k = 0; k < n; k++) {
    if (i.sprite)
      box.append(h("span", { class: "hud-sprite", style: spriteStyle(i.sprite, ICON_SCALE) }));
    else box.append(h("span", { class: "hud-glyph" }, i.text ?? ""));
  }
  return box;
}

/** Ein Balken; nur geänderte Werte fassen das DOM an. */
class Meter {
  readonly el: HTMLElement;
  private readonly fill: HTMLElement;
  private last = "";

  constructor(
    readonly id: HudMeter["id"],
    label: string,
  ) {
    this.fill = h("i");
    this.el = h(
      "div",
      { class: "hud-meter", "data-id": id },
      h("span", {}, label),
      h("b", {}, this.fill),
    );
  }

  set(m: HudMeter): void {
    const v = m.max > 0 ? Math.max(0, Math.min(1, m.value / m.max)) : 0;
    const key = `${v.toFixed(3)}|${m.full}|${m.variant}`;
    if (key === this.last) return;
    this.last = key;
    this.fill.style.width = `${(v * 100).toFixed(1)}%`;
    this.el.toggleAttribute("data-full", m.full === true);
    if (m.variant === undefined) delete this.el.dataset["variant"];
    else this.el.dataset["variant"] = String(m.variant);
  }
}

class PlayerBlock {
  readonly el: HTMLElement;
  private readonly score = h("b", { class: "hud-value" });
  private readonly meters = h("div", { class: "hud-meters" });
  private readonly icons = h("div", { class: "hud-icons" });
  private readonly bars = new Map<string, Meter>();
  private meterKey = "";
  private iconsKey = "";
  private lastScore = -1;

  constructor(
    private readonly t: ShellText,
    index: number,
    players: number,
  ) {
    const title = players > 1 ? `${t("hudPlayer")} ${index + 1}` : t("hudScore");
    this.el = h(
      "section",
      { class: "hud-player", "data-player": String(index) },
      h("div", { class: "hud-score" }, h("span", {}, title), this.score),
      this.meters,
      this.icons,
    );
  }

  set(p: HudSnapshot["players"][number]): void {
    if (p.score !== this.lastScore) {
      this.lastScore = p.score;
      this.score.textContent = String(p.score);
    }
    const mk = p.meters.map((m) => m.id).join();
    if (mk !== this.meterKey) {
      this.meterKey = mk;
      this.bars.clear();
      this.meters.replaceChildren(
        ...p.meters.map((m) => {
          const bar = new Meter(m.id, this.t(METER_LABEL[m.id]));
          this.bars.set(m.id, bar);
          return bar.el;
        }),
      );
    }
    for (const m of p.meters) this.bars.get(m.id)?.set(m);
    const ik = p.icons.map(iconKey).join("/");
    if (ik !== this.iconsKey) {
      this.iconsKey = ik;
      this.icons.replaceChildren(...p.icons.map(iconNodes));
    }
  }
}

/**
 * Einblendungen im Spielfeld: ohne Position oben mittig untereinander, sonst an
 * der Stelle des Originals in Spielpixeln (skaliert mit `--px`). Nur geänderte
 * Texte und Deckkräfte fassen das DOM an.
 */
class Messages {
  readonly top = h("div", { class: "hud-messages", "aria-live": "polite" });
  readonly placed = h("div", { class: "hud-placed", "aria-hidden": "true" });
  private readonly shown = new Map<string, { el: HTMLElement; text: string; opacity: string }>();

  set(list: readonly HudMessage[]): void {
    const seen = new Set<string>();
    for (const m of list) {
      seen.add(m.id);
      let cur = this.shown.get(m.id);
      if (!cur) {
        const el = h("p", { class: "hud-message", "data-style": m.style ?? "text" });
        if (m.at) {
          el.style.left = `calc(var(--game-x) + ${m.at.x} * var(--px) * 1px)`;
          el.style.top = `calc(var(--game-y) + ${m.at.y} * var(--px) * 1px)`;
          if (m.width !== undefined) el.style.width = `calc(${m.width} * var(--px) * 1px)`;
          this.placed.append(el);
        } else this.top.append(el);
        cur = { el, text: "", opacity: "" };
        this.shown.set(m.id, cur);
      }
      if (m.at) {
        cur.el.style.left = `calc(var(--game-x) + ${m.at.x} * var(--px) * 1px)`;
        cur.el.style.top = `calc(var(--game-y) + ${m.at.y} * var(--px) * 1px)`;
      }
      if (cur.text !== m.text) {
        cur.text = m.text;
        cur.el.textContent = m.text;
      }
      const opacity = m.opacity === undefined ? "" : m.opacity.toFixed(2);
      if (cur.opacity !== opacity) {
        cur.opacity = opacity;
        cur.el.style.opacity = opacity;
      }
    }
    for (const [id, cur] of this.shown) {
      if (seen.has(id)) continue;
      cur.el.remove();
      this.shown.delete(id);
    }
  }
}

/**
 * HTML-HUD der Shell: liest einmal pro Bild `GameInstance.hud()` und zeigt
 * Punkte, Leben, Balken und Symbole beider Spiele — neben dem Spielfeld, wenn
 * Platz ist, sonst darunter bzw. als schmale Leiste darin. Oben erscheint im
 * Bosskampf ein Lebensbalken. Ansagen für Screenreader über eine Live-Region.
 */
export class HudView {
  private readonly root = h("div", { class: "hud", hidden: true });
  private readonly boss = h("div", { class: "hud-boss", hidden: true });
  private readonly bossFill = h("i");
  private readonly lives = h("b", { class: "hud-value" });
  private readonly combo = h("div", { class: "hud-combo", hidden: true });
  private readonly bar = h("div", { class: "hud-bar" });
  private readonly live = h("div", { class: "sr-only", "aria-live": "polite" });
  private readonly messages = new Messages();
  private blocks: PlayerBlock[] = [];
  private raf = 0;
  private lastLives: number | undefined;
  private bossShown = false;

  constructor(
    private readonly stage: Stage,
    private readonly t: ShellText,
    private readonly source: () => HudSnapshot | null | undefined,
    private readonly enabled: () => boolean,
  ) {
    this.boss.append(h("span", {}, t("hudBoss")), h("b", {}, this.bossFill));
    const livesBox = h("div", { class: "hud-lives" }, h("span", {}, t("hudLives")), this.lives);
    this.root.append(this.messages.placed, this.messages.top, this.boss, this.bar, this.live);
    this.bar.append(livesBox, this.combo);
    stage.layer.append(this.root);
    stage.onLayout((r) => this.place(r));
    const tick = () => {
      this.update();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private place(r: GameRect): void {
    const layout = hudLayout(r, this.stage.root.clientWidth, this.stage.root.clientHeight);
    this.root.dataset["layout"] = layout;
  }

  private announce(text: string): void {
    this.live.textContent = text;
  }

  private update(): void {
    const snap = this.enabled() ? this.source() : null;
    if (!snap) {
      this.root.hidden = true;
      this.lastLives = undefined;
      this.bossShown = false;
      this.messages.set([]);
      return;
    }
    this.messages.set(snap.messages ?? []);
    if (this.root.hidden) {
      this.root.hidden = false;
      this.place(this.stage.rect());
    }
    if (this.blocks.length !== snap.players.length) {
      for (const b of this.blocks) b.el.remove();
      this.blocks = snap.players.map((_, i) => new PlayerBlock(this.t, i, snap.players.length));
      this.bar.append(...this.blocks.map((b) => b.el));
      this.root.dataset["players"] = String(snap.players.length);
    }
    snap.players.forEach((p, i) => this.blocks[i]?.set(p));
    if (snap.lives !== this.lastLives) {
      if (this.lastLives !== undefined && snap.lives < this.lastLives)
        this.announce(this.t("hudLifeLost"));
      this.lastLives = snap.lives;
      this.lives.textContent = String(Math.max(0, snap.lives));
    }
    const boss = snap.boss;
    if (boss && boss.max > 0 && boss.hp > 0) {
      if (!this.bossShown) this.announce(this.t("hudBossAppears"));
      this.bossShown = true;
      this.boss.hidden = false;
      this.bossFill.style.width = `${((100 * Math.min(boss.hp, boss.max)) / boss.max).toFixed(1)}%`;
    } else {
      if (this.bossShown) this.announce(this.t("hudBossDefeated"));
      this.bossShown = false;
      this.boss.hidden = true;
    }
    const combo = snap.combo;
    this.combo.hidden = !combo || combo.hits < 2;
    if (combo && combo.hits >= 2) {
      this.combo.textContent = this.t("hudCombo", { hits: combo.hits, bonus: combo.bonus });
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }
}
