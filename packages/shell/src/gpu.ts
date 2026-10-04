/** Renderer-Namen von WebGL auf der CPU (Chrome/Edge, Mesa, Windows ohne Treiber). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|basic render driver/i;

let probed = false;
let software: boolean | undefined;

/**
 * Zeichnet der Browser WebGL ohne Grafikkarte (Hardwarebeschleunigung aus, GPU
 * gesperrt)? Einmal mit Wegwerf-Kontexten geprüft: am Renderer-Namen (Firefox
 * nennt ihn direkt, Chrome und Safari nur über `WEBGL_debug_renderer_info`), sonst
 * daran, dass ein Kontext mit `failIfMajorPerformanceCaveat` verweigert wird.
 * `undefined` ohne WebGL. Nur ein Hinweis für die Einstellungen; das Spiel
 * zeichnet unabhängig davon gleich.
 */
export function softwareRendering(): boolean | undefined {
  if (probed) return software;
  probed = true;
  const doc = globalThis.document;
  if (!doc) return undefined;
  const gl = context(doc, false);
  if (!gl) return undefined;
  const named = SOFTWARE.test(rendererName(gl));
  release(gl);
  if (named) return (software = true);
  const fast = context(doc, true);
  if (fast) release(fast);
  return (software = !fast);
}

function context(doc: Document, failIfMajorPerformanceCaveat: boolean) {
  try {
    return doc.createElement("canvas").getContext("webgl", { failIfMajorPerformanceCaveat });
  } catch {
    return null;
  }
}

function rendererName(gl: WebGLRenderingContext): string {
  const plain = String(gl.getParameter(gl.RENDERER) ?? "");
  // Chrome und Safari verdecken den Namen („WebKit WebGL“); Firefox warnt bei der Erweiterung
  if (!/webkit/i.test(plain)) return plain;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "") : plain;
}

/** Kontext sofort freigeben: Browser erlauben nur wenige gleichzeitig. */
function release(gl: WebGLRenderingContext): void {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}
