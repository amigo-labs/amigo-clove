import { decodeCp1251, encodeCp1251 } from "../text/cp1251";
import { decodeCp1252 } from "../text/cp1252";

/**
 * DoveZ-Funktexte `<Level>D.txt` / `E.txt` / `R.txt` (Deutsch, Englisch, Russisch).
 *
 * INI-artig: `[Abschnitt]` = Funk-ID aus dem Level-Skript, darunter eine durch
 * `;` getrennte Folge von Viergruppen `Sprecher; WAV; Dauer in ms; Untertitel`.
 * Zeilenumbrüche sind bedeutungslos — eine neue Zeile beginnt meist mit dem
 * nächsten Sprecher, manchmal steht er mitten in der Zeile. Sprecher ist
 * `Frame` (mit Funkbild, Groß-/Kleinschreibung gemischt) oder `0` (ohne; im
 * Original fast immer Bruce, der Flügelmann). Die letzte Gruppe eines
 * Abschnitts ist in einigen Dateien abgeschnitten (Dauer/Text fehlen), und
 * einmal stehen Dauer und WAV vertauscht (`swapped`).
 *
 * **Semikolon im Untertitel:** `Industry1R.txt` [Harbor] enthält `;` mitten im
 * russischen Untertitel (`…Кровавый ад;они прибыли до нас.;;0;`). Das Original
 * zerlegt jede Zeile stur mit `GetWord(…, ";")` (`0x576270`) und läse dort eine
 * Müllgruppe (Sprecher „они прибыли до нас.“, Dauer 0) — der Rest des Satzes
 * ginge verloren. Der Parser erkennt Gruppen deshalb an ihrem Anfang: ein
 * Sprecher (`Frame`/`0`), gefolgt von einer WAV (oder vertauscht von Dauer und
 * WAV). Alles dazwischen gehört zum Untertitel (mit `; ` zusammengefügt); leere
 * und einzelne „0“-Reste am Ende des Untertitels (`;;0;`) werden verworfen.
 * Bei allen übrigen Dateien (D, E, R) ändert das nichts.
 */

export class RadioTextError extends Error {
  override name = "RadioTextError";
}

export interface RadioLine {
  /** `true`: mit Funkbild (`Frame`), `false`: Sprecher `0`. */
  readonly frame: boolean;
  readonly wav: string;
  /** Dauer in ms; `null`, wo die Datei abgeschnitten ist. */
  readonly ms: number | null;
  readonly text: string;
  /** In der Datei standen Dauer und WAV vertauscht (hier korrigiert). */
  readonly swapped?: true;
}

export type RadioTexts = Readonly<Record<string, readonly RadioLine[]>>;

const isSpeaker = (t: string | undefined) => t !== undefined && /^(frame|0)$/i.test(t);
const isWav = (t: string | undefined) => t !== undefined && /\.wav$/i.test(t);
const isDigits = (t: string | undefined) => t !== undefined && /^\d+$/.test(t);

/** Beginnt bei `i` eine Gruppe? Sprecher, dann WAV — oder (vertauscht) Dauer, dann WAV. */
function startsGroup(tokens: readonly string[], i: number): boolean {
  return (
    isSpeaker(tokens[i]) &&
    (isWav(tokens[i + 1]) || (isDigits(tokens[i + 1]) && isWav(tokens[i + 2])))
  );
}

function lines(tokens: readonly string[], section: string): RadioLine[] {
  const out: RadioLine[] = [];
  let i = 0;
  while (i < tokens.length) {
    let [speaker = "", wav = "", ms = ""] = tokens.slice(i, i + 3);
    // Untertitel: alles bis zum nächsten Gruppenanfang (enthält ggf. selbst `;`)
    let next = i + 3;
    while (next < tokens.length && !startsGroup(tokens, next)) next++;
    const parts = tokens.slice(i + 3, next);
    while (parts.length > 0 && (parts.at(-1) === "" || parts.at(-1) === "0")) parts.pop();
    const text = parts.join("; ");
    i = next;
    // Einmal im Original (Spacestation2 [Asteroids]) stehen Dauer und WAV vertauscht.
    const swapped = isDigits(wav) && isWav(ms);
    if (swapped) [wav, ms] = [ms, wav];
    const s = speaker.toLowerCase();
    if (s !== "frame" && s !== "0") {
      throw new RadioTextError(`[${section}]: Sprecher ${JSON.stringify(speaker)} unbekannt`);
    }
    if (!isWav(wav)) throw new RadioTextError(`[${section}]: ${JSON.stringify(wav)} ist keine WAV`);
    if (ms !== "" && !isDigits(ms)) {
      throw new RadioTextError(`[${section}]: Dauer ${JSON.stringify(ms)} ist keine Zahl`);
    }
    out.push({
      frame: s === "frame",
      wav,
      ms: ms === "" ? null : Number(ms),
      text,
      ...(swapped ? { swapped: true } : {}),
    });
  }
  return out;
}

/** Parst den bereits dekodierten Text (CP1252 für D/E, CP1251 für R). */
export function parseRadioText(text: string): RadioTexts {
  const out: Record<string, RadioLine[]> = {};
  let section: string | undefined;
  let body: string[] = [];
  const flush = () => {
    if (section === undefined) return;
    const tokens = body
      .join(";")
      .split(";")
      .map((t) => t.trim());
    while (tokens.length > 0 && tokens.at(-1) === "") tokens.pop();
    if (section in out) throw new RadioTextError(`Abschnitt [${section}] doppelt`);
    out[section] = lines(tokens, section);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      flush();
      section = head[1] as string;
      body = [];
    } else if (section === undefined) {
      throw new RadioTextError(`Text vor dem ersten Abschnitt: ${JSON.stringify(line)}`);
    } else {
      body.push(line);
    }
  }
  flush();
  return out;
}

/**
 * Russischer Funktext (`<Level>R.txt`, CP1251). Die Abschnittsnamen sind
 * Funk-IDs aus dem Level-Skript und müssen **byteweise** zu diesen passen: das
 * Original vergleicht ANSI-Zeichenketten, die Level-Skripte tragen CP1252
 * (`Drohnen schießen` mit dem Byte `DF`, in CP1251 gelesen „Drohnen schieЯen“). Die Namen werden
 * darum aus denselben Bytes als CP1252 gelesen; der Untertitel bleibt kyrillisch.
 */
export function parseRadioTextRu(bytes: Uint8Array): RadioTexts {
  const texts = parseRadioText(decodeCp1251(bytes));
  return Object.fromEntries(
    Object.entries(texts).map(([section, groups]) => [decodeCp1252(encodeCp1251(section)), groups]),
  );
}
