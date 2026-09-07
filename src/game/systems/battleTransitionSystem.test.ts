import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import {
  BATTLE_END_DURATION_MS,
  advanceBattleOpeningCameraFrame,
  clampBattleCameraZoom,
  createBattleOpeningCameraState,
  getBattleEndCurtainState,
  updateBattleOpeningCamera,
} from "./battleTransitionSystem";

describe("SWF battle start/end transition", () => {
  it("pans 2 source units per frame before easing zoom and center", () => {
    const state = createBattleOpeningCameraState(0.5);
    const start = battlefieldSourcePointToWorld({ x: 1410, y: 576 });
    advanceBattleOpeningCameraFrame(state, { x: 300, y: 450 }, 1);
    expect(state.centerX).toBeCloseTo(
      battlefieldSourcePointToWorld({ x: 1408, y: 576 }).x,
    );
    expect(state.centerY).toBe(start.y);
    for (let index = 0; index < 41; index += 1)
      advanceBattleOpeningCameraFrame(state, { x: 300, y: 450 }, 1);
    expect(state.phase).toBe("ZOOM");
    const previousZoom = state.zoom;
    const previousX = state.centerX;
    advanceBattleOpeningCameraFrame(state, { x: 300, y: 450 }, 1);
    expect(state.zoom).toBeCloseTo(previousZoom + (1 - previousZoom) / 10);
    expect(state.centerX).toBeCloseTo(previousX + (300 - previousX) / 7);
  });

  it("plays only maku frames 97..160 for exactly 64 frames", () => {
    expect(getBattleEndCurtainState(0)).toMatchObject({
      frame: 97,
      visible: false,
      complete: false,
    });
    expect(getBattleEndCurtainState(8 / 24 * 1_000)).toMatchObject({
      frame: 105,
      visible: true,
    });
    expect(getBattleEndCurtainState(BATTLE_END_DURATION_MS)).toMatchObject({
      frame: 160,
      closeProgress: 1,
      complete: true,
    });
  });

  it("advances at most one camera step per update and clamps Phaser zoom", () => {
    const state = createBattleOpeningCameraState(50);
    expect(state.zoom).toBe(3);
    updateBattleOpeningCamera(state, 10_000, { x: 300, y: 450 }, 100);
    expect(state.processedFrames).toBe(1);
    expect(state.zoom).toBeLessThanOrEqual(3);
    expect(clampBattleCameraZoom(0.01)).toBe(0.2);
    expect(clampBattleCameraZoom(100)).toBe(3);
  });
});
