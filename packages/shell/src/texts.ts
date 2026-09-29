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
};

/** Megabyte mit einer Nachkommastelle in der Schreibweise der Sprache. */
export function mb(bytes: number, locale: Locale): string {
  return (bytes / 1e6).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
