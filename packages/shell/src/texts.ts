import type { Dictionary, Locale, Translate } from "@clove/core";

/** Texte der Shell. Die Spiele bringen ihre eigenen (aus den Originalen). */
type Key =
  | "play"
  | "settings"
  | "back"
  | "comingSoon"
  | "debugAssets"
  | "debugLevel"
  | "doveSub"
  | "dovezSub"
  | "offlineReady"
  | "offlinePartial"
  | "offlineNone"
  | "loading"
  | "loadFailed"
  | "notFound"
  | "language"
  | "languageAuto"
  | "volume"
  | "volumeMaster"
  | "volumeMusic"
  | "volumeSfx"
  | "gamepad"
  | "gamepadUse"
  | "gamepadNone"
  | "gamepadConnected"
  | "gamepadHelp"
  | "motion"
  | "motionAuto"
  | "motionReduce"
  | "motionFull"
  | "motionHelp"
  | "display"
  | "scale"
  | "scaleInteger"
  | "scaleFit"
  | "scaleSmooth"
  | "scaleHelp"
  | "scanlines"
  | "fullscreen"
  | "fullscreenExit"
  | "controls"
  | "pointerUse"
  | "pointerHelp"
  | "touchBack"
  | "hud"
  | "hudModern"
  | "hudOriginal"
  | "hudHelp"
  | "hudScore"
  | "hudPlayer"
  | "hudLives"
  | "hudEnergy"
  | "hudBeam"
  | "hudShield"
  | "hudSpeed"
  | "hudPower"
  | "hudBoss"
  | "hudCombo"
  | "hudBossAppears"
  | "hudBossDefeated"
  | "hudLifeLost"
  | "loadingBar"
  | "gameCanvas"
  | "saves"
  | "savesHelp"
  | "export"
  | "import"
  | "imported"
  | "importFailed"
  | "offline"
  | "offlineHelp"
  | "install"
  | "installing"
  | "remove"
  | "persisted"
  | "notPersisted"
  | "storageUsage"
  | "noServiceWorker";

export type TextKey = Key;
export type ShellText = Translate<Key>;

