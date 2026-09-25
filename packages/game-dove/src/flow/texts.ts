/**
 * Texte der Bildschirme aus der Stringtabelle von `DOVE.exe` (VA je Block).
 * Deutsch = `Me.350` gesetzt; Schreibweise und Tippfehler wie im Original.
 */

const Q = '"';

/** Optionen `Schwierigkeitsgrad` (`0x40EC6C`…`0x40EFFC`). */
export const OPTIONS_TEXT = {
  de: {
    shots: "Gegner schießen: ",
    shotValues: ["AUS", "VOLL", "HALB"],
    walls: "Kollision mit Wand: ",
    wallValues: ["Nein", "Ja, klar"],
    weapons: "Waffenverlust nach dem Tod: ",
    weaponValues: ["Nein", "Ja"],
    save: "Einstellungen speichern",
    back: "Zurück",
    saved: "Einstellungen gespeichert!",
    factor: "Punktefaktor: ",
    unlockHint: "Levels können erspielt werden",
  },
  en: {
    shots: "shooting enemies: ",
    shotValues: ["OFF", "ON", "HALF"],
    walls: "Touching walls destroys the ship : ",
    wallValues: ["NO", "YES YA"],
    weapons: "Losing weapons after ship got destroyed: ",
    weaponValues: ["NO", "YES"],
    save: "Save options",
    back: "Back to the main menu",
    saved: "Options saved!",
    factor: "Point factor: ",
    unlockHint: "finished levels will be saved",
  },
} as const;

/** Continue-Bildschirm (`0x40E858`…`0x40E920`). */
export function continueRankText(german: boolean, rank: number): string {
  return german
    ? `Bei der Wahl von 'NO' können sie sich auf Platz ${rank} eintragen.`
    : `Select 'NO' to put your name on the rank list ${rank}.`;
}

/** Highscore-Eingabe (`0x410204`, `0x40FE48`). */
export const HIGHSCORE_TEXT = {
  youPlaced: "You placed",
  enterName: "Enter your name here:",
  cursor: "§",
  title: "HighScore:",
} as const;

/**
 * Abspann-Story, zwei Zeilen je Dia (`ShowOutro` `0x4A0FED`/`0x4A15C7`).
 * `name` ist der Name auf Platz 1 der Highscoreliste („…ruft: N, N!“).
 */
export function outroLines(german: boolean, name: string): string[] {
  const cheer = `${Q}${name}, ${name}!${Q}`;
  return german
    ? [
        "Eine gewaltige Explosion ließ dich deinen Sieg spüren. Gerade noch konntest",
        "du dich vor der Druckwelle retten. nun bist du auf dem Weg nach hause.",
        "Kurz vor der Erde wirst du von einem Asteroidenfeld überrascht. Mit den Worten",
        `${Q}Diese verdammten Meteoriten${Q} schießt du dir den Weg frei.`,
        `${Q}Puh, geschafft!${Q} So lange warst du von der Heimat getrennt! Du erblickst`,
        "den inzwischen wieder reparierten, blauen Planeten und setzt zur Landung an.",
        "Unten erwartet dich schon eine jubelnde Menge, die laut deinen Namen ruft:",
        cheer,
        "Wird die dunkel-operierende-vogel-einheit wirklich jemals wieder zum Einsatz",
        `kommen? Du verlässt das kampfschiff und murmelst leise: ${Q}Die Erde ist sicher${Q}`,
      ]
    : [
        "The big explosion told you: you are the winner.",
        "A great shockwave almost blew you away. Now you are on the way home.",
        "Suddenly you see a cloud of asteroids approaching. You get your weapon ready.",
        `You're shooting your way through with some big shots. ${Q}You goddamn asteroids!${Q}`,
        `${Q}Yeah, I did my job! I was so long away... it's so great to be back again${Q}`,
        "Landing your ship, you're looking at the earth, which is nearly fixed again.",
        "Down on the ground you see lots of people cheering and calling your name:",
        cheer,
        "But getting off you are thinking: Will the dark-operating-virtual-Enormous ship",
        "ever have go out to fight again? You never know what's coming next ...",
      ];
}

/**
 * Credits nach dem Abspann (`0x41158C`… bzw. `0x412098`…): Index 0 „Credits:“,
 * gezeichnet werden nur die Zeilen 1…27 (`For i = 1 To 27`, `0x4A5209`).
 */
