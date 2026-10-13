/**
 * Gemeinsamer Aufbau der Browser-Skripte (`smoke`, `frames`, `perf:render`): der
 * gebaute Launcher per `vite preview` und Chromium mit WebGL über SwiftShader.
 */
import { chromium, type Browser } from "playwright-core";

/** Startet `vite preview` auf `port`; der Aufrufer beendet ihn mit `kill()`. */
export function spawnPreview(port: number): Bun.Subprocess {
  return Bun.spawn(["bunx", "vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: `${import.meta.dir}/..`,
    stdout: "ignore",
    stderr: "inherit",
  });
}

/** Wartet bis zu 10 s, bis der Server auf `port` antwortet. */
export async function waitForPreview(port: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(`http://localhost:${port}/`).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await Bun.sleep(100);
  }
  throw new Error("vite preview startet nicht");
}

/** Chromium ohne GPU: WebGL über SwiftShader, dazu weitere Schalter. */
export function launchBrowser(...args: string[]): Promise<Browser> {
  return chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", ...args],
  });
}
