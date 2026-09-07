import extraManifestJson from "../../../assets/formation_ui/formation_extra_ui_manifest.json";

const manifest = extraManifestJson;

export const FORMATION_EXTRA_UI_FPS = manifest.formation_screen.fps;
export const FORMATION_SAVE_DRAWER = Object.freeze({
  x: manifest.save_drawer.inner_x,
  closedY: -31,
  openY: -3,
  motionFrames: manifest.save_drawer.animation_frames / 2,
});
export const FORMATION_DOUBLE_CLICK_MS = 300;

export interface FormationClickRecord {
  id: string;
  at: number;
}

export function formationSaveDrawerY(elapsedMs: number, opening: boolean): number {
  const elapsedFrames = Math.floor(Math.max(0, elapsedMs) * FORMATION_EXTRA_UI_FPS / 1_000);
  const progress = Math.min(1, elapsedFrames / (FORMATION_SAVE_DRAWER.motionFrames - 1));
  const from = opening ? FORMATION_SAVE_DRAWER.closedY : FORMATION_SAVE_DRAWER.openY;
  const to = opening ? FORMATION_SAVE_DRAWER.openY : FORMATION_SAVE_DRAWER.closedY;
  return from + (to - from) * progress;
}

export function isFormationDoubleClick(
  previous: FormationClickRecord | null,
  soldierId: string,
  now: number,
): boolean {
  return previous?.id === soldierId
    && now >= previous.at
    && now - previous.at <= FORMATION_DOUBLE_CLICK_MS;
}
