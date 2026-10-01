import type {
  GameUi,
  UiField,
  UiForm,
  UiImage,
  UiItem,
  UiReply,
  UiScreen,
  UiValues,
} from "@clove/core";
import type { DovezConfig } from "../config";
import { type HighscoreEntry, NAME_MAX } from "../highscore";
import { isKeyCode, keyName, keyText } from "../input";
import type { Lang } from "../lang";
import { EMPTY_SLOT } from "../saveGame";
import {
  BONUS_ENTRIES,
  BONUS_LEVELS,
  MUSIC_STEP,
  type Rnd,
  VOLUME_MUTE,
  VOLUME_STEPS,
  bonusCount,
  newPlayerIds,
  playerName,
  volumeIndex,
  volumeLevel,
  volumeOfIndex,
} from "./menuRules";
import { type MenuTexts, menuTexts } from "./menuTexts";

/**
 * Hauptmenü als HTML-Bildschirme der Shell (`GameHost.ui`): dieselben Seiten
 * und Texte wie `MenuLoop` (`0x559630`) — Neu → Spieler → Schiff → Namen,
 * Laden, Optionen (Grundeinstellungen, Lautstärke, Tasten mit Vibration),
 * Bonuslevel, Highscore, Exit —, aber als Folge von `ui.show`-Aufrufen statt
 * der Knopfleiste im Canvas. Die Optionen werden bei jeder Änderung gespeichert
 * (wie bisher im Port), die Tastenbelegung erst mit „Übernehmen“.
 */

export type MenuResult =
  | {
      readonly kind: "new";
      readonly players: 1 | 2;
      readonly ship: 0 | 1;
      readonly names: readonly string[];
      readonly ids: readonly number[];
      /** Bonuslevel (`Me.1158`, `Lvl`), sonst Kampagne. */
      readonly bonus: string | undefined;
    }
  | { readonly kind: "load"; readonly slot: number }
  /** Osterei: „lov“ im Hauptmenü getippt (im Original L, O und V gleichzeitig). */
  | { readonly kind: "love" }
  | { readonly kind: "exit" };

/** Töne des Menüs (`LoadMenuSound`): `plingding` beim Bewegen, `dude` beim Bestätigen. */
export type MenuSound = "dude" | "plingding" | "speech";

export interface HtmlMenuOptions {
  readonly ui: GameUi;
  readonly lang: Lang;
  /** Die `Rnd`-Folge des Spiels (Spiel-IDs nach der Namenseingabe). */
  readonly rnd: Rnd;
  /** Geschaffte Durchgänge (`[0x588080]`): Bonus ab einem. */
  readonly passes: number;
  readonly highscores: readonly HighscoreEntry[];
  /** Beschriftungen der Plätze 1…21, `undefined` = kein Spielstand. */
  readonly slots: readonly (string | undefined)[];
  readonly config: DovezConfig;
  /** Spieleranzahl, Namen und IDs aus dem letzten Spiel der Sitzung. */
  readonly players: 1 | 2;
  readonly names: readonly string[];
  readonly ids: readonly number[];
  /** Jede geänderte Option (speichern, Tasten und Musikpegel übernehmen). */
  readonly onConfig: (c: DovezConfig) => void;
  readonly sound?: ((name: MenuSound) => void) | undefined;
  /** Anzahl der Gamepads mit Vibrationsmotor. */
  readonly pads?: (() => number) | undefined;
  readonly rumble?: ((pad: number, magnitude: number) => void) | undefined;
  readonly logo?: UiImage | undefined;
  /** Vorschau der Schiffsauswahl (0 D-Tonator, 1 D-Phyton). */
  readonly shipImage?: ((ship: 0 | 1) => UiImage | undefined) | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** Probeimpuls der Vibrationszeilen: 20 Durchläufe à 18 ms. */
export const PULSE_MS = 360;

type Page =
  | "main"
  | "players"
  | "ship"
  | "names"
  | "load"
  | "options"
  | "game"
  | "volume"
  | "keys"
  | "bonus"
  | "score";

/** Der Bildschirm wurde von außen geschlossen (Spiel beendet). */
const ABORTED = Symbol("aborted");

/** Ein Durchlauf des Hauptmenüs bis Spielstart, Laden, Osterei oder Exit. */
export function htmlMenu(o: HtmlMenuOptions): Promise<MenuResult> {
  return new HtmlMenu(o).run();
}

/**
 * Zwei Texte einer Umschaltzeile („Trägheit: Ein“/„Trägheit: Aus“) als Feld:
 * gemeinsame Wörter vorn werden die Beschriftung, der Rest die Werte.
 */
export function splitChoice(on: string, off: string): { label: string; on: string; off: string } {
  const a = on.split(" ");
  const b = off.split(" ");
  let n = 0;
  while (n < a.length - 1 && n < b.length - 1 && a[n] === b[n]) n++;
  return {
    label: a.slice(0, n).join(" ").replace(/:$/, ""),
    on: a.slice(n).join(" "),
    off: b.slice(n).join(" "),
  };
}

/** Umschaltzeile der Grundeinstellungen als Auswahlfeld (`on`/`off`). */
function choiceField(id: string, text: (v: boolean) => string, value: boolean): UiField {
  const s = splitChoice(text(true), text(false));
  return {
    kind: "choice",
    id,
    label: s.label,
    options: [
      { value: "on", label: s.on },
      { value: "off", label: s.off },
    ],
    value: value ? "on" : "off",
  };
}

class HtmlMenu {
  private config: DovezConfig;
  private players: 1 | 2;
  private ship: 0 | 1 = 0;
  private bonus: string | undefined;
  private bonusFrom: Page = "options";
  private readonly names: string[];
  /** Zuletzt gewählter Eintrag je Seite (Vorauswahl beim Zurückkehren). */
  private readonly chosen = new Map<Page, string>();
  private readonly t: MenuTexts;
  private readonly bonusOn: boolean;

