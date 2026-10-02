/**
 * Hat das Fenster des Spiels den Fokus, und ist sein Tab sichtbar? Beide Spiele
 * öffnen ohne Fokus die Pause (DoveZ wie `GetFocus() = hWnd`, DOVE als Erweiterung).
 */
export class WindowFocus {
  private focus = true;
  private readonly win: Window | null | undefined;
  private readonly onBlur = () => (this.focus = false);
  private readonly onFocus = () => (this.focus = true);

  constructor(canvas: HTMLCanvasElement | undefined) {
    this.win = canvas?.ownerDocument?.defaultView;
    this.win?.addEventListener("blur", this.onBlur);
    this.win?.addEventListener("focus", this.onFocus);
  }

  get focused(): boolean {
    return this.focus && this.win?.document.hidden !== true;
  }

  dispose(): void {
    this.win?.removeEventListener("blur", this.onBlur);
    this.win?.removeEventListener("focus", this.onFocus);
  }
}
