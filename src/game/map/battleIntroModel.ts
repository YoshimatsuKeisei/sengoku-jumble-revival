import introTimelineJson from "../../../assets/map_ui/config/intro_timeline.json";
import { frameAtElapsed } from "./mapTransitionState";

export interface IntroSilhouetteFrame {
  frame: number;
  depth: number;
  asset: string;
  x: number;
  y: number;
  alpha: number;
}

interface IntroTimeline {
  fps: number;
  start_frame: number;
  stop_frame: number;
  duration_ms: number;
  team_text: {
    visible_frames: [number, number];
    player: { x: number; y: number; bounds: { w: number; h: number } };
    enemy: { x: number; y: number; bounds: { w: number; h: number } };
    font_size_px: number;
    color: string;
    alignment: "left" | "center" | "right";
  };
  silhouette_display_frames: IntroSilhouetteFrame[];
}

export const BATTLE_INTRO_TIMELINE = introTimelineJson as unknown as IntroTimeline;

export interface BattleIntroFrameState {
  frame: number;
  backgroundVisible: boolean;
  teamNamesVisible: boolean;
  vsGlowVisible: boolean;
  vsMainVisible: boolean;
  controlStripVisible: boolean;
  openingWipe: number;
  closingWipe: number;
  thinClose: number;
}

function progress(frame: number, first: number, last: number): number {
  if (frame < first) return 0;
  if (frame >= last) return 1;
  return (frame - first) / (last - first);
}

export function getBattleIntroFrameState(elapsedMs: number): BattleIntroFrameState {
  const frame = Math.min(BATTLE_INTRO_TIMELINE.stop_frame, frameAtElapsed(elapsedMs));
  const teamFrames = BATTLE_INTRO_TIMELINE.team_text.visible_frames;
  return {
    frame,
    backgroundVisible: frame <= 82,
    teamNamesVisible: frame >= teamFrames[0] && frame <= teamFrames[1],
    vsGlowVisible: frame >= 16 && frame <= 22,
    vsMainVisible: frame >= 18 && frame <= 82,
    controlStripVisible: frame >= 74 && frame <= 82,
    openingWipe: frame < 9 ? 1 : frame <= 17 ? 1 - progress(frame, 9, 17) : 0,
    closingWipe: frame >= 74 && frame <= 82 ? progress(frame, 74, 82) : 0,
    thinClose: frame >= 83 && frame <= 92 ? progress(frame, 83, 92) : frame > 92 ? 1 : 0,
  };
}

export function getSilhouettesAtFrame(frame: number): IntroSilhouetteFrame[] {
  return BATTLE_INTRO_TIMELINE.silhouette_display_frames.filter((entry) => entry.frame === frame);
}
