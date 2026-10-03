import { type Container, Sprite, Texture } from "pixi.js";
import { Effect } from "../sim/actions";

const MAX = 2000;
/** Partikel je Effektart; die Mengen stammen aus der EXE (150 / 5 / 2×400 / 100). */
const COUNT: Record<number, number> = {
  [Effect.EnemyKill]: 150,
  [Effect.ShotHit]: 5,
  [Effect.PlayerDeath]: 800,
  [Effect.Crash]: 100,
};
const COLORS = [0xffffff, 0xffee88, 0xffaa33, 0xff6611, 0xaa3300];

/**
 * Funkenpartikel — reine Darstellung, außerhalb der Simulation und ohne Einfluss
 * auf den Zustand. Bewegung, Lebensdauer und Farben sind geschätzt (M4: gegen
 * Referenzaufnahmen abgleichen).
 */
export class Particles {
  private readonly sprites: Sprite[] = [];
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly life = new Int16Array(MAX);
  /** Im letzten Tick lebendig: auch ein gerade erloschener Funke ist noch ein Bild lang sichtbar. */
  private readonly shown = new Uint8Array(MAX);
  /** Zuletzt gesetzte Farbe je Sprite: Pixis `tint` rechnet bei jeder Zuweisung um. */
  private readonly tints = new Int32Array(MAX);
  private seed = 12345;

  constructor(private readonly layer: Container) {}

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 8) / 0x1000000;
  }

  consume(effects: readonly number[]): void {
    // erster freier Platz wie `life.indexOf(0)`: davor wird beim Verteilen nichts frei
    let free = 0;
    for (let e = 0; e + 4 < effects.length; e += 5) {
      const kind = effects[e]!;
      const ex = effects[e + 1]!;
      const ey = effects[e + 2]!;
      const ew = effects[e + 3]!;
      const eh = effects[e + 4]!;
      const n = COUNT[kind] ?? 0;
      const spread = kind === Effect.PlayerDeath ? 20 : 0;
      for (let k = 0; k < n; k++) {
        const i = this.life.indexOf(0, free);
        if (i < 0) return;
        free = i + 1;
        this.x[i] = ex - spread + this.rand() * (ew + 2 * spread);
        this.y[i] = ey - spread + this.rand() * (eh + 2 * spread);
        const a = this.rand() * Math.PI * 2;
        const s = this.rand() * (kind === Effect.ShotHit ? 1.5 : 3);
        this.vx[i] = Math.cos(a) * s;
        this.vy[i] = Math.sin(a) * s;
        this.life[i] = 10 + Math.floor(this.rand() * 30);
      }
    }
  }

  /** Ein Tick: bewegen und altern, im Takt der Simulation wie die Hauptschleife des Originals. */
  step(): void {
    for (let i = 0; i < MAX; i++) {
      const alive = this.life[i]! > 0;
      this.shown[i] = alive ? 1 : 0;
      if (!alive) continue;
      this.x[i]! += this.vx[i]!;
      this.y[i]! += this.vy[i]!;
      this.life[i]!--;
    }
  }

  /** Die Sprites auf den Stand des letzten Ticks bringen. */
  draw(): void {
    for (let i = 0; i < MAX; i++) {
      let s = this.sprites[i];
      if (!this.shown[i]) {
        if (s) s.visible = false;
        continue;
      }
      if (!s) {
        s = new Sprite(Texture.WHITE);
        s.setSize(1, 1);
        this.sprites[i] = s;
        this.tints[i] = 0xffffff;
        this.layer.addChild(s);
      }
      s.visible = true;
      s.position.set(Math.round(this.x[i]!), Math.round(this.y[i]!));
      const tint = COLORS[Math.min(COLORS.length - 1, Math.floor((40 - this.life[i]!) / 8))]!;
      if (this.tints[i] !== tint) {
        s.tint = tint;
        this.tints[i] = tint;
      }
    }
  }

  destroy(): void {
    this.sprites.length = 0;
  }
}
