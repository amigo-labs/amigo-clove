import { DrawList, Effects, type EffectWorld } from "../../sim/effects";
import { COS_DEG, SIN_DEG, cint, degIndex, f32, vbInt, type VbRnd } from "../../sim/vb";
import type { DovezConfig } from "../config";
import { DEFAULT_NAME, type HighscoreEntry, NAME_MAX } from "../highscore";
import type { Lang } from "../lang";
import { type MenuTexts, menuTexts } from "./menuTexts";

/**
 * Hauptmenü `MenuLoop` (`0x559630`) als Logik: je Durchlauf (`Wait 18`) die
 * Seite aufbauen, `ShowMenu` (`0x558890`: Punktketten mit `Rnd`, Knopfversatz,
 * dann ↑/↓), Tafel, `ShowList` (`0x558500`), OK und Zurück mit Flanke, dann
 * Gleiten der Knopfleiste und Einschub der Tafel. Befund:
 * `docs/measurements/dovez-runtime.md` („Hauptmenü“). Die Texte je Sprache
 * (Deutsch, Englisch, Russisch) stehen in `menuTexts.ts`.
 */

export type MenuPage = 1 | 2 | 3 | 10 | 20 | 30 | 31 | 32 | 33 | 40 | 50;

export interface MenuKeys {
  readonly up: boolean;
  readonly down: boolean;
  /** `TasteOK` (Feuer, Beam, Leertaste, Enter). */
  readonly ok: boolean;
  /** `TasteZurück` (Esc, D, Q). */
  readonly back: boolean;
  /** `TastePause` (Esc). */
  readonly pause: boolean;
  /** Fenster hat den Fokus (`GetFocus() = hWnd`). */
  readonly focus: boolean;
  /** Letztes `KeyAscii` (Namenseingabe), 0 = keins. */
  readonly char: number;
  /** Gehaltene Tasten als DIK-Codes aufsteigend (Tastenaufnahme, `Keys(k)`). */
  readonly held: readonly number[];
}

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
  /** Osterei: L, O und V gleichzeitig im Hauptmenü (`Me.588018 = 8`). */
  | { readonly kind: "love" }
  | { readonly kind: "exit" };

export type MenuSound =
  | { readonly name: "dude" | "plingding"; readonly gain: "sfx" }
  | { readonly name: "speech"; readonly gain: "speech" };

/** Eine Zeile von `ShowList`: Text, Farbe (x, y) und Farbe (x + 1, y + 1) als RGB. */
export interface ListRow {
  /** Zeile i steht bei y + 20·i. */
  readonly index: number;
  readonly text: string;
  readonly color: number;
  readonly top: number;
}

/** Was ein Durchlauf zeichnet (Werte zum Zeitpunkt des Zeichnens). */
export interface MenuDraw {
  /** `Me.584`. */
  readonly frame: number;
  /** α von `hangar_frozen` über dem Hangar; ≥ 1: nur noch `hangar_frozen`. */
  readonly frozen: number;
  /** Rauschstärke für `MakeSomeNoise` (`Me.6D0`). */
  readonly noise: number;
  readonly menu: {
    readonly x: number;
    readonly y: number;
    readonly title: string;
    readonly entries: readonly string[];
    readonly sel: number;
    readonly offsets: readonly number[];
  };
  /** Tafel vor der Knopfleiste (Seiten 2 und 32). */
  readonly panelFirst: boolean;
  readonly panel: readonly [number, number, number, number] | undefined;
  /** Schiffsdrehung: Sprite-Schlüssel und α, bei (510 + k, 310). */
  readonly ship: readonly { readonly key: string; readonly alpha: number }[] | undefined;
  readonly shipX: number;
  readonly list:
    | { readonly x: number; readonly y: number; readonly rows: readonly ListRow[] }
    | undefined;
  /** Highscore-Punkte rechtsbündig an 800 − 6 (Zeile n bei y = 20n + 225). */
  readonly scores: readonly string[] | undefined;
  /** Leuchtlinien der Highscore-Seite. */
  readonly lines: DrawList | undefined;
  /** `Blenden`: dieses fertige Bild erfassen, darüber ab dem nächsten Bild ausblenden. */
  readonly blend: boolean;
  /** `MakeSomeNoise(noise)`: 4 × 3 Kacheln `noise` à 256², Ausschnitt (sx, sy)–(sx2, sy2) gekachelt/gespiegelt. */
  readonly noiseTiles: readonly (readonly [number, number, number, number])[];
}

