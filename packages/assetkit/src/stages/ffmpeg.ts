import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ffmpeg als externes Programm (Spec: kein ffmpeg.wasm). Die Versionszeile
 * gehört zum Cache-Schlüssel — ein anderes ffmpeg/libopus erzeugt andere Bytes,
 * und `assets:check` meldet das, statt es unbemerkt ins Repo zu lassen.
 */
function probeVersion(): string {
  try {
    const r = Bun.spawnSync(["ffmpeg", "-hide_banner", "-version"]);
    const line = new TextDecoder().decode(r.stdout).split("\n")[0] ?? "";
    return /^ffmpeg version (\S+)/.exec(line)?.[1] ?? "unknown";
  } catch {
    return "missing";
  }
}

export const FFMPEG_VERSION = probeVersion();

function requireFfmpeg(): void {
  if (FFMPEG_VERSION === "missing") {
    throw new Error(
      "ffmpeg fehlt — für die DoveZ-Assets installieren (z. B. `apt install ffmpeg`)",
    );
  }
}

async function run(args: readonly string[], input?: Uint8Array): Promise<Uint8Array> {
  requireFfmpeg();
  const proc = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
    stdin: input ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (input && proc.stdin) {
    proc.stdin.write(input);
    await proc.stdin.end();
  }
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`ffmpeg ${args.join(" ")}: Exit ${code}\n${err}`);
  return new Uint8Array(out);
}

/** Bitgenau reproduzierbare Ausgabe: keine Encoder-Tags, feste Ogg-Seriennummer. */
const BITEXACT = ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact"];

export interface OpusOptions {
  /** kbit/s. */
  readonly bitrate: number;
  /** Auf einen Kanal mischen (Sprache). */
  readonly mono: boolean;
  readonly ffmpeg: string;
}

/** WAV → Ogg Opus. */
export function encodeOpus(wav: Uint8Array, o: OpusOptions): Promise<Uint8Array> {
  return run(
    [
      "-f",
      "wav",
      "-i",
      "pipe:0",
      ...(o.mono ? ["-ac", "1"] : []),
      "-c:a",
      "libopus",
      "-b:a",
      `${o.bitrate}k`,
      ...BITEXACT,
      "-f",
      "ogg",
      "pipe:1",
    ],
    wav,
  );
}

export interface VideoOptions {
  /** VP9-Qualität (CRF, konstante Qualität ohne Bitratenziel). */
  readonly crf: number;
  readonly audioBitrate: number;
  readonly ffmpeg: string;
}

export interface VideoResult {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
}

/**
 * AVI (DivX 5 + MP3) → WebM (VP9 + Opus). Über Temp-Dateien, weil der
 * AVI-Demuxer den Index am Dateiende braucht. Nicht bitgenau reproduzierbar
 * (VP9 mit Threads) — Videos sind deshalb vom Hash-Gate ausgenommen.
 */
export async function encodeVideo(avi: Uint8Array, o: VideoOptions): Promise<VideoResult> {
  const dir = await mkdtemp(join(tmpdir(), "clove-video-"));
  try {
    const input = join(dir, "in.avi");
    const output = join(dir, "out.webm");
    await writeFile(input, avi);
    await run([
      "-i",
      input,
      "-c:v",
      "libvpx-vp9",
      "-crf",
      String(o.crf),
      "-b:v",
      "0",
      "-row-mt",
      "1",
      "-deadline",
      "good",
      "-cpu-used",
      "2",
      "-c:a",
      "libopus",
      "-b:a",
      `${o.audioBitrate}k`,
      "-map_metadata",
      "-1",
      "-f",
      "webm",
      output,
    ]);
    const probe = Bun.spawnSync([
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      output,
    ]);
    const info = JSON.parse(new TextDecoder().decode(probe.stdout)) as {
      streams: { width: number; height: number }[];
      format: { duration: string };
    };
    const stream = info.streams[0];
    if (!stream) throw new Error("ffprobe: kein Videostrom");
    return {
      bytes: new Uint8Array(await readFile(output)),
      width: stream.width,
      height: stream.height,
      duration: Math.round(Number(info.format.duration) * 1000) / 1000,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