  constructor(private readonly o: HtmlMenuOptions) {
    this.config = o.config;
    this.players = o.players;
    this.names = [o.names[0] ?? "", o.names[1] ?? ""];
    this.t = menuTexts(o.lang);
    this.bonusOn = o.passes !== 0;
  }

  async run(): Promise<MenuResult> {
    let page: Page = "main";
    try {
      for (;;) {
        const next = await this.page(page);
        if (typeof next !== "string") return next;
        page = next;
      }
    } catch (e) {
      if (e === ABORTED) return { kind: "exit" };
      throw e;
    }
  }

  /** Töne nach dem Abarbeiten der Änderung (der neue Pegel gilt schon). */
  private play(name: MenuSound): void {
    const s = this.o.sound;
    if (s) queueMicrotask(() => s(name));
  }

  private readonly sounds = {
    move: () => this.play("plingding"),
    select: () => this.play("dude"),
  };

  private async ask(page: Page, screen: UiScreen): Promise<UiReply> {
    const r = await this.o.ui.show(screen, this.o.signal);
    if (r.id === "aborted" || this.o.signal?.aborted) throw ABORTED;
    if (screen.kind === "menu") this.chosen.set(page, r.id);
    return r;
  }

  /** Menüseite: Titel, Einträge, Esc → `back`. */
  private menu(
    page: Page,
    title: string,
    items: readonly UiItem[],
    extra: { columns?: number; selected?: string } = {},
  ): Promise<UiReply> {
    return this.ask(page, {
      kind: "menu",
      title,
      items,
      back: "back",
      selected: this.chosen.get(page) ?? items.find((i) => !i.disabled)?.id ?? "",
      sounds: this.sounds,
      ...extra,
    });
  }

  private setConfig(c: DovezConfig): void {
    this.config = c;
    this.o.onConfig(c);
  }

  private page(p: Page): Promise<Page | MenuResult> {
    switch (p) {
      case "main":
        return this.main();
      case "players":
        return this.playersPage();
      case "ship":
        return this.shipPage();
      case "names":
        return this.namesPage();
      case "load":
        return this.loadPage();
      case "options":
        return this.optionsPage();
      case "game":
        return this.gamePage();
      case "volume":
        return this.volumePage();
      case "keys":
        return this.keysPage();
      case "bonus":
        return this.bonusPage();
      case "score":
        return this.scorePage();
    }
  }