/** `QBColor(n)` als RGB. */
export function qbColor(n: number): number {
  const table = [
    0x000000, 0x000080, 0x008000, 0x008080, 0x800000, 0x800080, 0x808000, 0xc0c0c0, 0x808080,
    0x0000ff, 0x00ff00, 0x00ffff, 0xff0000, 0xff00ff, 0xffff00, 0xffffff,
  ];
  // QBColor liefert BGR (&H00BBGGRR); die Tabelle ist schon in RGB
  return table[n] ?? 0;
}

interface ListState {
  x: number;
  y: number;
  rows: string[];
  selectable: boolean[];
  sel: number;
}

const DASHES = (n: number) => "-".repeat(n);
const menuArgs = (m: { title: string; entries: readonly string[] }): [string, string[]] => [
  m.title,
  [...m.entries],
];
const sinD = (a: number) => SIN_DEG[degIndex(a)] ?? 0;
const cosD = (a: number) => COS_DEG[degIndex(a)] ?? 0;

/** Anzeige eines Pegels (1/100 dB): `CLng((v + 5000) / 50)`, 0 dB = 100. */
export function volumeLevel(v: number): string {
  return String(cint((v + 5000) / 50));
}

/** OK auf Sound/Sprache: +250; unter −5000 → −4500; über 0 → −10000 (stumm). */
export function volumeStep(v: number): number {
  let w = v + 250;
  if (w < -5000) w = -4500;
  if (w > 0) w = -10000;
  return w;
}

/**
 * `MakeSomeNoise` (`0x4FEBC0`): je Kachel (4 × 3, spaltenweise) Ausschnitt
 * (sx, sy)–(sx2, sy2) im 256²-Bild `noise`, gespiegelt je nach Vorzeichen; 48 `Rnd`.
 */
export function rollNoise(rnd: VbRnd): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const sx = cint(rnd.next() * 255);
    const sy = cint(rnd.next() * 255);
    const sx2 = cint((vbInt(rnd.next() * 2) * 2 - 1) * 255 + sx);
    const sy2 = cint((vbInt(rnd.next() * 2) * 2 - 1) * 255 + sy);
    out.push([sx, sy, sx2, sy2]);
  }
  return out;
}

/** Bonuslevel (`Lvl` auf Seite 40). */
export const BONUS_LEVELS = ["Level8-1 Jungle", "Spacestation Bonus", "Level Bleistift"] as const;

export interface MenuOptions {
  readonly lang: Lang;
  readonly rnd: VbRnd;
  /** Geschaffte Durchgänge (`[0x588080]`). */
  readonly passes: number;
  readonly highscores: readonly HighscoreEntry[];
  /** Beschriftungen der Plätze 1…21, `undefined` = kein Spielstand. */
  readonly slots: readonly (string | undefined)[];
  readonly config: DovezConfig;
  /** Spieleranzahl − 1 aus dem letzten Spiel (`Me.1288.7B4`). */
  readonly playersMinus1: 0 | 1;
  /** Namen aus dem letzten Spiel der Sitzung (`P[p].68`). */
  readonly names: readonly string[];
  /** Spiel-IDs aus dem letzten Spiel (`P[p].6C`, Eindeutigkeit gegen den anderen Spieler). */
  readonly ids: readonly number[];
  /** Tastenzeile der Tastenkonfiguration (`GetKeyText`): Satz, Aktion 0…9, zweite Tasten. */
  readonly keyText: (set: number, action: number, keys: readonly string[]) => string;
  /** DIK → `KeyboardEvent.code` (`""` unbekannt). */
  readonly codeOfDik?: (dik: number) => string;
  /** Bildzähler beim Start (`Me.584` läuft vom Spiel bzw. den Logos weiter). */
  readonly frame?: number;
}

const QUIET: Omit<EffectWorld, "tick"> = {
  gravity: 0,
  groups: [],
  surfaces: [],
  terrain: () => false,
  sound: () => {},
};