export const TEXTS: Readonly<Record<Locale, Dictionary<Key>>> = {
  de: {
    play: "Spielen",
    settings: "Einstellungen",
    back: "Zurück",
    comingSoon: "folgt",
    debugAssets: "Assets ansehen (Debug)",
    debugLevel: "Level-Skripte ansehen (Debug)",
    doveSub: "1999–2003 · Horizontal-Shooter, 12 Level",
    dovezSub: "2004–2019 · The Second Wave, 27 Level",
    offlineReady: "offline spielbar",
    offlinePartial: "{percent} % offline gespeichert",
    offlineNone: "nicht offline gespeichert",
    loading: "Lade {title} … {loaded} / {total} MB",
    loadFailed: "{title} konnte nicht gestartet werden.",
    notFound: "Unbekannte Seite „{path}“.",
    language: "Sprache",
    languageAuto: "Automatisch (Browser)",
    volume: "Lautstärke",
    volumeMaster: "Gesamt",
    volumeMusic: "Musik",
    volumeSfx: "Effekte",
    gamepad: "Gamepad",
    gamepadUse: "Gamepad verwenden",
    gamepadNone: "Kein Gamepad erkannt — eine Taste am Pad drücken.",
    gamepadConnected: "Erkannt: {name}",
    gamepadHelp:
      "DOVE: Steuerkreuz/Stick bewegen, A Feuer, B Beam, X Extrawaffe drehen, Y Enter, LB/RB Tempo, Start Pause.",
    motion: "Bewegung",
    motionAuto: "wie das System",
    motionReduce: "reduzieren",
    motionFull: "volle Effekte",
    motionHelp:
      "Reduziert Bildschirmwackeln und schwächt Vollbildblitze ab; das Spielgeschehen bleibt gleich.",
    display: "Darstellung",
    scale: "Skalierung",
    scaleInteger: "ganzzahlig (scharf, wie das Original)",
    scaleFit: "Fenster füllen (scharf)",
    scaleSmooth: "Fenster füllen (weich)",
    scaleHelp:
      "Ganzzahlig lässt jedes Originalpixel gleich groß, „Fenster füllen“ nutzt den ganzen Platz. Vollbild: Alt+Enter oder ⛶ oben rechts.",
    scanlines: "Rasterlinien (Röhrenmonitor)",
    fullscreen: "Vollbild",
    fullscreenExit: "Vollbild beenden",
    controls: "Steuerung",
    pointerUse: "Maus und Touch steuern das Schiff",
    pointerHelp:
      "Maus: das Schiff folgt dem Zeiger, links Feuer, rechts Beam, Rad Tempo (DOVE) bzw. Waffenwechsel (DoveZ). Touch: Finger ziehen lenkt und feuert, zweiter Finger lädt den Beam. Pfeiltasten übernehmen jederzeit.",
    touchBack: "Zurück / Pause",
    hud: "Anzeige (HUD)",
    hudModern: "modern (neben dem Spielfeld, mit Boss-Balken)",
    hudOriginal: "Original (im Spielbild)",
    hudHelp:
      "Das moderne HUD zeigt Punkte, Leben, Energie, Beam und Waffen gut lesbar neben dem Spielfeld und die Lebenspunkte der Bosse; das Spielfeld wird dafür größer.",
    hudScore: "Punkte",
    hudPlayer: "Spieler",
    hudLives: "Leben",
    hudEnergy: "Energie",
    hudBeam: "Beam",
    hudShield: "Schild",
    hudSpeed: "Tempo",
    hudPower: "Stärke",
    hudBoss: "Boss",
    hudCombo: "Kombo {hits} · +{bonus}",
    hudBossAppears: "Ein Boss greift an.",
    hudBossDefeated: "Boss besiegt.",
    hudLifeLost: "Ein Leben verloren.",
    loadingBar: "Ladefortschritt",
    gameCanvas: "{title}: Spielfläche. Bedienung mit Tastatur oder Gamepad, Esc pausiert.",
    saves: "Spielstände",
    savesHelp:
      "Optionen, Freischaltungen und Highscores liegen im Browser und können dort jederzeit gelöscht werden. Als Datei sichern:",
    export: "Exportieren",
    import: "Importieren …",
    imported: "Importiert: {games}.",
    importFailed: "Import fehlgeschlagen: {error}",
    offline: "Offline-Daten",
    offlineHelp:
      "Lädt alle Spieldaten einmal vollständig in den Browser-Cache; danach startet das Spiel ohne Netz.",
    install: "Spieldaten installieren ({size} MB)",
    installing: "Installiere … {loaded} / {total} MB",
    remove: "Entfernen",
    persisted: "Der Browser behält die Daten dauerhaft.",
    notPersisted: "Der Browser darf die Daten bei Platzmangel löschen.",
    storageUsage: "Belegt: {used} MB von {quota} MB",
    noServiceWorker:
      "Offline-Betrieb nicht verfügbar (Entwicklungsserver oder Browser ohne Service Worker).",
  },
  en: {
    play: "Play",
    settings: "Settings",
    back: "Back",
    comingSoon: "coming later",
    debugAssets: "View assets (debug)",
    debugLevel: "View level scripts (debug)",
    doveSub: "1999–2003 · horizontal shooter, 12 levels",
    dovezSub: "2004–2019 · The Second Wave, 27 levels",
    offlineReady: "playable offline",
    offlinePartial: "{percent} % stored offline",
    offlineNone: "not stored offline",
    loading: "Loading {title} … {loaded} / {total} MB",
    loadFailed: "{title} could not be started.",
    notFound: "Unknown page “{path}”.",
    language: "Language",
    languageAuto: "Automatic (browser)",
    volume: "Volume",
    volumeMaster: "Master",
    volumeMusic: "Music",
    volumeSfx: "Effects",
    gamepad: "Gamepad",
    gamepadUse: "Use gamepad",
    gamepadNone: "No gamepad detected — press a button on the pad.",
    gamepadConnected: "Detected: {name}",
    gamepadHelp:
      "DOVE: d-pad/stick move, A fire, B beam, X turn special weapon, Y Enter, LB/RB speed, Start pause.",
    motion: "Motion",
    motionAuto: "as system",
    motionReduce: "reduce",
    motionFull: "full effects",
    motionHelp: "Reduces screen shake and softens full-screen flashes; gameplay stays the same.",
    display: "Display",
    scale: "Scaling",
    scaleInteger: "integer (sharp, as the original)",
    scaleFit: "fill window (sharp)",
    scaleSmooth: "fill window (smooth)",
    scaleHelp:
      "Integer keeps every original pixel the same size; “fill window” uses all the space. Full screen: Alt+Enter or ⛶ at the top right.",
    scanlines: "Scanlines (CRT look)",
    fullscreen: "Full screen",
    fullscreenExit: "Exit full screen",
    controls: "Controls",
    pointerUse: "Mouse and touch steer the ship",
    pointerHelp:
      "Mouse: the ship follows the pointer, left fires, right charges the beam, wheel changes speed (DOVE) or weapon (DoveZ). Touch: drag to steer and fire, a second finger charges the beam. Arrow keys take over at any time.",
    touchBack: "Back / pause",
    hud: "HUD",
    hudModern: "modern (beside the play field, with boss bar)",
    hudOriginal: "original (inside the picture)",
    hudHelp:
      "The modern HUD shows score, lives, energy, beam and weapons legibly beside the play field, plus boss health; the play field gets bigger.",
    hudScore: "Score",
    hudPlayer: "Player",
    hudLives: "Lives",
    hudEnergy: "Energy",
    hudBeam: "Beam",
    hudShield: "Shield",
    hudSpeed: "Speed",
    hudPower: "Power",
    hudBoss: "Boss",
    hudCombo: "Combo {hits} · +{bonus}",
    hudBossAppears: "A boss attacks.",
    hudBossDefeated: "Boss defeated.",
    hudLifeLost: "Life lost.",
    loadingBar: "Loading progress",
    gameCanvas: "{title}: play area. Controls: keyboard or gamepad, Esc pauses.",
    saves: "Saved games",
    savesHelp:
      "Options, unlocked levels and high scores live in the browser and may be deleted at any time. Keep a copy as a file:",
    export: "Export",
    import: "Import …",
    imported: "Imported: {games}.",
    importFailed: "Import failed: {error}",
    offline: "Offline data",
    offlineHelp:
      "Downloads all game data into the browser cache once; afterwards the game starts without a network.",
    install: "Install game data ({size} MB)",
    installing: "Installing … {loaded} / {total} MB",
    remove: "Remove",
    persisted: "The browser keeps the data permanently.",
    notPersisted: "The browser may delete the data when space runs low.",
    storageUsage: "Used: {used} MB of {quota} MB",
    noServiceWorker: "Offline mode unavailable (dev server or browser without service workers).",
  },
  ru: {
    play: "Играть",
    settings: "Настройки",
    back: "Назад",
    comingSoon: "скоро",
    debugAssets: "Просмотр ассетов (отладка)",
    debugLevel: "Просмотр скриптов уровней (отладка)",
    doveSub: "1999–2003 · горизонтальный шутер, 12 уровней",
    dovezSub: "2004–2019 · The Second Wave",
    offlineReady: "доступно офлайн",
    offlinePartial: "{percent} % сохранено офлайн",
    offlineNone: "не сохранено офлайн",
    loading: "Загрузка {title} … {loaded} / {total} МБ",
    loadFailed: "Не удалось запустить {title}.",
    notFound: "Неизвестная страница «{path}».",
    language: "Язык",
    languageAuto: "Автоматически (браузер)",
    volume: "Громкость",
    volumeMaster: "Общая",
    volumeMusic: "Музыка",
    volumeSfx: "Эффекты",
    gamepad: "Геймпад",
    gamepadUse: "Использовать геймпад",
    gamepadNone: "Геймпад не обнаружен — нажмите кнопку на геймпаде.",
    gamepadConnected: "Обнаружен: {name}",
    gamepadHelp:
      "DOVE: крестовина/стик — движение, A огонь, B луч, X смена доп. оружия, Y Enter, LB/RB скорость, Start пауза.",
    motion: "Движение",
    motionAuto: "как в системе",
    motionReduce: "уменьшить",
    motionFull: "полные эффекты",
    motionHelp:
      "Убирает тряску экрана и ослабляет вспышки на весь экран; игровой процесс не меняется.",
    display: "Изображение",
    scale: "Масштаб",
    scaleInteger: "целочисленный (чёткий, как в оригинале)",
    scaleFit: "по размеру окна (чёткий)",
    scaleSmooth: "по размеру окна (сглаженный)",
    scaleHelp:
      "Целочисленный масштаб сохраняет все пиксели одинаковыми, «по размеру окна» использует всё место. Полный экран: Alt+Enter или ⛶ справа вверху.",
    scanlines: "Строки развёртки (как на ЭЛТ)",
    fullscreen: "Полный экран",
    fullscreenExit: "Выйти из полноэкранного режима",
    controls: "Управление",
    pointerUse: "Мышь и касание управляют кораблём",
    pointerHelp:
      "Мышь: корабль следует за указателем, левая кнопка — огонь, правая — луч, колесо — скорость (DOVE) или смена оружия (DoveZ). Касание: ведите пальцем для движения и огня, второй палец заряжает луч. Стрелки перехватывают управление в любой момент.",
    touchBack: "Назад / пауза",
    hud: "Интерфейс (HUD)",
    hudModern: "современный (рядом с полем, с полосой босса)",
    hudOriginal: "оригинальный (в кадре)",
    hudHelp:
      "Современный HUD показывает очки, жизни, энергию, луч и оружие рядом с полем, а также здоровье боссов; игровое поле становится больше.",
    hudScore: "Очки",
    hudPlayer: "Игрок",
    hudLives: "Жизни",
    hudEnergy: "Энергия",
    hudBeam: "Луч",
    hudShield: "Щит",
    hudSpeed: "Скорость",
    hudPower: "Мощь",
    hudBoss: "Босс",
    hudCombo: "Комбо {hits} · +{bonus}",
    hudBossAppears: "Атакует босс.",
    hudBossDefeated: "Босс побеждён.",
    hudLifeLost: "Жизнь потеряна.",
    loadingBar: "Ход загрузки",
    gameCanvas: "{title}: игровое поле. Управление: клавиатура или геймпад, Esc — пауза.",
    saves: "Сохранения",
    savesHelp:
      "Настройки, открытые уровни и рекорды хранятся в браузере и могут быть удалены в любой момент. Копия в файл:",
    export: "Экспорт",
    import: "Импорт …",
    imported: "Импортировано: {games}.",
    importFailed: "Ошибка импорта: {error}",
    offline: "Офлайн-данные",
    offlineHelp:
      "Один раз загружает все данные игры в кэш браузера; после этого игра запускается без сети.",
    install: "Установить данные игры ({size} МБ)",
    installing: "Установка … {loaded} / {total} МБ",
    remove: "Удалить",
    persisted: "Браузер хранит данные постоянно.",
    notPersisted: "Браузер может удалить данные при нехватке места.",
    storageUsage: "Занято: {used} МБ из {quota} МБ",
    noServiceWorker: "Офлайн-режим недоступен (сервер разработки или браузер без Service Worker).",
  },
};

/** Megabyte mit einer Nachkommastelle in der Schreibweise der Sprache. */
export function mb(bytes: number, locale: Locale): string {
  return (bytes / 1e6).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
