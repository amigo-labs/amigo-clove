/**
 * Kreuzvalidierung Asset ↔ Daten.
 *
 * Für jeden Frame jedes Gegners in jedem Level wird die Nicht-Colorkey-Spanne
 * jeder Zeile aus dem dekodierten `feindeN.spr` neu berechnet und mit der im
 * Level gespeicherten Kontur verglichen. Ein Test prüft damit gleichzeitig
 * BMP-Decoder, Bottom-up-Flip, Colorkey, Rect-Interpretation und Frame-Stride.
 *
 * Befund (M1): Die gespeicherten Konturen sind **nicht** pixelgenau. Sie
 * enthalten die aus den Pixeln berechnete Spanne ausnahmslos (19959 von 19959
 * Zeilen), sind aber in 31 % der Zeilen breiter — meist um 1 px, in Einzelfällen
 * deutlich (Bosse). Eine zu eng berechnete Spanne tritt nie auf. Das passt zu
 * einem Editor, der die Konturen aus einer anderen Dekodierung derselben JPG/GIF
 * (bzw. einer älteren Grafikfassung) erzeugt hat. Deshalb gilt hier:
 *
 * - **hart:** gespeicherte Kontur ⊇ Pixelspanne, in jeder Zeile jedes Frames;
 * - **Metrik:** Anteil exakt gleicher Zeilen, darf nicht unter den Stand fallen.
 *
 * Eine falsche Colorkey-Wahl, ein fehlender Flip oder ein falscher Stride
 * verletzt die Obermengen-Bedingung sofort in tausenden Zeilen.
 */
import { describe, expect, test } from "bun:test";
import {
  contourFromPixels,
  decodeBmp,
  enemyFrameRect,
  parseLevelDat,
  type BmpImage,
  type DoveLevel,
} from "../src/index";
import { DOVE_LEVELS, doveLevelPath, doveSpritePath, readBytes } from "./fixtures";

/** Anteil exakt übereinstimmender Konturzeilen (13737 / 19959). */
const EXACT_ROW_BASELINE = 13737 / 19959;

interface LevelData {
  level: DoveLevel;
  atlas: BmpImage;
}

const data = new Map<number, LevelData>();
for (const n of DOVE_LEVELS) {
  data.set(n, {
    level: parseLevelDat(await readBytes(doveLevelPath(n))),
    atlas: decodeBmp(await readBytes(doveSpritePath(`feinde${n}`))),
  });
}

interface Stats {
  rows: number;
  exact: number;
  violations: string[];
}

function validate(n: number): Stats {
  const { level, atlas } = data.get(n) as LevelData;
  const stats: Stats = { rows: 0, exact: 0, violations: [] };
  for (const enemy of level.enemies) {
    enemy.frames.forEach((frame, k) => {
      const rect = enemyFrameRect(enemy, k);
      const computed = contourFromPixels(atlas, rect);
      // Die (h+1)-te gespeicherte Zeile ragt ins nächste Frame und wird ignoriert.
      for (let row = 0; row < rect.height; row++) {
        stats.rows++;
        const sl = frame.spans[row * 2] as number;
        const sr = frame.spans[row * 2 + 1] as number;
        const cl = computed[row * 2] as number;
        const cr = computed[row * 2 + 1] as number;
        const storedEmpty = sl > sr;
        const computedEmpty = cl > cr;
        if (computedEmpty) {
          if (storedEmpty) stats.exact++;
          continue;
        }
        if (!storedEmpty && sl === cl && sr === cr) {
          stats.exact++;
        } else if (storedEmpty || sl > cl || sr < cr) {
          stats.violations.push(
            `Level${n} '${enemy.name}' Frame ${k} Zeile ${row}: gespeichert ${sl}..${sr}, Pixel ${cl}..${cr}`,
          );
        }
      }
    });
  }
  return stats;
}

describe("Kreuzvalidierung Gegnerkontur ↔ feindeN.spr", () => {
  const results = new Map<number, Stats>();

  test("alle Frames liegen im Atlas — bis auf eine bekannte Ausnahme", () => {
    const outside: string[] = [];
    for (const n of DOVE_LEVELS) {
      const { level, atlas } = data.get(n) as LevelData;
      for (const enemy of level.enemies) {
        enemy.frames.forEach((_, k) => {
          const r = enemyFrameRect(enemy, k);
          if (r.x + r.width > atlas.width || r.y + r.height > atlas.height) {
            outside.push(
              `Level${n} '${enemy.name}' Frame ${k}: ${r.x + r.width}×${r.y + r.height}`,
            );
          }
        });
      }
    }
    // Der Endgegner in Level 4 reicht mit `r = 696` eine Spalte über den 696 px
    // breiten Atlas hinaus. Die Pixel dort gelten als transparent.
    expect(outside).toEqual(["Level4 '14 - Endgegner' Frame 0: 697×161"]);
  });

  test.each(DOVE_LEVELS)("Level%d: gespeicherte Kontur ⊇ Pixelspanne", (n) => {
    const stats = validate(n);
    results.set(n, stats);
    expect(stats.violations).toEqual([]);
  });

  test("Anteil exakter Zeilen fällt nicht unter den Stand", () => {
    let rows = 0;
    let exact = 0;
    for (const n of DOVE_LEVELS) {
      const s = results.get(n) ?? validate(n);
      rows += s.rows;
      exact += s.exact;
    }
    console.log(`Konturzeilen exakt: ${exact}/${rows} (${((exact / rows) * 100).toFixed(1)} %)`);
    expect(rows).toBe(19959);
    expect(exact / rows).toBeGreaterThanOrEqual(EXACT_ROW_BASELINE);
  });
});