  /**
   * Seite 3. Die Aktionen hängen hier an der Bedeutung, nicht am Index wie im
   * Original: das russische „Бонус“ öffnet die Bonusseite (im Original die Highscores).
   */
  private async main(): Promise<Page | MenuResult> {
    const m = this.t.main(this.bonusOn);
    const n = m.entries.length;
    const ids = m.entries.map((_, i) =>
      i === 0
        ? "new"
        : i === 1
          ? "load"
          : i === 2
            ? "options"
            : i === n - 1
              ? "exit"
              : this.o.lang === "ru"
                ? "bonus"
                : "score",
    );
    const items = m.entries.map((label, i) => ({ id: ids[i]!, label }));
    const r = await this.ask("main", {
      kind: "menu",
      title: m.title,
      items,
      selected: this.chosen.get("main") ?? "new",
      back: "exit",
      // L + O + V (`0x546C30`): im HTML-Menü als getippte Folge
      secret: { lov: "love" },
      sounds: this.sounds,
      ...(this.o.logo ? { logo: this.o.logo } : {}),
    });
    switch (r.id) {
      case "new":
        this.bonus = undefined;
        return "players";
      case "load":
        return "load";
      case "options":
        return "options";
      case "score":
        return "score";
      case "bonus":
        this.bonusFrom = "main";
        return "bonus";
      case "love":
        return { kind: "love" };
      default:
        return { kind: "exit" };
    }
  }

  /** Seite 10: Spieleranzahl. */
  private async playersPage(): Promise<Page> {
    const { title, entries } = this.t.players;
    const r = await this.menu(
      "players",
      title,
      [
        { id: "1", label: entries[0] },
        { id: "2", label: entries[1] },
        { id: "back", label: entries[2] },
      ],
      { selected: String(this.players) },
    );
    if (r.id === "1" || r.id === "2") {
      this.players = r.id === "1" ? 1 : 2;
      return "ship";
    }
    return this.bonus ? "bonus" : "main";
  }

  /** Seite 1: Schiff, mit Vorschaubild. */
  private async shipPage(): Promise<Page> {
    const { title, entries } = this.t.ship;
    const item = (ship: 0 | 1): UiItem => {
      const image = this.o.shipImage?.(ship);
      return { id: String(ship), label: entries[ship], ...(image ? { image } : {}) };
    };
    const r = await this.menu("ship", title, [item(0), item(1), { id: "back", label: entries[2] }]);
    if (r.id === "0" || r.id === "1") {
      this.ship = r.id === "0" ? 0 : 1;
      return "names";
    }
    return "players";
  }

  /** Seite 2: Namen (je Spieler höchstens 16 Zeichen, leer → „Bruce“), dann die Spiel-IDs. */
  private async namesPage(): Promise<Page | MenuResult> {
    const players = this.players;
    const fields = Array.from({ length: players }, (_, p) => ({
      id: `name${p}`,
      label: this.t.namePrompt(p + 1),
      max: NAME_MAX,
      value: this.names[p] ?? "",
    }));
    const r = await this.ask("names", {
      kind: "input",
      title: this.t.ship.entries[this.ship],
      fields,
      ok: "OK",
      back: "back",
      sounds: { select: this.sounds.select },
    });
    if (r.id !== "ok") return "ship";
    const names = fields.map((f) => playerName(String(r.values?.[f.id] ?? ""), this.o.lang));
    names.forEach((n, p) => (this.names[p] = n));
    const ids = newPlayerIds(this.o.rnd, players, this.o.passes, this.o.highscores, this.o.ids);
    return { kind: "new", players, ship: this.ship, names, ids, bonus: this.bonus };
  }

  /** Seite 20: 21 Plätze, leere gesperrt, Vorauswahl „Zurück“. */
  private async loadPage(): Promise<Page | MenuResult> {
    const items: UiItem[] = this.o.slots.map((s, i) => ({
      id: `slot${i + 1}`,
      label: s ?? EMPTY_SLOT,
      ...(s === undefined ? { disabled: true } : {}),
    }));
    items.push({ id: "back", label: this.t.back });
    const r = await this.menu("load", this.t.load.title, items, { columns: 3, selected: "back" });
    const slot = /^slot(\d+)$/.exec(r.id)?.[1];
    return slot ? { kind: "load", slot: Number(slot) } : "main";
  }

  /** Seite 30: Grundeinstellungen, Lautstärke, Tasten, (Bonus), Zurück. */
  private async optionsPage(): Promise<Page> {
    const m = this.t.options(this.bonusOn);
    const n = m.entries.length;
    const ids = m.entries.map((_, i) =>
      i === n - 1 ? "back" : (["game", "volume", "keys"][i] ?? "bonus"),
    );
    const r = await this.menu(
      "options",
      m.title,
      m.entries.map((label, i) => ({ id: ids[i]!, label })),
    );
    switch (r.id) {
      case "game":
      case "volume":
      case "keys":
        return r.id;
      case "bonus":
        this.bonusFrom = "options";
        return "bonus";
      default:
        return "main";
    }
  }

