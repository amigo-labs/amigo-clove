/**
 * DoveZ-Kampagne `Play.txt` (in `Play.d2p`): eine Anweisung je Zeile.
 *
 * - `Load <Level>,<Ladebild.bmp>` — Level aus `Data/<Level>.dlp` mit Ladebild
 * - `Play <video.avi>` — Zwischensequenz aus `Video.d2p`
 * - `Save` — Speicherpunkt
 * - `credits` — Abspann
 */

export class PlayScriptError extends Error {
  override name = "PlayScriptError";
}

export type PlayStep =
  | { readonly op: "load"; readonly level: string; readonly loading: string }
  | { readonly op: "play"; readonly video: string }
  | { readonly op: "save" }
  | { readonly op: "credits" };

export function parsePlayScript(text: string): PlayStep[] {
  const out: PlayStep[] = [];
  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    const [word = "", ...rest] = line.split(" ");
    const arg = rest.join(" ").trim();
    switch (word.toLowerCase()) {
      case "load": {
        const [level = "", loading = ""] = arg.split(",").map((s) => s.trim());
        if (!level || !loading)
          throw new PlayScriptError(`Zeile ${n + 1}: Load ohne Level/Ladebild`);
        out.push({ op: "load", level, loading });
        break;
      }
      case "play":
        if (!arg) throw new PlayScriptError(`Zeile ${n + 1}: Play ohne Video`);
        out.push({ op: "play", video: arg });
        break;
      case "save":
        out.push({ op: "save" });
        break;
      case "credits":
        out.push({ op: "credits" });
        break;
      default:
        throw new PlayScriptError(`Zeile ${n + 1}: unbekannte Anweisung ${JSON.stringify(line)}`);
    }
  }
  return out;
}