export class MenuLogic {
  page: MenuPage = 3;
  /** `Me.66C`. */
  sel = 0;
  /** Knopfleisten-Texte `Me.660`: Titel und Einträge (bleiben, bis eine Seite sie neu setzt). */
  title = "";
  entries: string[] = [];
  /** `Me.644`: Knopfversatz je Eintrag. */
  readonly offsets = [0, 0, 0, 0, 0, 0];
  mx = -1000;
  my = 200;
  zx = -1000;
  zy = 200;
  /** Einschub der Tafel. */
  off = 0;
  /** α des Hangars (`[ebp-0x150]`). */
  frozen = -1;
  frame: number;
  config: DovezConfig;
  /** Spieleranzahl − 1 (`np1`). */
  np1: 0 | 1;
  ship: 0 | 1 = 0;
  readonly names: string[];
  readonly ids: number[];
  bonus: string | undefined;
  /** Spieler der Namenseingabe (`[ebp-0x28]`). */
  private p = 0;
  /** Tastenkonfiguration: Satz 0…2. */
  private keySet = 0;
  /**
   * Tastenkonfiguration: Arbeitsstand der zweiten Tasten (`0x588174` Block 3…5) seit dem
   * Betreten von Seite 33; `config.keys` ist der zuletzt übernommene Stand (`[ebp-0x138]`).
   */
  private working: string[] | undefined;
  /**
   * Tastenaufnahme (`[ebp-0x13c]`): `wait` bis OK losgelassen ist, `scan` wartet auf eine Taste
   * (Zeile blinkt), `hold` nimmt weitere Tasten auf, solange die erste gehalten wird, `esc`
   * wartet auf das Loslassen von Esc (Abbruch).
   */
  private capture:
    | { state: "wait" | "scan" | "esc" }
    | { state: "hold"; dik: number; index: number }
    | undefined;
  private captureIndex = 0;
  private okFree = false;
  private backFree = false;
  private menuDownFree = false;
  private menuUpFree = false;
  private listDownFree = false;
  private listUpFree = false;
  private readonly list: ListState = { x: 0, y: 0, rows: [], selectable: [], sel: 0 };
  private blendNow = false;
  readonly fx: Effects;
  readonly sounds: MenuSound[] = [];
  result: MenuResult | undefined;

  constructor(private readonly o: MenuOptions) {
    this.frame = o.frame ?? 0;
    this.config = o.config;
    this.np1 = o.playersMinus1;
    this.names = [o.names[0] ?? "", o.names[1] ?? ""];
    this.ids = [o.ids[0] ?? 0, o.ids[1] ?? 0];
    this.fx = new Effects(o.rnd, 0);
  }

  private get t(): MenuTexts {
    return menuTexts(this.o.lang);
  }

  get lang(): Lang {
    return this.o.lang;
  }

  /** `Blenden` (`0x4A9FA0`): Überblende vom fertigen Bild dieses Durchlaufs. */
  private blend(): void {
    this.blendNow = true;
  }

  private sound(name: "dude" | "plingding"): void {
    this.sounds.push({ name, gain: "sfx" });
  }

  private goto(page: MenuPage): void {
    this.page = page;
  }

  /** Ein Durchlauf; das Ergebnis des Durchlaufs steht danach in `result`. */
  step(k: MenuKeys): MenuDraw {
    this.blendNow = false;
    this.fx.beginTick();
    this.frame++;
    // Hangar und Vereisung (#3C–#46)
    const frozen = this.frozen;
    if (this.frozen >= 1) this.frozen = 1;
    else this.frozen = f32(this.frozen + 0.01);
    const noise = f32(Math.max(0, this.frozen) * 0.025);
    const d = this.runPage(k);
    this.mx = f32(this.mx + (this.zx - this.mx) / 4);
    this.my = f32(this.my + (this.zy - this.my) / 4);
    if (this.off > 0) this.off = cint((this.off * 3) / 4 - 1);
    this.fx.moveSparks(1, 0.2);
    this.fx.moveBig({ ...QUIET, tick: this.frame });
    // OverlayEffekte: Rauschen, sobald der Hangar vereist (48 `Rnd`)
    const noiseTiles = noise > 0 ? rollNoise(this.o.rnd) : [];
    return {
      ...d,
      frame: this.frame,
      frozen,
      noise: Math.max(0, noise),
      blend: this.blendNow,
      noiseTiles,
    };
  }

  // --- Seiten -------------------------------------------------------------

