import type { DovezGroup } from "@clove/formats";

/**
 * `DoAni` (`0x4B5520`): Bildanimation einer Sprite-Gruppe. Der Timer zählt je
 * Tick hoch; erreicht er die `delay` des aktuellen Bilds, geht es zum nächsten,
 * nach dem letzten zurück zu 0. Ein Bild `"-"` beendet die Folge: DoAni geht
 * zurück und hält das vorige Bild. Ein negativer Timer friert das Bild ein
 * (Route `SetPartFrame`, Richtungsbilder).
 */
export interface FrameState {
  frame: number;
  timer: number;
}

export function doAni(group: DovezGroup | undefined, s: FrameState): void {
  if (!group || s.timer < 0) return;
  const frames = group.frames;
  s.timer++;
  if (s.timer < (frames[s.frame]?.delay ?? 0)) return;
  s.timer = 0;
  s.frame++;
  if (s.frame > frames.length - 1) {
    s.frame = 0;
    return;
  }
  while (s.frame > 0 && frames[s.frame]!.bmp.length === 1) s.frame--;
}
