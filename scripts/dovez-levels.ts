/**
 * Levelbericht DoveZ: eine Tabelle aller 27 Level aus den gebauten Assets (`assets/dovez`) —
 * Länge, Musik, Gegnertypen und Spawns, Bosse mit Teilen und Lebenspunkten, Funksprüche,
 * Waffen. Schreibt `docs/measurements/dovez-levels.md` (`bun run levels:report`);
 * `--check` prüft nur, ob die Datei aktuell ist (CI).
 */
import { join } from "node:path";
import { LEVEL_SLUGS, loadTestLevel } from "../packages/game-dovez/test/assets";

const OUT = join(import.meta.dir, "../docs/measurements/dovez-levels.md");

const rows: string[] = [];
for (const slug of LEVEL_SLUGS) {
  const { level } = await loadTestLevel(slug);
  // Zeitleiste der Ebene 4 (Gegner, Töne, Funk); Art 0 = Gegner, 2 = Funkspruch
  const entries = level.layers[4]?.entries ?? [];
  const spawns = entries.filter((e) => e.kind === 0).length;
  const radio = entries.filter((e) => e.kind === 2).length;
  const bosses = level.enemies
    .filter((e) => e.boss > 0)
    .map((e) => `${e.name} (${e.hitPoints} HP, ${e.parts.length} Teile)`);
  const boss = bosses.length > 0 ? bosses.join(", ") : "–";
  const length = level.levelLength >= 99999 ? "Boss" : String(level.levelLength);
  rows.push(
    `| \`${slug}\` | ${level.title} | ${length} | ${level.music || "–"} | ${level.enemies.length} | ${spawns} | ${boss} | ${radio} | ${level.weapons.length} | ${level.routes.length} |`,
  );
}

const text = `# DoveZ — Levelbericht

Erzeugt von \`scripts/dovez-levels.ts\` (\`bun run levels:report\`) aus den gebauten Assets;
nicht von Hand ändern. Die Tests \`packages/game-dovez/test/levels.test.ts\` spielen jedes
dieser Level mit einem Bot bis zum Ende (Boss besiegt bzw. Levelende erreicht).

| Level | Titel | Länge (Ticks) | Musik | Gegnertypen | Spawns | Boss | Funk | Waffen | Routen |
|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

Länge „Boss“: das Level endet mit dem Tod des Bosses (\`levelLength\` 99999).
`;

if (process.argv.includes("--check")) {
  const current = await Bun.file(OUT)
    .text()
    .catch(() => "");
  if (current !== text) {
    console.error("docs/measurements/dovez-levels.md ist veraltet: `bun run levels:report`");
    process.exit(1);
  }
  console.log("Levelbericht aktuell.");
} else {
  await Bun.write(OUT, text);
  console.log(`geschrieben: ${OUT}`);
}
