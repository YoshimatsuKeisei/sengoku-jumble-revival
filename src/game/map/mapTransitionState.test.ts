import { describe, expect, it, vi } from "vitest";
import { getBattleIntroFrameState, getSilhouettesAtFrame } from "./battleIntroModel";
import {
  OnceTransitionGuard,
  createBattleIntroData,
  createBattleSceneData,
  type SelectedMapCell,
} from "./mapTransitionState";

const selection: SelectedMapCell = { cellId: "x3y8", gridX: 3, gridY: 8, type: "enemy_castle" };

describe("map transition state", () => {
  it("guards pointerdown-style transitions against duplicate dispatch", () => {
    const guard = new OnceTransitionGuard();
    const dispatch = vi.fn();
    expect(guard.run(dispatch)).toBe(true);
    expect(guard.run(dispatch)).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("preserves selection and read-only economy context through Intro", () => {
    const economy = { money: 3_000, totalRank: 17_996 };
    const introData = createBattleIntroData(selection, economy);
    const battleData = createBattleSceneData(introData);
    expect(battleData.selectedMapCell).toEqual(selection);
    expect(battleData.economy).toEqual(economy);
    expect(battleData.playIntro).toBe(true);
    expect(battleData.selectedMapCell).not.toBe(selection);
    expect(battleData.economy).not.toBe(economy);
  });

  it("follows the SWF milestone visibility and discrete silhouette records", () => {
    expect(getBattleIntroFrameState(0)).toMatchObject({ frame: 1, vsGlowVisible: false, vsMainVisible: false });
    expect(getBattleIntroFrameState(15 / 24 * 1_000)).toMatchObject({ frame: 16, teamNamesVisible: true, vsGlowVisible: true });
    expect(getBattleIntroFrameState(73 / 24 * 1_000)).toMatchObject({ frame: 74, controlStripVisible: true });
    expect(getBattleIntroFrameState(92 / 24 * 1_000)).toMatchObject({ frame: 93, backgroundVisible: false });
    expect(getSilhouettesAtFrame(38).map((entry) => entry.depth)).toEqual([3, 7, 9]);
  });
});
