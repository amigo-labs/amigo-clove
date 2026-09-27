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

function lines(tokens: readonly string[], section: string): RadioLine[] {
  const out: RadioLine[] = [];
  for (let i = 0; i < tokens.length; i += 4) {
    let [speaker = "", wav = "", ms = "", text = ""] = tokens.slice(i, i + 4);
    // Einmal im Original (Spacestation2 [Asteroids]) stehen Dauer und WAV vertauscht.
    const swapped = /^\d+$/.test(wav) && /\.wav$/i.test(ms);
    if (swapped) [wav, ms] = [ms, wav];
    const s = speaker.toLowerCase();
    if (s !== "frame" && s !== "0") {
      throw new RadioTextError(`[${section}]: Sprecher ${JSON.stringify(speaker)} unbekannt`);
    }
    if (!/\.wav$/i.test(wav))
      throw new RadioTextError(`[${section}]: ${JSON.stringify(wav)} ist keine WAV`);
    if (ms !== "" && !/^\d+$/.test(ms)) {
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
