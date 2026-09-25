import { type Container, Sprite, Texture } from "pixi.js";
import { Effect } from "../sim/step";

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
  private seed = 12345;

  constructor(private readonly layer: Container) {}

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 8) / 0x1000000;
  }

  consume(effects: readonly number[]): void {
    for (let e = 0; e + 4 < effects.length; e += 5) {
      const [kind, ex, ey, ew, eh] = effects.slice(e, e + 5) as [
        number,
        number,
        number,
        number,
        number,
      ];
      const n = COUNT[kind] ?? 0;
      const spread = kind === Effect.PlayerDeath ? 20 : 0;
      for (let k = 0; k < n; k++) {
        const i = this.life.indexOf(0);
        if (i < 0) return;
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

  update(): void {
    for (let i = 0; i < MAX; i++) {
      let s = this.sprites[i];
      if (this.life[i]! <= 0) {
        if (s) s.visible = false;
        continue;
      }
      if (!s) {
        s = new Sprite(Texture.WHITE);
        s.setSize(1, 1);
        this.sprites[i] = s;
        this.layer.addChild(s);
      }
      this.x[i]! += this.vx[i]!;
      this.y[i]! += this.vy[i]!;
      this.life[i]!--;
      s.visible = true;
      s.position.set(Math.round(this.x[i]!), Math.round(this.y[i]!));
      s.tint = COLORS[Math.min(COLORS.length - 1, Math.floor((40 - this.life[i]!) / 8))]!;
    }
  }

  destroy(): void {
    this.sprites.length = 0;
  }
}