  private runPage(
    k: MenuKeys,
  ): Omit<MenuDraw, "frame" | "frozen" | "noise" | "blend" | "noiseTiles"> {
    const t = this.t;
    // Seiten 2 und 32 zeichnen die Tafel vor der Knopfleiste
    const panelFirst = this.page === 2 || this.page === 32;
    let locked = true;
    let panel: [number, number, number, number] | undefined;
    let ship: { key: string; alpha: number }[] | undefined;
    let scores: string[] | undefined;
    let lines: DrawList | undefined;
    let fillList: (() => void) | undefined;
    switch (this.page) {
      case 3:
        this.setMenu(...menuArgs(t.main(this.o.passes !== 0)));
        this.zx = 155;
        this.zy = 165;
        locked = false;
        // L (DIK 0x26), O (0x18) und V (0x2F) zugleich gehalten: das Osterei
        if (!this.result && [38, 24, 47].every((d) => k.held.includes(d)))
          this.result = { kind: "love" };
        break;
      case 10:
        this.setMenu(...menuArgs(t.players));
        this.zx = 155;
        this.zy = 195;
        locked = false;
        break;
      case 1:
        this.setMenu(...menuArgs(t.ship));
        this.zx = 10;
        this.zy = 165;
        locked = false;
        break;
      case 2:
        panel = [480 + this.off, 295, 800, 395];
        fillList = () => {
          const p = this.p;
          const cursor = this.frame % 2 === 0 ? "_" : "";
          this.setList(520, 305, 1, [
            [t.namePrompt(p + 1), false],
            [this.names[p]! + cursor, true],
          ]);
        };
        break;
      case 20:
        this.zx = 10;
        panel = [420 + this.off, 10, 800, 585];
        break;
      case 30:
        this.setMenu(...menuArgs(t.options(this.o.passes !== 0)));
        this.zx = 5;
        this.zy = 165;
        locked = false;
        break;
      case 31:
        panel = [330 + this.off, 245, 800, 505];
        fillList = () => {
          const c = this.config;
          const g = t.game;
          this.setList(385, 255, this.list.sel, [
            [g.title, false],
            [DASHES(g.dashes), false],
            ["", false],
            [g.forceKey(c.qNormal), true],
            [g.arrange(c.autoArrange), true],
            [g.inertia(c.realistic), true],
            ["", false],
            [t.back, true],
          ]);
        };
        break;
      case 32:
        panel = [480 + this.off, 245, 800, 445];
        fillList = () => {
          const c = this.config;
          const v = t.volume;
          this.setList(540, 255, this.list.sel, [
            [v.title, false],
            [DASHES(32), false],
            ["", false],
            [`${v.music}: ${c.music}`, true],
            [`${v.sound}: ${volumeLevel(c.sfx)}`, true],
            [`${v.voices}: ${volumeLevel(c.speech)}`, true],
            ["", false],
            [t.back, true],
          ]);
        };
        break;
      case 33:
        panel = [300 + this.off, 110, 800, 595];
        fillList = () => {
          const set = this.keySet;
          const kt = t.keys;
          const rows: [string, boolean][] = [
            [kt.title, false],
            [DASHES(kt.dashes), false],
            ["", false],
            [`${kt.whoPrefix}${kt.who[set]!}`, true],
            [`${kt.device}: ${kt.keyboard}`, true],
            ["", false],
          ];
          const keys = this.working ?? this.config.keys;
          kt.labels.forEach((l, a) => rows.push([`${l}: ${this.o.keyText(set, a, keys)}`, true]));
          rows.push(
            ["", false],
            ["", false],
            ["", false],
            ["", false],
            [kt.apply, true],
            [t.back, true],
          );
          this.setList(390, 130, this.list.sel, rows);
        };
        break;
      case 40: {
        const n = Math.min(this.o.passes, 3);
        const entries: string[] = ["JUNGLE", "SPACE", "STIFT"].slice(0, n);
        entries.push(t.bonus.back);
        this.setMenu(t.bonus.title, entries);
        this.zx = 155;
        this.zy = 215;
        locked = false;
        break;
      }
      case 50:
        this.zx = 10;
        panel = [360 + this.off, 200, 800, 545];
        break;
    }
    const menu = this.showMenu(k, locked);
    if (this.page === 1 && this.sel < 2) {
      panel = [450 + this.off, 280, 800, 595];
      ship = this.shipFrames();
    } else if (this.page === 1) this.off = 400;
    let list: MenuDraw["list"];
    if (this.off === 0) {
      if (this.page === 50) {
        lines = this.highscoreLines();
        const rnd = this.o.rnd;
        const r = Array.from({ length: 7 }, () => rnd.next()) as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        this.fx.addBig(
          r[0] * 600 + 400,
          r[1] * 230 + 245,
          r[2] * 5 - 3,
          r[3] * 5 - 3,
          1,
          r[4] * 0.5 + 0.5,
          r[5] * 0.5,
          4,
          2,
          10,
          14,
          r[6] * 4 + 2,
        );
        const rows: [string, boolean][] = this.o.highscores.map((e, i) => [
          `${i + 1}. ${e.name.padEnd(16, " ")}`,
          false,
        ]);
        rows.push(["", false], [t.scoreBack, true]);
        this.setList(410, 245, 11, rows);
        scores = this.o.highscores.map((e) => String(e.score));
      }
      fillList?.();
      if (this.page === 2 || this.page === 20 || this.page === 50 || fillList) {
        const capturing = this.page === 33 && this.capture !== undefined;
        // Tastenseite: die Zeile der Aufnahme blinkt gelb, alle 3 Durchläufe wechselnd
        const blink =
          this.page === 33 &&
          this.capture?.state === "scan" &&
          Math.trunc(this.frame / 3) % 2 === 0;
        list = this.showList(k, this.page === 2 || capturing, blink);
      }
    }
    this.actions(k);
    return {
      menu,
      panelFirst,
      panel,
      ship,
      shipX: 510 + this.off,
      list,
      scores,
      lines,
    };
  }

