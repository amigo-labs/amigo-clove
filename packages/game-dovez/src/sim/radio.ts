import type { DovezRadio, RadioLine, RadioTexts } from "@clove/formats";
import type { DrawList } from "./effects";
import { cint, vbInt, type VbRnd } from "./vb";

/**
 * Funk (`AddFunktion` `0x4AC700`, `SpielFunkmeldung` `0x5101E0`) und das
 * Laufband (`AddMsg`/`ShowMSGS` `0x50FB90`/`0x50FCC0`). Ein Funkspruch ist
 * eine Folge von Gruppen (Sprecher, WAV, Dauer, Untertitel); jede Gruppe
 * beginnt mit einem Tick ohne Bild, dann läuft sie `ms \ 16` Ticks. Kein
 * Warten, keine Priorität: ein neuer Spruch ersetzt den laufenden. Der
 * Untertitel geht ins Laufband, nicht in das Funkfenster. Das Fenster zieht
 * `Rnd` beim Zeichnen; wie die Effekte läuft es darum in der Simulation.
 */

/** Funkfenster (Rauschen) links unten im HUD. */
export const RADIO_BOX = [5, 542, 84, 592] as const;
/** Porträt 50×50. */
export const PORTRAIT = [20, 542] as const;

/** Was die Engine abspielen soll. */
export type RadioEvent =
  | { readonly kind: "voice"; readonly wav: string }
  | { readonly kind: "voiceStop" };

export class Radio {
  active = false;
  private index = 0;
  private group = 0;
  /** Ticks der Gruppe übrig (`Me.1120`) und ihre Dauer (`Me.1124`). */
  private left = 0;
  private duration = 0;
  /** Porträtbild 0…31 und sein Zeitgeber. */
  frame = 0;
  private frameTimer = 0;
  speaker = "0";
  private voice = false;
  /** Wiedergaben je Funkspruch (`Me.1130`), über Tode hinweg, je Level neu. */
  private readonly plays = new Map<number, number>();
  /** Abschnitt je Funk-Index (Name gleich der ID, ohne Groß/klein). */
  private readonly sections: (readonly RadioLine[] | undefined)[];
  /** Laufband: Einträge, Position in Zehntelzeichen, „leer gelaufen“. */
  private messages: string[] = [];
  private scroll = 0;
  private dry = false;
  /** Sichtbarer Laufbandtext dieses Ticks (bei (575, 552)). */
  ticker = "";