  /** Formular mit Zurück; jede Änderung gilt sofort. */
  private form(page: Page, screen: Omit<UiForm, "kind" | "back" | "sounds">): Promise<UiReply> {
    return this.ask(page, { kind: "form", back: "back", sounds: this.sounds, ...screen });
  }

  /** Seite 31: drei Schalter. */
  private async gamePage(): Promise<Page> {
    const g = this.t.game;
    const c = this.config;
    const apply = (v: UiValues) => {
      const on = (id: string, d: boolean) => (v[id] === undefined ? d : v[id] === "on");
      const cur = this.config;
      const next = {
        ...cur,
        qNormal: on("forceKey", cur.qNormal),
        autoArrange: on("arrange", cur.autoArrange),
        realistic: on("inertia", cur.realistic),
      };
      if (
        next.qNormal !== cur.qNormal ||
        next.autoArrange !== cur.autoArrange ||
        next.realistic !== cur.realistic
      )
        this.setConfig(next);
    };
    const r = await this.form("game", {
      title: g.title,
      fields: [
        choiceField("forceKey", g.forceKey, c.qNormal),
        choiceField("arrange", g.arrange, c.autoArrange),
        choiceField("inertia", g.inertia, c.realistic),
      ],
      actions: [{ id: "back", label: this.t.back }],
      onChange: (v) => apply(v),
    });
    if (r.values) apply(r.values);
    return "options";
  }

  /** Seite 32: Musik 0…100 in Fünfern, Sound und Sprache in den Stufen von `volumeStep`. */
  private async volumePage(): Promise<Page> {
    const v = this.t.volume;
    const level = (db: number) => (db <= VOLUME_MUTE ? this.t.onOff(false) : volumeLevel(db));
    const fields = (): UiField[] => {
      const c = this.config;
      return [
        {
          kind: "range",
          id: "music",
          label: v.music,
          min: 0,
          max: 100,
          step: MUSIC_STEP,
          value: c.music,
          text: String(c.music),
        },
        {
          kind: "range",
          id: "sfx",
          label: v.sound,
          min: 0,
          max: VOLUME_STEPS,
          step: 1,
          value: volumeIndex(c.sfx),
          text: level(c.sfx),
        },
        {
          kind: "range",
          id: "speech",
          label: v.voices,
          min: 0,
          max: VOLUME_STEPS,
          step: 1,
          value: volumeIndex(c.speech),
          text: level(c.speech),
        },
      ];
    };
    /** Nur geänderte Regler schreiben: gespeicherte Zwischenwerte bleiben sonst erhalten. */
    const apply = (vals: UiValues) => {
      const c = this.config;
      const db = (id: "sfx" | "speech") => {
        const x = vals[id];
        return x === undefined || Number(x) === volumeIndex(c[id]) ? c[id] : volumeOfIndex(+x);
      };
      const music =
        vals["music"] === undefined ? c.music : Math.max(0, Math.min(100, +vals["music"]));
      const next = { ...c, music, sfx: db("sfx"), speech: db("speech") };
      if (next.music !== c.music || next.sfx !== c.sfx || next.speech !== c.speech)
        this.setConfig(next);
    };
    const r = await this.form("volume", {
      title: v.title,
      fields: fields(),
      actions: [{ id: "back", label: this.t.back }],
      onChange: (vals, changed) => {
        apply(vals);
        if (changed === "speech") this.play("speech");
        return fields();
      },
    });
    if (r.values) apply(r.values);
    return "options";
  }