  private setMenu(title: string, entries: string[]): void {
    this.title = title;
    this.entries = entries;
  }

  private setList(x: number, y: number, sel: number, rows: [string, boolean][]): void {
    const l = this.list;
    l.x = x;
    l.y = y;
    l.rows = rows.map((r) => r[0]);
    l.selectable = rows.map((r) => r[1]);
    l.sel = sel;
  }

  /** Liste der Seite 20, einmal beim Betreten gebaut; Vorauswahl „Zurück“. */
  private buildLoadList(): void {
    const t = this.t;
    const rows: [string, boolean][] = [
      [t.load.title, false],
      [DASHES(20), false],
      ["", false],
    ];
    for (let i = 0; i < 21; i++) {
      const s = this.o.slots[i];
      rows.push(s === undefined ? ["---", false] : [s, true]);
    }
    rows.push(["", false], [t.back, true]);
    this.setList(475, 35, 25, rows);
  }

  // --- ShowMenu -----------------------------------------------------------

  private showMenu(k: MenuKeys, locked: boolean): MenuDraw["menu"] {
    const n = this.entries.length - 1;
    const rnd = this.o.rnd;
    const x = this.mx;
    const y = this.my;
    // zwei Punktketten, je Punkt ein `Rnd` (Funkengarbe 1 : 20 000)
    for (let chain = 0; chain < 2; chain++) {
      let cx = 0;
      for (let yy = 67; yy <= 67 * n + 149; yy += 2) {
        const r = (yy - 66) % 67;
        if (chain === 1)
          cx = cint((SIN_DEG[degIndex(cint((yy + 100 * n + 10) * 2.2))] ?? 0) * 25 + 90);
        else if (r < 30 || r > 50) cx = cint((SIN_DEG[degIndex((yy + 42 * n) * 2)] ?? 0) * 25 + 90);
        if (rnd.next() < 0.00005) {
          const px = cint(x + cx);
          const py = cint(y + yy);
          this.fx.addSparks(0, 10, px, py, px, py, false);
        }
      }
    }
    this.fx.moveSparks(0, 0.2);
    for (let i = 0; i <= n; i++) {
      const v = this.offsets[i] ?? 0;
      if (this.sel === i) this.offsets[i] = f32(v + (30 - v) / 3);
      else this.offsets[i] = Math.max(0, f32(v - 3));
    }
    const draw = {
      x,
      y,
      title: this.title,
      entries: [...this.entries],
      sel: this.sel,
      offsets: this.offsets.slice(0, n + 1),
    };
    if (k.focus && !locked) {
      if (k.down) {
        if (this.menuDownFree) {
          this.sel++;
          if (this.sel > n) this.sel = 0;
        }
        this.menuDownFree = false;
      } else this.menuDownFree = true;
      if (k.up) {
        if (this.menuUpFree) {
          this.sel--;
          if (this.sel < 0) this.sel = n;
        }
        this.menuUpFree = false;
      } else this.menuUpFree = true;
    }
    return draw;
  }

  /** Punktketten der Knopfleiste (statisch, nur von n abhängig): `[x, y]` relativ zur Leiste. */
  static dots(n: number): { red: [number, number][]; white: [number, number][] } {
    const red: [number, number][] = [];
    const white: [number, number][] = [];
    for (let yy = 67; yy <= 67 * n + 149; yy += 2) {
      const r = (yy - 66) % 67;
      if (r < 30 || r > 50)
        red.push([cint((SIN_DEG[degIndex((yy + 42 * n) * 2)] ?? 0) * 25 + 90), yy]);
      white.push([cint((SIN_DEG[degIndex(cint((yy + 100 * n + 10) * 2.2))] ?? 0) * 25 + 90), yy]);
    }
    return { red, white };
  }

