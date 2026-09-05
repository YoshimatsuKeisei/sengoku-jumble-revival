export const BATTLE_UI_FPS = 24;

export interface TimelinePlayback {
  from: number;
  to: number;
  completionFrame: number;
  stopAtEnd: boolean;
}

export class BattleUiTimelinePlayer {
  private frame = 1;
  private startedAt = 0;
  private playback: TimelinePlayback | null = null;

  playOnce(now: number, from: number, to: number, completionFrame = 1): void {
    this.start(now, { from, to, completionFrame, stopAtEnd: false });
  }

  playUntilStop(now: number, from: number, to: number): void {
    this.start(now, { from, to, completionFrame: to, stopAtEnd: true });
  }

  stopAt(frame: number): void {
    this.frame = frame;
    this.playback = null;
  }

  currentFrame(now: number): number {
    if (!this.playback) return this.frame;
    const elapsedFrames = Math.floor(Math.max(0, now - this.startedAt) * BATTLE_UI_FPS / 1_000 + 1e-9);
    const next = this.playback.from + elapsedFrames;
    if (this.playback.stopAtEnd && next >= this.playback.to) {
      this.frame = this.playback.to;
      this.playback = null;
      return this.frame;
    }
    if (next <= this.playback.to) {
      this.frame = next;
      return this.frame;
    }
    this.frame = this.playback.stopAtEnd ? this.playback.to : this.playback.completionFrame;
    this.playback = null;
    return this.frame;
  }

  get isPlaying(): boolean {
    return this.playback !== null;
  }

  private start(now: number, playback: TimelinePlayback): void {
    if (playback.from < 1 || playback.to < playback.from) throw new Error("Invalid battle UI timeline range");
    this.startedAt = now;
    this.frame = playback.from;
    this.playback = playback;
  }
}

export type BattleEventNoticeSide = "player" | "enemy";

export class BattleEventNoticeController {
  readonly timeline = new BattleUiTimelinePlayer();
  currentMessage = "";

  trigger(message: string, now: number): boolean {
    if (message === this.currentMessage) return false;
    this.currentMessage = message;
    this.timeline.playOnce(now, 2, 45, 1);
    return true;
  }
}

export interface BattleEventNoticeFrameState {
  visible: boolean;
  bandX: number;
  textVisible: boolean;
  iconVisible: boolean;
  iconX: number;
  bandWhiteOverlayAlpha: number;
  iconWhiteOverlayAlpha: number;
}

// Source: player_event_notice_ma.csv / enemy_event_notice_ea.csv.
export function getBattleEventNoticeFrameState(
  side: BattleEventNoticeSide,
  frame: number,
): BattleEventNoticeFrameState {
  const player = side === "player";
  const settledX = player ? -1 : 186;
  const iconX = player ? 4 : 359;
  if (frame < 3 || frame > 45) return {
    visible: false,
    bandX: settledX,
    textVisible: false,
    iconVisible: false,
    iconX,
    bandWhiteOverlayAlpha: 0,
    iconWhiteOverlayAlpha: 0,
  };
  if (frame === 3) return {
    visible: true,
    bandX: player ? -101 : 286,
    textVisible: false,
    iconVisible: true,
    iconX,
    bandWhiteOverlayAlpha: 1,
    iconWhiteOverlayAlpha: 1,
  };
  if (frame === 4) return {
    visible: true,
    bandX: player ? -26.75 : 211,
    textVisible: false,
    iconVisible: true,
    iconX,
    bandWhiteOverlayAlpha: 0.25,
    iconWhiteOverlayAlpha: 0.5,
  };
  return {
    visible: true,
    bandX: frame === 5 ? (player ? -2 : 186) : settledX,
    textVisible: true,
    iconVisible: frame === 5,
    iconX,
    bandWhiteOverlayAlpha: 0,
    iconWhiteOverlayAlpha: 0,
  };
}

// Source: message_controller_uwd.csv. The root x is already folded into stage x=-2.
export function getUwdPanelY(frame: number): number | null {
  const entrance = [380, 372.4, 365.6, 359.6, 354.4, 350, 346.4, 343.6, 341.6, 340.4, 340];
  const exit = [340, 340.5, 342, 344.45, 347.9, 352.35, 357.8, 364.2, 371.6, 380];
  if (frame >= 3 && frame <= 13) return entrance[frame - 3];
  if (frame >= 14 && frame <= 98) return 340;
  if (frame >= 99 && frame <= 107) return exit[frame - 98];
  return null;
}

// Source: controls_marker_prompt.csv.
export function getControlsPromptAlpha(frame: number): number {
  const fadeIn = [0, 0.199219, 0.398438, 0.601562, 0.800781, 1];
  if (frame < 6 || frame > 84) return 0;
  if (frame <= 11) return fadeIn[frame - 6];
  if (frame <= 81) return 1;
  return [0.667969, 0.332031, 0][frame - 82];
}

export function getKpbFrame(hpRatio: number): number {
  return Math.max(1, Math.min(100, Math.round(Math.max(0, Math.min(1, hpRatio)) * 99) + 1));
}

const KALT_FADE_IN = [
  0, 0.082031, 0.167969, 0.25, 0.332031, 0.417969, 0.5,
  0.582031, 0.667969, 0.75, 0.832031, 0.917969, 1,
] as const;
const KALT_FADE_OUT = [
  0.921875, 0.847656, 0.769531, 0.691406, 0.617188, 0.539062,
  0.460938, 0.382812, 0.308594, 0.230469, 0.152344, 0.078125, 0,
] as const;

// Source: battle_progress_kalt.csv, frames 1-166.
export function getKaltRulesAlpha(frame: number): number | null {
  if (frame < 1 || frame >= 166) return null;
  if (frame <= 13) return KALT_FADE_IN[frame - 1];
  if (frame <= 152) return 1;
  return KALT_FADE_OUT[frame - 153];
}

// Source: battle_progress_kalt.csv, frames 167-244.
export function getKaltModeAlpha(frame: number): number | null {
  if (frame < 167 || frame >= 244) return null;
  if (frame <= 175) return (frame - 167) / 8;
  if (frame <= 235) return 1;
  return (243 - frame) / 8;
}
