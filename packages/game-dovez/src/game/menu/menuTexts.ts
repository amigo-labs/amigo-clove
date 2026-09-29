import type { Lang } from "../lang";

/**
 * Texte des Hauptmenüs (`MenuLoop` `0x559630`) je Sprache. Das Original baut
 * jede Seite dreimal (D `StrCmp("D")`, E, R `StrCmp("R")`); Adressen der
 * russischen Konstanten in Klammern, Verzweigungen in
 * `docs/measurements/dovez-runtime.md` („Sprachen“). Die russischen Texte
 * stehen im Original als CP1251-Bytes in UTF-16-Konstanten und sind hier
 * dekodiert. Stellen, an denen das Original nur „D“ unterscheidet, geben Russisch
 * den englischen Text (Namenseingabe, Highscore-Seite „Back“).
 *
 * **Unterschiede im Aufbau, keine bloße Übersetzung:** Das russische
 * Hauptmenü hat keinen Eintrag „Highscore“ (dafür nach einem Durchgang
 * „Бонус“) und die Optionen keinen „Bonus“; die Aktionen hängen am Index
 * (`sel = 3` ist „Highscore“, der letzte Eintrag beendet), sodass „Бонус“ im
 * Original die Highscore-Seite öffnet. Der Port übernimmt das wie es ist.
 */
export interface MenuTexts {
  /** Seite 3; `bonus`: ein Durchgang ist geschafft (`[0x588080] ≠ 0`). */
  main(bonus: boolean): { title: string; entries: string[] };
  /** Seite 10 (Spieleranzahl). */
  players: { title: string; entries: [string, string, string] };
  /** Seite 1 (Schiff). */
  ship: { title: string; entries: [string, string, string] };
  /** Seite 2, Kopfzeile der Namenseingabe für Spieler `n` (1 oder 2). */
  namePrompt(n: number): string;
  /** Seite 30 (Optionen). */
  options(bonus: boolean): { title: string; entries: string[] };
  /** Seite 40 (Bonuslevel): Titel und letzter Eintrag; die Level heißen in jeder Sprache gleich. */
  bonus: { title: string; back: string };
  /** Seite 20 (Spiel laden), Seite 50 (Highscore): Titel bzw. Zurück-Zeile. */
  load: { title: string };
  scoreBack: string;
  /** Zurück-Zeile der Listenseiten 20/31/32/33. */
  back: string;
  /** „Ein“/„Aus“ (`OnOff` `0x559530`). */
  onOff(on: boolean): string;
  /** Seite 31 (Grundeinstellungen). */
  game: {
    title: string;
    dashes: number;
    forceKey(normal: boolean): string;
    arrange(auto: boolean): string;
    inertia(realistic: boolean): string;
  };
  /** Seite 32 (Lautstärke): Titel, drei Zeilenkennungen (ohne „: “). */
  volume: { title: string; music: string; sound: string; voices: string };
  /** Seite 33 (Tastenkonfiguration). */
  keys: {
    title: string;
    dashes: number;
    /** Zeile „Steuerung für …“ bzw. nur der Satz: Einzelspieler, Spieler 1, Spieler 2. */
    who: readonly [string, string, string];
    whoPrefix: string;
    /** Zeile „Gerät: Tastatur“ (Kennung ohne „: “, Wert). */
    device: string;
    keyboard: string;
    /** Die zehn Aktionen in der Reihenfolge der Belegungstabelle (ohne „: “). */
    labels: readonly string[];
    /** Zeile 20 „Einstellungen übernehmen“ (Zeile 21 ist `Zurück`). */
    apply: string;
    /** Zeilen 17 und 18 (nur mit Gamepad): Kennungen ohne „: “ und `CBool` als Text (`True`/`False` je Systemsprache). */
    vibration: string;
    strength: string;
    bool: readonly [string, string];
    /** Dezimalzeichen von `Format(…, "0.0")`. */
    decimal: string;
  };
}