  // --- ShowList -----------------------------------------------------------

  /** `blink`: die gewählte Zeile bekommt statt Weiß Gelb (Farbe −1, Tastenaufnahme). */
  private showList(k: MenuKeys, locked: boolean, blink = false): MenuDraw["list"] {
    const l = this.list;
    const rows: ListRow[] = [];
    l.rows.forEach((text, i) => {
      if (text.length === 0) return;
      const f = l.selectable[i] ? -1 : 0;
      const color = qbColor(f + 8);
      const top = qbColor(f + 8 + (i === l.sel ? 8 + (blink ? -1 : 0) : 0));
      rows.push({ index: i, text, color, top });
    });
    const draw = { x: l.x, y: l.y, rows };
    if (k.focus && !locked && l.selectable.some(Boolean)) {
      const n = l.rows.length - 1;
      if (k.down) {
        if (this.listDownFree)
          do {
            l.sel++;
            if (l.sel > n) l.sel = 0;
          } while (!l.selectable[l.sel]);
        this.listDownFree = false;
      } else this.listDownFree = true;
      if (k.up) {
        if (this.listUpFree)
          do {
            l.sel--;
            if (l.sel < 0) l.sel = n;
          } while (!l.selectable[l.sel]);
        this.listUpFree = false;
      } else this.listUpFree = true;
    }
    return draw;
  }

  // --- Seitenteile --------------------------------------------------------

  /** Schiffsdrehung (Seite 1): D-Tonator `shipselect1…` rückwärts, D-Phyton `shipselect0…` vorwärts. */
  private shipFrames(): { key: string; alpha: number }[] {
    let t = this.frame;
    const d = 2;
    if (Math.trunc(t / d) - 3 < 0) t = 3 * d;
    const q = Math.trunc(t / 2);
    const r = t % 2;
    const side = this.sel === 0 ? 1 : 0;
    const key = (f: number) => {
      const i = ((f % 37) + 37) % 37;
      const img = side === 1 ? 36 - i : i;
      return `shipselect${side}00${String(img).padStart(2, "0")}`;
    };
    return [
      { key: key(q - 1), alpha: 1 },
      { key: key(q), alpha: f32(r / d) },
      { key: key(q - 3), alpha: f32(0.25 - r / 20) },
      { key: key(q - 2), alpha: f32(r / 20) },
    ];
  }

  /** Leuchtlinien der Highscore-Seite (`Linie`, additiv). */
  private highscoreLines(): DrawList {
    const out = new DrawList();
    const t = this.frame;
    const s = sinD;
    const c = cosD;
    out.line(
      602,
      246,
      602,
      268,
      200,
      [1, 1, 0.2, f32(s(t) * 0.1 + 0.1)],
      [1, 1, 0.2, f32(c(t) * 0.1 + 0.1)],
      true,
    );
    out.line(
      405,
      256,
      800,
      256,
      12,
      [1, 1, 0.2, f32(s(2 * t) * 0.1 + 0.3)],
      [1, 1, 0.2, f32(c(2 * t) * 0.1 + 0.3)],
      true,
    );
    out.line(405, 276, 800, 276, 12, [1, 1, 1, 0.3], [1, 1, 1, 0.3], true);
    out.line(405, 296, 800, 296, 12, [0.6, 0.2, 0, 0.3], [0.6, 0.2, 0, 0.3], true);
    return out;
  }

  // --- OK und Zurück ------------------------------------------------------

  private okEdge(k: MenuKeys): boolean {
    const hit = k.ok && this.okFree;
    this.okFree = !k.ok;
    return hit;
  }

  private backEdge(pressed: boolean): boolean {
    const hit = pressed && this.backFree;
    this.backFree = !pressed;
    return hit;
  }

