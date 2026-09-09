import { describe, expect, it } from "vitest";
import {
  BATTLE_UNIT_UI_ASSETS,
  SWF_UNIT_HP_BAR_COLORS,
  SWF_UNIT_HP_BAR_LOCAL_SCALE,
  SWF_UNIT_HP_BAR_SOURCE_OFFSET,
  UNIT_HP_BAR_SIZE,
  getTechniqueGaugeFillWidth,
  getUnitHpFillWidth,
} from "./battleUnitUiAssets";

describe("battle unit UI assets", () => {
  it("uses each supplied asset exactly once", () => {
    expect(BATTLE_UNIT_UI_ASSETS).toHaveLength(4);
    expect(new Set(BATTLE_UNIT_UI_ASSETS.map((asset) => asset.key)).size).toBe(4);
    expect(BATTLE_UNIT_UI_ASSETS.every((asset) => asset.url.length > 0)).toBe(true);
  });

  it("reproduces the Sprite2455 HP-bar placement transform and final SWF colors", () => {
    expect(SWF_UNIT_HP_BAR_SOURCE_OFFSET).toEqual({ x: -6, y: -26 });
    expect(SWF_UNIT_HP_BAR_LOCAL_SCALE.x).toBeCloseTo(0.4666595458984375, 12);
    expect(SWF_UNIT_HP_BAR_LOCAL_SCALE.y).toBeCloseTo(1.0000457763671875, 12);
    expect(UNIT_HP_BAR_SIZE.width * SWF_UNIT_HP_BAR_LOCAL_SCALE.x).toBeCloseTo(13.999786376953125, 8);
    expect(SWF_UNIT_HP_BAR_COLORS).toEqual({ empty: 0x000053, fill: 0x4c9bee });
  });

  it("uses the recovered 100-frame h timeline rather than a linear 30px crop", () => {
    expect(getUnitHpFillWidth(100, 100)).toBeCloseTo(29.9932861328125, 8);
    expect(getUnitHpFillWidth(50, 100)).toBeCloseTo(15.09765625, 8);
    expect(getUnitHpFillWidth(1, 100)).toBeCloseTo(0.4998779296875, 8);
    expect(getUnitHpFillWidth(25, 50)).toBeCloseTo(15.09765625, 8);
    expect(getUnitHpFillWidth(75, 300)).toBeCloseTo(7.650146484375, 8);
    expect(getUnitHpFillWidth(0, 100)).toBe(0);
  });

  it("clips the 35px technique fill for empty, half and full states", () => {
    expect(getTechniqueGaugeFillWidth(0)).toBe(0);
    expect(getTechniqueGaugeFillWidth(50)).toBe(17.5);
    expect(getTechniqueGaugeFillWidth(100)).toBe(35);
    expect(getTechniqueGaugeFillWidth(500)).toBe(35);
  });
});