const DE: MenuTexts = {
  main: () => ({
    title: "MENÜ",
    entries: ["Neu", "Laden", "Optionen", "Highscore", "Exit"],
  }),
  players: { title: "NEU", entries: ["1 Spieler", "2 Spieler", "Zurück"] },
  ship: { title: "SHIP", entries: ["D-Tonator", "D-Phyton", "Zurück"] },
  namePrompt: (n) => `Name für Spieler ${n}:`,
  options: (bonus) => ({
    title: "OPTIONEN",
    entries: ["Grundeins.", "Lautstärke", "Tastenkon.", ...(bonus ? ["Bonus"] : []), "Zurück"],
  }),
  bonus: { title: "BONUS", back: "BACK" },
  load: { title: "Spiel laden" },
  scoreBack: "Zurück",
  back: "Zurück",
  onOff: (on) => (on ? "Ein" : "Aus"),
  game: {
    title: "Grundeinstellungen",
    dashes: 26,
    forceKey: (normal) =>
      normal ? "Force Modus Taste wird normal benutzt" : "Force Modus Taste wirkt als Beamwechsel",
    arrange: (auto) =>
      auto ? "D-Tonator: Automatische Waffenanordnung" : "D-Tonator: Manuelle Waffenanordnung",
    inertia: (realistic) => `Trägheit: ${DE.onOff(realistic)}`,
  },
  volume: { title: "Lautstärkeeinstellungen", music: "Musik", sound: "Sound", voices: "Sprache" },
  keys: {
    title: "Tastenkonfiguration",
    dashes: 27,
    who: ["Einzelspieler", "Zweispielermodus: Spieler 1", "Zweispielermodus: Spieler 2"],
    whoPrefix: "Steuerung für ",
    device: "Gerät",
    keyboard: "Tastatur",
    labels: [
      "Links",
      "Hoch",
      "Rechts",
      "Runter",
      "Schießen",
      "Beam",
      "Satelliet/Partikel wechseln",
      "Force Modus",
      "Partikel drehen",
      "Supernova",
    ],
    apply: "Einstellungen übernehmen",
    vibration: "Vibration",
    strength: "Vibrationsstärke",
    bool: ["Wahr", "Falsch"],
    decimal: ",",
  },
};

const EN: MenuTexts = {
  main: () => ({
    title: "MENU",
    entries: ["NEW", "LOAD", "OPTIONS", "SCORE", "EXIT"],
  }),
  players: { title: "NEW", entries: ["1 PLAYER", "2 PLAYER", "BACK"] },
  ship: { title: "SHIP", entries: ["D-Tonator", "D-Phyton", "BACK"] },
  namePrompt: (n) => `Please insert Name, player ${n}:`,
  options: (bonus) => ({
    title: "OPTIONS",
    entries: ["GAME", "SOUND", "KEYS", ...(bonus ? ["BONUS"] : []), "BACK"],
  }),
  bonus: { title: "BONUS", back: "BACK" },
  load: { title: "Load Game" },
  scoreBack: "Back",
  back: "Back",
  onOff: (on) => (on ? "On" : "Off"),
  game: {
    title: "Game settings",
    dashes: 19,
    forceKey: (normal) => (normal ? "Force Mode Key: Normal" : "Force Mode Key: Beam Alternation"),
    arrange: (auto) =>
      auto ? "D-Tonator Particles: Auto-Arrange" : "D-Tonator Particles: Manual-Arrange",
    inertia: (realistic) => (realistic ? "Ship Movements: Realistic" : "Ship Movements: Arcade"),
  },
  volume: { title: "Volume Control", music: "Music", sound: "Sound", voices: "Voices" },
  keys: {
    title: "Key Config",
    dashes: 16,
    who: ["Singleplayer", "Multiplayer: Player 1", "Multiplayer: Player 2"],
    whoPrefix: "",
    device: "Controller",
    keyboard: "Keyboard",
    labels: [
      "Left",
      "Up",
      "Right",
      "Down",
      "Shoot",
      "Beam",
      "Force Control/Particles",
      "Force Mode",
      "Rotation of Particles",
      "Supernova",
    ],
    apply: "Apply changes",
    vibration: "Vibration",
    strength: "Strength of the vibration",
    bool: ["True", "False"],
    decimal: ".",
  },
};