  private actions(k: MenuKeys): void {
    if (!k.focus) return;
    const page = this.page;
    const n = this.entries.length - 1;
    const sel = this.sel;
    if (page === 33 && this.stepCapture(k)) return;
    if (page === 2) {
      this.nameInput(k);
      if (this.backEdge(k.pause)) {
        this.blend();
        this.goto(1);
      }
      return;
    }
    if (this.okEdge(k)) {
      switch (page) {
        case 3:
          if (sel === 0) {
            this.sound("dude");
            this.blend();
            this.bonus = undefined;
            this.goto(10);
          } else if (sel === 1) {
            this.sound("dude");
            this.blend();
            this.goto(20);
            this.off = 400;
            this.list.rows = [];
            this.buildLoadList();
          } else if (sel === 2) {
            this.sound("dude");
            this.blend();
            this.goto(30);
            this.sel = 0;
          } else if (sel === n) {
            this.sound("dude");
            this.result = { kind: "exit" };
          } else if (sel === 3) {
            this.sound("dude");
            this.blend();
            this.goto(50);
            this.off = 400;
          }
          break;
        case 10:
          if (sel === 0 || sel === 1) {
            this.sound("dude");
            // 2 Spieler: ohne `Blenden` (so im Original)
            if (sel === 0) this.blend();
            this.goto(1);
            this.np1 = sel;
            this.off = 400;
            this.sel = 0;
          } else {
            this.sound("dude");
            this.blend();
            this.goto(3);
            this.sel = 0;
          }
          break;
        case 1:
          if (sel === 0 || sel === 1) {
            this.sound("dude");
            this.ship = sel;
            this.off = 400;
            this.p = 0;
            this.goto(2);
            this.blend();
          } else {
            this.sound("dude");
            this.blend();
            this.goto(10);
            this.sel = this.np1;
          }
          break;
        case 20: {
          const l = this.list.sel;
          if (l >= 3 && l <= 23) this.result = { kind: "load", slot: l - 2 };
          else if (l === 25) {
            this.sound("dude");
            this.blend();
            this.goto(3);
          }
          break;
        }
        case 30:
          if (sel === n) {
            this.sound("dude");
            this.blend();
            this.goto(3);
            this.sel = 2;
          } else if (sel === 0 || sel === 1 || sel === 2) {
            this.sound("dude");
            this.blend();
            this.off = [460, 320, 700][sel]!;
            this.list.sel = 3;
            this.keySet = 0;
            // Seite 33 sichert die Belegung (`CopyBytes`) und arbeitet auf einer Kopie
            if (sel === 2) this.working = [...this.config.keys];
            this.goto(([31, 32, 33] as const)[sel]!);
          } else if (sel === 3) {
            this.sound("dude");
            this.blend();
            this.goto(40);
            this.sel = 0;
          }
          break;
        case 31:
          this.options31();
          break;
        case 32:
          this.options32();
          break;
        case 33: {
          const l = this.list.sel;
          if (l === 3) {
            this.sound("plingding");
            this.keySet = (this.keySet + 1) % 3;
          } else if (l === 4) {
            // Gerät weiterschalten: ohne DirectInput-Joystick bleibt es bei der Tastatur
            this.sound("plingding");
          } else if (l >= 6 && l <= 15) {
            // OK startet die Aufnahme, gewartet wird, bis OK losgelassen ist
            this.sound("dude");
            this.captureIndex = this.keySet * 10 + (l - 6);
            this.capture = { state: "wait" };
          } else if (l === 20) {
            // „Einstellungen übernehmen“: der Arbeitsstand wird der gesicherte
            this.sound("dude");
            this.config = { ...this.config, keys: [...this.keyMap] };
          } else if (l === 21) {
            this.sound("dude");
            this.leaveKeys();
          }
          break;
        }
        case 40:
          if (sel === n) {
            this.sound("dude");
            this.blend();
            this.goto(30);
            this.sel = 3;
          } else {
            this.sound("dude");
            this.blend();
            this.goto(10);
            this.sel = 0;
            this.bonus = BONUS_LEVELS[sel];
          }
          break;
        case 50:
          if (this.list.sel === 11) {
            this.sound("dude");
            this.blend();
            this.goto(3);
          }
          break;
      }
    }
    // Zurück: im Hauptmenü und auf der Schiffsseite nur Esc; nach einem OK im selben Bild nichts mehr
    const esc = page === 3 || page === 1 ? k.pause : k.back;
    if (!this.backEdge(esc) || this.page !== page || this.result) return;
    switch (page) {
      case 3:
        this.result = { kind: "exit" };
        break;
      case 10:
        this.blend();
        this.sel = 0;
        this.goto(3);
        break;
      case 1:
        this.blend();
        this.goto(10);
        this.sel = this.np1;
        break;
      case 20:
      case 50:
        this.blend();
        this.goto(3);
        break;
      case 30:
        this.blend();
        this.goto(3);
        this.sel = 2;
        break;
      case 31:
      case 32:
        this.blend();
        this.goto(30);
        break;
      case 33:
        this.leaveKeys();
        break;
      case 40:
        this.blend();
        this.sel = 3;
        this.goto(30);
        break;
    }
  }

  /** Belegung, die Menü und Spiel gerade benutzen (`0x588174`, zweite Tasten). */
  get keyMap(): readonly string[] {
    return this.working ?? this.config.keys;
  }

