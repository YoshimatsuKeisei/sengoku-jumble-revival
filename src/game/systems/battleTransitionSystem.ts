import {
  battlefieldSourceDistanceToWorldX,
  battlefieldSourcePointToWorld,
} from "../battlefieldLayout";

export const BATTLE_TRANSITION_FPS = 24;
export const BATTLE_INTRO_FRAMES = 96;
export const BATTLE_INTRO_DURATION_MS =
  BATTLE_INTRO_FRAMES / BATTLE_TRANSITION_FPS * 1_000;
export const BATTLE_END_FIRST_FRAME = 97;
export const BATTLE_END_LAST_FRAME = 160;
export const BATTLE_END_FRAMES = 64;
export const BATTLE_END_DURATION_MS =
  BATTLE_END_FRAMES / BATTLE_TRANSITION_FPS * 1_000;
export const BATTLE_CAMERA_ZOOM_SAFETY = {
  min: 0.2,
  max: 3,
} as const;

const OPENING_SOURCE_START = { x: 1410, y: 576 } as const;
const OPENING_SOURCE_PAN_END_X = 1330;
const OPENING_SOURCE_PAN_PER_FRAME = 2;

export interface BattleOpeningCameraState {
  phase: "PAN" | "ZOOM" | "DONE";
  centerX: number;
  centerY: number;
  zoom: number;
  processedFrames: number;
}

export function clampBattleCameraZoom(zoom: number): number {
  return Math.max(
    BATTLE_CAMERA_ZOOM_SAFETY.min,
    Math.min(BATTLE_CAMERA_ZOOM_SAFETY.max, zoom),
  );
}

export function createBattleOpeningCameraState(
  introZoom: number,
): BattleOpeningCameraState {
  const center = battlefieldSourcePointToWorld(OPENING_SOURCE_START);
  return {
    phase: "PAN",
    centerX: center.x,
    centerY: center.y,
    zoom: clampBattleCameraZoom(introZoom),
    processedFrames: 0,
  };
}

export function advanceBattleOpeningCameraFrame(
  state: BattleOpeningCameraState,
  player: { x: number; y: number },
  combatZoom: number,
): void {
  if (state.phase === "DONE") return;
  if (state.phase === "PAN") {
    state.centerX -= battlefieldSourceDistanceToWorldX(
      OPENING_SOURCE_PAN_PER_FRAME,
    );
    const panEnd = battlefieldSourcePointToWorld({
      x: OPENING_SOURCE_PAN_END_X,
      y: 0,
    }).x;
    if (state.centerX < panEnd) state.phase = "ZOOM";
  } else {
    const safeCombatZoom = clampBattleCameraZoom(combatZoom);
    state.zoom += (safeCombatZoom - state.zoom) / 10;
    state.zoom = clampBattleCameraZoom(state.zoom);
    state.centerX += (player.x - state.centerX) / 7;
    state.centerY += (player.y - state.centerY) / 7;
    if (Math.abs(safeCombatZoom - state.zoom) < 0.01) {
      state.zoom = safeCombatZoom;
      state.phase = "DONE";
    }
  }
  state.processedFrames += 1;
}

/** Advances at most one SWF camera step for each Phaser update call. */
export function updateBattleOpeningCamera(
  state: BattleOpeningCameraState,
  elapsedMs: number,
  player: { x: number; y: number },
  combatZoom: number,
): void {
  const elapsedFrames = Math.floor(
    Math.max(0, elapsedMs) * BATTLE_TRANSITION_FPS / 1_000,
  );
  if (state.phase === "DONE" || state.processedFrames >= elapsedFrames) return;
  advanceBattleOpeningCameraFrame(state, player, combatZoom);
}

export function battleTransitionFrameAt(
  elapsedMs: number,
  firstFrame: number,
  lastFrame: number,
): number {
  return Math.min(
    lastFrame,
    firstFrame +
      Math.floor(
        Math.max(0, elapsedMs) * BATTLE_TRANSITION_FPS / 1_000 + 1e-9,
      ),
  );
}

export interface BattleEndCurtainState {
  frame: number;
  visible: boolean;
  closeProgress: number;
  complete: boolean;
}

/** Sprite2531 label `maku`: only root frames 97..160 are played. */
export function getBattleEndCurtainState(
  elapsedMs: number,
): BattleEndCurtainState {
  const frame = battleTransitionFrameAt(
    elapsedMs,
    BATTLE_END_FIRST_FRAME,
    BATTLE_END_LAST_FRAME,
  );
  const firstVisibleFrame = 105;
  const fullyClosedFrame = 158;
  return {
    frame,
    visible: frame >= firstVisibleFrame,
    closeProgress:
      frame < firstVisibleFrame
        ? 0
        : Math.min(
            1,
            (frame - firstVisibleFrame) /
              (fullyClosedFrame - firstVisibleFrame),
          ),
    complete: elapsedMs >= BATTLE_END_DURATION_MS,
  };
}