  /**
   * Seite 33: die zweiten Tasten aller drei Sätze (die ersten sind fest), dazu
   * Vibration und Stärke je Pad mit Motor (mit Probeimpuls). Tasten gelten erst
   * mit „Übernehmen“, Zurück verwirft sie; die Vibration gilt sofort.
   */
  private async keysPage(): Promise<Page> {
    const kt = this.t.keys;
    const working = [...this.config.keys];
    const pads = Math.min(2, this.o.pads?.() ?? 0);
    const strength = (v: number) => (v / 1000).toFixed(1).replace(".", kt.decimal);
    const fields = (): UiField[] => {
      const c = this.config;
      const out: UiField[] = [];
      for (let pad = 0; pad < pads; pad++) {
        out.push(
          {
            kind: "choice",
            id: `vibration${pad}`,
            group: `${kt.vibration}: Pad ${pad + 1}`,
            label: kt.vibration,
            options: [
              { value: "on", label: kt.bool[0] },
              { value: "off", label: kt.bool[1] },
            ],
            value: c.vibration[pad] ? "on" : "off",
          },
          {
            kind: "range",
            id: `strength${pad}`,
            group: `${kt.vibration}: Pad ${pad + 1}`,
            label: kt.strength,
            min: 500,
            max: 10000,
            step: 500,
            value: c.vibrationStrength[pad]!,
            text: strength(c.vibrationStrength[pad]!),
          },
        );
      }
      for (let set = 0; set < 3; set++)
        kt.labels.forEach((label, a) =>
          out.push({
            kind: "key",
            id: `key${set * 10 + a}`,
            label,
            value: working[set * 10 + a] ?? "",
            text: keyText(set, a, working),
            group: kt.who[set]!,
          }),
        );
      return out;
    };
    const takeKeys = (vals: UiValues) => {
      for (const [id, v] of Object.entries(vals)) {
        const k = /^key(\d+)$/.exec(id)?.[1];
        if (k !== undefined && Number(k) < working.length && isKeyCode(v)) working[Number(k)] = v;
      }
    };
    /** Vibration übernehmen; das Pad des geänderten Felds (`changed`) bekommt einen Probeimpuls. */
    const vibration = (vals: UiValues, changed?: string) => {
      const c = this.config;
      const on: [boolean, boolean] = [c.vibration[0], c.vibration[1]];
      const s: [number, number] = [c.vibrationStrength[0], c.vibrationStrength[1]];
      for (let pad = 0; pad < pads; pad++) {
        const v = vals[`vibration${pad}`];
        if (v !== undefined) on[pad] = v === "on";
        const x = vals[`strength${pad}`];
        if (x !== undefined) s[pad] = Math.max(500, Math.min(10000, Math.round(+x / 500) * 500));
      }
      if (
        on[0] !== c.vibration[0] ||
        on[1] !== c.vibration[1] ||
        s[0] !== c.vibrationStrength[0] ||
        s[1] !== c.vibrationStrength[1]
      )
        this.setConfig({ ...c, vibration: on, vibrationStrength: s });
      const pad = /^(?:vibration|strength)(\d)$/.exec(changed ?? "")?.[1];
      if (pad !== undefined) {
        const p = Number(pad);
        this.pulse(p, changed!.startsWith("strength") ? s[p]! / 10000 : 1);
      }
    };
    const r = await this.form("keys", {
      title: kt.title,
      fields: fields(),
      actions: [
        { id: "apply", label: kt.apply },
        { id: "back", label: this.t.back },
      ],
      acceptKey: (code) => code !== "" && code !== "Escape" && isKeyCode(code),
      keyText: keyName,
      onChange: (vals, changed) => {
        if (changed.startsWith("key")) takeKeys({ [changed]: vals[changed] ?? "" });
        else vibration(vals, changed);
        return fields();
      },
    });
    if (r.values) vibration(r.values);
    if (r.id === "apply") {
      if (r.values) takeKeys(r.values);
      this.setConfig({ ...this.config, keys: [...working] });
    }
    return "options";
  }

  private pulse(pad: number, magnitude: number): void {
    const rumble = this.o.rumble;
    if (!rumble) return;
    rumble(pad, magnitude);
    setTimeout(() => rumble(pad, 0), PULSE_MS);
  }

  /** Seite 40: freigeschaltete Bonuslevel, gestartet als Einzellevel. */
  private async bonusPage(): Promise<Page> {
    const items: UiItem[] = BONUS_ENTRIES.slice(0, bonusCount(this.o.passes)).map((label, i) => ({
      id: `bonus${i}`,
      label,
    }));
    items.push({ id: "back", label: this.t.bonus.back });
    const r = await this.menu("bonus", this.t.bonus.title, items);
    const i = /^bonus(\d)$/.exec(r.id)?.[1];
    if (i === undefined) return this.bonusFrom;
    this.bonus = BONUS_LEVELS[Number(i)];
    this.chosen.set("players", "1");
    return "players";
  }

  /** Seite 50: die zehn Plätze der Highscoreliste. */
  private async scorePage(): Promise<Page> {
    const title = this.o.lang === "ru" ? "Highscore" : (this.t.main(false).entries[3] ?? "");
    await this.ask("score", {
      kind: "menu",
      title,
      blocks: [
        {
          kind: "table",
          rows: this.o.highscores.map((e, i) => [`${i + 1}.`, e.name, String(e.score)]),
        },
      ],
      items: [{ id: "back", label: this.t.scoreBack }],
      back: "back",
      sounds: this.sounds,
    });
    return "main";
  }
}
