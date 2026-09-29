import type { GameHost } from "@clove/core";
import { type Application, Container, Graphics, Sprite, Texture, VideoSource } from "pixi.js";
import { cint } from "../sim/vb";
import { GdiText } from "./gdi";
import { pauseKey } from "./input";
import type { Scene } from "./scene";

/**
 * Pixis `VideoSource.load()` wartet asynchron (Alpha-Erkennung) und liest danach
 * `resource.videoWidth`; wurde die Szene inzwischen zerstört, ist `resource` null.
 * Beendet sich ein Video sofort (Fehler), reicht ein Bild für den Absturz.
 */
class SafeVideoSource extends VideoSource {
  override get isValid(): boolean {
    return this.resource ? super.isValid : false;
  }
}

/**
 * Zwischensequenz (`PlayAVIFile` `0x551930`, DirectShow): 800 × 600, 1:1.
 * Vorher schreibt `LevelSkript` „Loading“ (System 18, weiß, 376/490) aufs
 * Schwarz — es steht, bis das Video läuft (im Original: solange `Depack`
 * die AVI entpackt). Ton mit 0 dB (unabhängig vom Musikpegel, im Port über
 * den Effekt-Bus), ohne Ton stumm. Ende, sobald `CLng(Position) ≥
 * CLng(Dauer)` (bis 0,5 s vor dem letzten Bild); Abbruch nur mit Esc, sofort,
 * danach Loslassen abwarten. Danach Schwarz; Musik gibt es währenddessen nicht.
 * Fehlt das Video oder lässt es sich nicht abspielen, geht es gleich weiter.
 */
export class VideoScene implements Scene {
  private readonly root = new Container();
  private readonly video: HTMLVideoElement;
  private readonly source: SafeVideoSource;
  private readonly texture: Texture;
  private readonly sprite: Sprite;
  private readonly audioNode: MediaElementAudioSourceNode | undefined;
  private readonly loading = new GdiText(18, 0xffffff);
  private started = false;
  private ended = false;
  private waitRelease = false;

  constructor(
    private readonly host: GameHost,
    private readonly app: Application,
    id: string,
    /** „Loading“ vorher (Kampagne, nicht beim Intro). */
    showLoading = true,
  ) {
    const black = new Graphics().rect(0, 0, 800, 600).fill(0x000000);
    this.root.addChild(black);
    this.loading.set("Loading", 376, 490);
    this.loading.text.visible = showLoading;
    this.root.addChild(this.loading.text);
    const video = host.canvas.ownerDocument.createElement("video");
    this.video = video;
    video.preload = "auto";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.muted = !host.audio;
    let node: MediaElementAudioSourceNode | undefined;
    if (host.audio) {
      try {
        node = host.audio.context.createMediaElementSource(video);
        node.connect(host.audio.sfx);
      } catch {
        video.muted = true;
      }
    }
    this.audioNode = node;
    const known = host.assets.has(id);
    if (known) video.src = host.assets.url(id);
    this.source = new SafeVideoSource({ resource: video, autoPlay: false });
    this.texture = new Texture({ source: this.source });
    this.sprite = new Sprite(this.texture);
    this.sprite.visible = false;
    this.root.addChild(this.sprite);
    app.stage.addChild(this.root);
    if (!known) {
      this.ended = true;
      return;
    }
    video.addEventListener("error", () => (this.ended = true));
    video.addEventListener("ended", () => (this.ended = true));
    video.addEventListener("playing", () => {
      this.started = true;
      this.sprite.visible = true;
      this.loading.text.visible = false;
    });
    void video.play().catch(() => {
      // Autoplay mit Ton verweigert: stumm versuchen, sonst überspringen
      video.muted = true;
      void video.play().catch(() => (this.ended = true));
    });
  }

  frame(): boolean {
    if (this.waitRelease) return !pauseKey(this.host);
    const v = this.video;
    const end =
      this.ended ||
      (this.started &&
        Number.isFinite(v.duration) &&
        cint(v.currentTime) >= cint(v.duration) &&
        v.duration > 0);
    if (pauseKey(this.host)) {
      this.stop();
      this.waitRelease = true;
      return false;
    }
    if (end) {
      this.stop();
      return true;
    }
    if (this.started) {
      this.sprite.width = 800;
      this.sprite.height = 600;
    }
    return false;
  }

  private stop(): void {
    this.video.pause();
    this.sprite.visible = false;
  }

  destroy(): void {
    this.stop();
    this.audioNode?.disconnect();
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
    // Pixi nimmt seine Listener ab und setzt das Video zurück (`src = ""`, `load()`);
    // ein eigenes `load()` vorher löste über Pixis Fehler-Listener eine unbehandelte Ablehnung aus
    this.texture.destroy(true);
  }
}