export function creditLines(german: boolean): string[] {
  const pad = " ".repeat(17);
  return german
    ? [
        "Credits:",
        "Idee:            Markus 'Kauto' Madeja",
        "Programm:        Markus Madeja",
        "Leveldesign:     Markus Madeja",
        `${pad}Malte Kollmann (Level 7 und 9)`,
        "Grafik:          Malte Kollmann (alle Rendergrafiken, icl. Abspann)",
        `${pad}Hilmar Brinkmann (Vorspann und andere)`,
        `${pad}Manuel Kempf (Teufel wärend Loading und Endgegner in Level 3)`,
        `${pad}'Hürgy Hasbh' (Endgegner Level 4, Ufo und Texturen in Level 1)`,
        `${pad}'Harald Cl' (verbesserung des Sägegegners im 1. Level)`,
        `${pad}'xenion' (rote Ying Yang - Fische im 3. Level)`,
        `${pad}Markus Madeja (der Rest, grafische Effekte)`,
        "Soundeffekte:    Markus Madeja",
        "Musik:           Boris 'Toxeen' Nonte",
        `${pad}Markus Madeja (Endg. 1, Highscore, Abspann 2, Titel, Level 5)`,
        `${pad}'XPiRE'/'thunderpig' (Big in Japan, Level 6)`,
        `${pad}'Jori' (Level 7)`,
        `${pad}'Quasian' (Level 4)`,
        "Übersetzung:     Kay 'MontyP' Kollmann, Mocs, Kauto",
        "Besonderen Dank: 'Pickel'",
        `${pad}Torsten Ackermann`,
        `${pad}Den 'BASS'-Leuten`,
        "Tester:          'Pickel', Andi Wagner",
        `${pad}Jan 'DJ-N' Roters, 'mocs'`,
        `${pad}'dalle', 'rayman', 'RoopDaDoop'`,
        `${pad}Martin Madeja, Thomas Scholz`,
        `${pad}'Snix' und 'Mr. Ass'`,
        `${pad}und alle anderen Mitarbeiter`,
      ]
    : [
        "Credits:",
        "Idea:            Markus 'Kauto' Madeja",
        "Code:            Markus Madeja",
        "Leveldesign:     Markus Madeja",
        `${pad}Malte Kollmann (Level 7 und 9)`,
        "Grafik:          Malte Kollmann (all 3d-grafiks, Ending)",
        `${pad}Hilmar Brinkmann (Intro and others)`,
        `${pad}Manuel Kempf (Loading-Screen and Endboss of Level 3)`,
        `${pad}'Hürgy Hasbh' (Endboss Level 4, Ufo and Textures in Level 1)`,
        `${pad}'Harald Cl' (improvments in Level 1)`,
        `${pad}'xenion' (red Ying Yang - Fish in Level 3)`,
        `${pad}Markus Madeja (the remainder, graphic effects)`,
        "Soundfx:         Markus Madeja",
        "Music:           Boris 'Toxeen' Nonte",
        `${pad}Markus Madeja (Endb. 1, Highscore, Ending 2, Titel, L. 5)`,
        `${pad}'XPiRE'/'thunderpig' (Big in Japan, Level 6)`,
        `${pad}'Jori' (Level 7)`,
        `${pad}'Quasian' (Level 4)`,
        "Translation:     Kay 'MontyP' Kollmann, Mocs, Kauto",
        "Special Thanks:  'Pickel'",
        `${pad}Torsten Ackermann`,
        `${pad}'BASS'`,
        "Tester:          'Pickel', Andi Wagner",
        `${pad}Jan 'DJ-N' Roters, 'mocs'`,
        `${pad}'dalle', 'rayman', 'RoopDaDoop'`,
        `${pad}Martin Madeja, Thomas Scholz`,
        `${pad}'Snix' und 'Mr. Ass'`,
        `${pad}and all other coworkers`,
      ];
}

/** Kopf des Menüpunkts „Info“ (`info` `0x490916`…`0x4909DC`). */
export const INFO_LINES: readonly string[] = [
  "Homepage: http://come.to/kauto",
  "          http://www.kauto.de",
  "E-Mail:   Kauto@gmx.de",
  "---------------",
  "Code:   Markus 'Kauto' Madeja",
  "Grafik: Malte 'MaKo' Kollmann, Hilmar 'HiBri' Brinkmann, Manuel Kempf,",
  "        Hürgy Hasbh, Harald Cl, xenion, Markus 'Kauto' Madeja",
  "Sound:  Markus 'Kauto' Madeja",
  "Music:  Boris 'Toxeen' Nonte, XPiRE, Jori, Quasian, ",
  "        Markus 'Kauto' Madeja",
  "Trans.: Kay 'MontyP' Kollmann, Markus 'Kauto' Madeja, Marcus Menze",
  "---------------",
];

/** Abschiedsbild (`0x4AD5B0`): Textzeilen mit Position (x, y). */
export function farewellLines(german: boolean): [string, number, number][] {
  return german
    ? [
        ["Hat's euch gefallen? Klar hat's euch gefallen!", 10, 100],
        ["Und ihr werdet es nicht glauben, eine HP gibt's auch schon:", 10, 120],
        ["Hier könnte ihre Werbung stehen", 200, 400],
        [
          "Tipp: wenn der Punktefaktor ) 1 ist (Spiel schwerer machen), kann man speichern!",
          0,
          450,
        ],
      ]
    : [
        ["Did you like the this game? Sure you did!", 10, 100],
        ["And even if you wont beleave it: there's a homepage awaiting you! Visit:", 10, 120],
        ["Here could be your commercial", 200, 400],
        ["Hint: If you play this game harder (Point factor ) 1), you can save your game!", 6, 450],
      ];
}