/**
 * Russisch. Die schließenden Anführungszeichen in `1 игрок"`, `Игра"`,
 * `Уровень звука"` und `Синглплеер"` stehen so in den Konstanten des Originals
 * (Tippfehler der Übersetzung) und werden wie dort angezeigt.
 */
const RU: MenuTexts = {
  // 0x414348 Меню, 0x414358 Новая, 0x414368 Загрузить, 0x414380 Настройки, 0x414398 Бонус, 0x412678 Выход
  main: (bonus) => ({
    title: "Меню",
    entries: ["Новая", "Загрузить", "Настройки", ...(bonus ? ["Бонус"] : []), "Выход"],
  }),
  // 0x414358, 0x41450c, 0x414524, 0x4144fc
  players: { title: "Новая", entries: ['1 игрок"', "2 игрока", "Назад"] },
  // 0x415594, 0x4155a8, 0x4155c0, 0x4144fc
  ship: { title: "КОРАБЛЬ", entries: ["D-Tonator", "D-Phyton", "Назад"] },
  // 0x568bb4 kennt nur „D“; Russisch fällt auf den englischen Text
  namePrompt: (n) => `Please insert Name, player ${n}:`,
  // 0x414380, 0x4145b8, 0x4145c8, 0x4145d8, 0x4144fc — ohne Bonus (der steht im Hauptmenü)
  options: () => ({
    title: "Настройки",
    entries: ['Игра"', "Звуки", "Клавиши", "Назад"],
  }),
  // 0x414398, 0x4144fc
  bonus: { title: "Бонус", back: "Назад" },
  // 0x414368
  load: { title: "Загрузить" },
  // 0x566abb kennt nur „D“
  scoreBack: "Back",
  back: "Назад",
  // 0x41422c, 0x41423c
  onOff: (on) => (on ? "Вкл." : "Выкл."),
  game: {
    // 0x414a44
    title: "Настройка игры",
    dashes: 19,
    // 0x414a68, 0x414a9c
    forceKey: (normal) => (normal ? "Режим Супер Луч: Норма" : "Режим Супер Луч: Смена режима"),
    // 0x414adc, 0x414b08
    arrange: (auto) => (auto ? "Апгрейд: Начальный" : "Апгрейд: Продвинутый"),
    // 0x414b38 + OnOff
    inertia: (realistic) => `Инерция корабля: ${RU.onOff(realistic)}`,
  },
  // 0x414c58, 0x414c7c, 0x414c94 („SFX“ bleibt englisch), 0x414ca4
  volume: { title: 'Уровень звука"', music: "Музыка", sound: "SFX", voices: "Голоса" },
  keys: {
    // 0x415244
    title: "Конфигурация",
    dashes: 20,
    // 0x415264, 0x415280, 0x4152b0
    who: ['Синглплеер"', "Мультиплеер: Игрок 1", "Мультиплеер: Игрок 2"],
    whoPrefix: "",
    // 0x4152fc, 0x4152e0
    device: "Управление",
    keyboard: "Клавиатура",
    // 0x41531c…0x415438
    labels: [
      "Влево",
      "Вверх",
      "Вправо",
      "Вниз",
      "Огонь",
      "Навести",
      "Управление режимом/Сменить Части",
      "Режим Супер Луч",
      "Поворот частей",
      "Сверхновая звезда",
    ],
    apply: "Принять настройку",
    vibration: "Force Feedback",
    strength: "Сила вибрации",
    bool: ["Истина", "Ложь"],
    decimal: ",",
  },
};

const TABLE: Readonly<Record<Lang, MenuTexts>> = { de: DE, en: EN, ru: RU };

export const menuTexts = (lang: Lang): MenuTexts => TABLE[lang];
