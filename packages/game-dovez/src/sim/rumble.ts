import { cint } from "./vb";

/**
 * Vibration (`AddForce` `0x529870`, Methode `0x91C`; Auswertung je Tick `0x5299B0`,
 * Methode `0x920`; Kraftstoß `0x57A190`): Quellen mit Reststärke und Restdauer in 21
 * Plätzen (`Me.A0C`, `Me.A28`, `Me.A44`). Je Tick zählt jede Quelle einen Tick ab
 * und addiert ihre Stärke zum Joystick ihres Spielers (`Me.65C`, Summe höchstens 5).
 * Aus der Summe ergibt sich die Stärke des Kraftstoßes: von der eingestellten
 * Grundstärke `s` (500…10000, Vorgabe 2500) bei Summe 1 linear bis 10000 bei Summe 5.
 * Nur die Ausgabe (`magnitude`) ist Sache des Hosts; die Simulation hängt nicht davon ab.
 */
export const RUMBLE_SLOTS = 21;
export const RUMBLE_DEFAULT = 2500;

export class Rumble {
  /** Reststärke (`Me.A0C`), Restdauer in Ticks (`Me.A28`), Spieler (`Me.A44`). */
  private readonly strength = Array.from({ length: RUMBLE_SLOTS }, () => 0);
  private readonly ticks = Array.from({ length: RUMBLE_SLOTS }, () => 0);
  private readonly player = Array.from({ length: RUMBLE_SLOTS }, () => 0);
  /** Zuletzt ausgegebene Stärke je Joystick (`0x588464`), 0 = aus. */
  private readonly current = [0, 0];
  /** Stärke des Kraftstoßes je Joystick 0/1 nach dem letzten Tick (0 = keine Vibration). */
  readonly magnitude: [number, number] = [0, 0];

  /**
   * `AddForce(Stärke, Dauer, Spieler)`: erster freier Platz (Dauer ≤ 0). Ein Spieler
   * außerhalb 0…1 (im Original −1) wirkt auf beide.
   */
  add(strength: number, ticks: number, player: number): void {
    if (player < 0 || player > 1) {
      this.add(strength, ticks, 0);
      this.add(strength, ticks, 1);
      return;
    }
    for (let j = 0; j < RUMBLE_SLOTS; j++) {
      if ((this.ticks[j] ?? 0) > 0) continue;
      this.ticks[j] = ticks;
      this.strength[j] = strength;
      this.player[j] = player;
      return;
    }
  }

  /**
   * Ein Tick der Auswertung. `pad(Spieler)` liefert den Joystick 1…2 des Spielers
   * (`Me.588270[Spieler + Spieleranzahl − 1]`), 0 ohne Joystick; `base(Joystick)` die
   * eingestellte Grundstärke; `enabled(Joystick)` ob die Vibration an ist.
   */
  step(
    pad: (player: number) => number,
    base: (joystick: number) => number,
    enabled: (joystick: number) => boolean,
  ): void {
    const sum = [0, 0];
    for (let j = 0; j < RUMBLE_SLOTS; j++) {
      const left = this.ticks[j] ?? 0;
      if (left <= 0) continue;
      this.ticks[j] = left - 1;
      const dev = pad(this.player[j] ?? 0);
      if (dev > 0) sum[dev - 1] = (sum[dev - 1] ?? 0) + (this.strength[j] ?? 0);
    }
    for (let d = 0; d < 2; d++) {
      let n = sum[d] ?? 0;
      let mag = 0;
      if (n > 0) {
        if (n > 5) n = 5;
        const s = base(d);
        mag = cint(((n - 1) * (10000 - s)) / 4 + s);
      }
      if (n === 0) {
        // Kraftstoß beenden (`DoForce`)
        this.current[d] = 0;
      } else if ((this.current[d] ?? 0) !== mag && enabled(d)) {
        this.current[d] = mag;
      }
      this.magnitude[d] = enabled(d) ? (this.current[d] ?? 0) : 0;
    }
  }

  /** Alle Quellen löschen (neues Level, Spielende). */
  clear(): void {
    this.ticks.fill(0);
    this.strength.fill(0);
    this.current[0] = this.current[1] = 0;
    this.magnitude[0] = this.magnitude[1] = 0;
  }
}