  /** Seite 33 verlassen: nicht übernommene Änderungen verfallen (`CopyBytes` aus der Sicherung). */
  private leaveKeys(): void {
    this.working = undefined;
    this.capture = undefined;
    this.blend();
    this.goto(30);
  }

  /**
   * Tastenaufnahme (Seite 33, `[ebp-0x13c]`). Das Original wartet in Schleifen innerhalb eines
   * Durchlaufs; hier geschieht dasselbe Durchlauf für Durchlauf. Tasten, die dabei gehalten
   * werden, lösen weder OK noch Zurück aus. Wahr, solange eine Aufnahme läuft.
   */
  private stepCapture(k: MenuKeys): boolean {
    const c = this.capture;
    if (!c) return false;
    // im Original absorbieren die Schleifen die Tasten: OK und Zurück erst nach dem Loslassen wieder frei
    this.okFree = false;
    this.backFree = false;
    const held = k.held.filter((d) => d !== 1);
    switch (c.state) {
      case "wait":
        if (!k.ok) this.capture = { state: "scan" };
        break;
      case "scan":
        if (k.pause) this.capture = { state: "esc" };
        else if (held.length > 0) {
          // die höchste gehaltene DIK-Nummer gewinnt (Schleife 1…211 ohne Abbruch)
          const dik = held[held.length - 1]!;
          this.setKey(this.captureIndex, dik);
          this.capture = { state: "hold", dik, index: this.captureIndex };
          this.stepCapture(k);
        }
        break;
      case "hold": {
        // solange die erste Taste gehalten wird, ersetzt jede weitere die Belegung
        const others = held.filter((d) => d !== c.dik);
        if (others.length > 0) this.setKey(c.index, others[others.length - 1]!);
        if (!k.held.includes(c.dik)) this.capture = undefined;
        break;
      }
      case "esc":
        if (!k.pause) this.capture = undefined;
        break;
    }
    return true;
  }

  private setKey(index: number, dik: number): void {
    const code = this.o.codeOfDik?.(dik) ?? "";
    const keys = [...this.keyMap];
    keys[index] = code;
    this.working = keys;
  }

  private options31(): void {
    const l = this.list.sel;
    const c = this.config;
    if (l === 3) this.config = { ...c, qNormal: !c.qNormal };
    else if (l === 4) this.config = { ...c, autoArrange: !c.autoArrange };
    else if (l === 5) this.config = { ...c, realistic: !c.realistic };
    if (l >= 3 && l <= 5) this.sound("plingding");
    else if (l === 7) {
      this.sound("dude");
      this.blend();
      this.goto(30);
    }
  }

  private options32(): void {
    const l = this.list.sel;
    const c = this.config;
    if (l === 3) {
      let m = c.music + 5;
      if (m > 100) m = 0;
      this.config = { ...c, music: m };
    } else if (l === 4) {
      this.config = { ...c, sfx: volumeStep(c.sfx) };
      this.sound("plingding");
    } else if (l === 5) {
      this.config = { ...c, speech: volumeStep(c.speech) };
      this.sound("plingding");
      this.sounds.push({ name: "speech", gain: "speech" });
    } else if (l === 7) {
      this.sound("dude");
      this.blend();
      this.goto(30);
    }
  }

  /** Namenseingabe (Seite 2): Zeichen ab 32, höchstens 16, Backspace, Enter. */
  private nameInput(k: MenuKeys): void {
    const c = k.char;
    if (c <= 0) return;
    const p = this.p;
    if (c === 13) {
      const rnd = this.o.rnd;
      const taken = (id: number) => this.o.highscores.some((e) => e.id === id);
      do {
        this.ids[p] = cint(vbInt(f32(rnd.next()) * 10000) + this.o.passes * 10000);
      } while (taken(this.ids[p]!) || this.ids[0] === this.ids[1]);
      if (this.names[p]!.trim() === "") this.names[p] = DEFAULT_NAME;
      if (this.np1 === p) {
        const players = (this.np1 + 1) as 1 | 2;
        this.result = {
          kind: "new",
          players,
          ship: this.ship,
          names: this.names.slice(0, players),
          ids: this.ids.slice(0, players),
          bonus: this.bonus,
        };
      } else this.p++;
      this.blend();
    } else if (c === 8) this.names[p] = this.names[p]!.slice(0, -1);
    else if (c >= 32 && this.names[p]!.length < NAME_MAX) this.names[p] += String.fromCharCode(c);
  }
}