  constructor(
    private readonly radios: readonly DovezRadio[],
    texts: RadioTexts | undefined,
  ) {
    const byName = new Map(Object.entries(texts ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    this.sections = radios.map((r) => byName.get(r.id.trim().toLowerCase()));
  }

  /** `AddFunktion(idx)`. */
  trigger(idx: number): void {
    const r = this.radios[idx];
    if (!r) return;
    if (r.maxPlays !== 0 && (this.plays.get(idx) ?? 0) >= r.maxPlays) return;
    if (!this.sections[idx]) return;
    this.active = true;
    this.left = 0;
    this.group = 0;
    this.index = idx;
  }

  /** `VariabelnLösch` (Levelstart, jeder Neustart): Funk aus, Laufband leer. */
  reset(events: { push(e: RadioEvent): unknown }): void {
    this.active = false;
    this.stopVoice(events);
    this.messages = [];
    this.scroll = 0;
    this.dry = false;
    this.ticker = "";
  }

  private stopVoice(events: { push(e: RadioEvent): unknown }): void {
    if (!this.voice) return;
    this.voice = false;
    events.push({ kind: "voiceStop" });
  }

  /** Alle Laufband-Einträge (`Me.A50`), älteste zuerst — das Funkprotokoll der Pause. */
  get log(): readonly string[] {
    return this.messages;
  }

  /** `AddMsg`. */
  addMessage(m: string): void {
    if (this.dry) {
      this.dry = false;
      this.addMessage(" ".repeat(10));
    }
    this.messages.push(m);
  }

  /** `SpielFunkmeldung`, jeden Tick nach der Welt; zeichnet ins Funkfenster (`out`). */
  step(rnd: VbRnd, events: { push(e: RadioEvent): unknown }, out: DrawList): void {
    if (!this.active) return;
    const lines = this.sections[this.index] ?? [];
    if (this.left === 0) {
      this.stopVoice(events);
      if (this.group === 0) {
        this.frame = cint(rnd.next() * 31);
        this.frameTimer = 0;
        // Variante: die mitgelieferten Texte haben je Abschnitt genau eine
        vbInt(rnd.next() * 1);
      }
      const line = lines[this.group++];
      this.speaker = line ? (line.frame ? "Frame" : "0") : "";
      this.addMessage(line?.text.trim() ?? "");
      // abgeschnittene Gruppe oder vertauschte Felder: Dauer 0, der Spruch endet
      const ms = !line || line.swapped || line.ms === null ? 0 : line.ms;
      const d = Math.trunc(cint(ms) / 16);
      this.duration = this.left = d;
      if (d === 0) {
        this.active = false;
        const r = this.radios[this.index]!;
        if (r.maxPlays !== 0) {
          const n = this.plays.get(this.index) ?? 0;
          if (n < r.maxPlays) this.plays.set(this.index, n + 1);
        }
      } else if (line) {
        this.voice = true;
        events.push({ kind: "voice", wav: line.wav });
      }
      return;
    }
    this.left--;
    if (--this.frameTimer <= 0) {
      this.frameTimer = 5;
      if (++this.frame > 31) this.frame = 0;
    }
    if (this.speaker === "0") return;
    const f = Math.min(this.duration - this.left, this.left);
    if (f < 20) {
      this.noise(rnd, out, f / 20);
      return;
    }
    if (this.speaker !== "1") {
      const key = `frame${this.frame + 1}`;
      const [x, y] = PORTRAIT;
      if (rnd.next() < 0.1) {
        // Bildstörung: senkrecht gestauchter Ausschnitt, ohne Farbschlüssel
        const top = cint(rnd.next() * 20);
        out.quad(key, x, y, x + 50, y + 50, 1, 1, 1, 1, false, 0, undefined, [
          0,
          top,
          50,
          50 - 2 * top,
        ]);
      } else out.quad(key, x, y, x + 50, y + 50);
    }
    this.noise(rnd, out, (70 - Math.min(f, 55)) / 50);
  }

  /** Rauschen: zufälliger, zufällig gespiegelter Ausschnitt aus `Noise.bmp`. */
  private noise(rnd: VbRnd, out: DrawList, alpha: number): void {
    const l = cint(rnd.next() * 255);
    const t = cint(rnd.next() * 255);
    const sx = 2 * vbInt(2 * rnd.next()) - 1;
    const sy = 2 * vbInt(2 * rnd.next()) - 1;
    const [x1, y1, x2, y2] = RADIO_BOX;
    // gespiegelt über vertauschte Ecken; der Ausschnitt beginnt bei (l, t)
    out.quad(
      "noise",
      sx > 0 ? x1 : x2,
      sy > 0 ? y1 : y2,
      sx > 0 ? x2 : x1,
      sy > 0 ? y2 : y1,
      1,
      1,
      1,
      alpha,
      false,
      0,
      undefined,
      [Math.min(l, 128), Math.min(t, 128), 128, 128],
    );
  }

  /** `ShowMSGS`: das Band schiebt sich je Tick weiter, schneller bei langem Rückstand. */
  stepTicker(): void {
    let s = "";
    for (const m of this.messages) s += `     -${m}     `;
    if (this.messages.length > 0) s = s.slice(0, -5);
    const pos = Math.trunc(this.scroll / 10);
    if (pos < s.length) {
      this.scroll += Math.trunc((s.length - pos) / 50) + 2;
      const at = Math.trunc(this.scroll / 10);
      this.ticker = (" ".repeat(99) + s).slice(at, at + 100).trimEnd();
    } else {
      this.dry = true;
      this.ticker = "";
    }
  }
}
