import { describe, expect, it } from "vitest";
import {
  BATTLE_UNIT_UI_ASSETS,
  getTechniqueGaugeFillWidth,
  getUnitHpFillWidth,
} from "./battleUnitUiAssets";

describe("battle unit UI assets", () => {
  it("uses each supplied asset exactly once", () => {
    expect(BATTLE_UNIT_UI_ASSETS).toHaveLength(4);
    expect(new Set(BATTLE_UNIT_UI_ASSETS.map((asset) => asset.key)).size).toBe(4);
    expect(BATTLE_UNIT_UI_ASSETS.every((asset) => asset.url.length > 0)).toBe(true);
  });

  it("normalizes every unit HP bar independently using the SWF floor percent", () => {
    expect(getUnitHpFillWidth(100, 100)).toBe(30);
    expect(getUnitHpFillWidth(50, 100)).toBe(15);
    expect(getUnitHpFillWidth(1, 100)).toBe(0.3);
    expect(getUnitHpFillWidth(25, 50)).toBe(15);
    expect(getUnitHpFillWidth(75, 300)).toBe(7.5);
    expect(getUnitHpFillWidth(0, 100)).toBe(0);
  });

  it("clips the 35px technique fill for empty, half and full states", () => {
    expect(getTechniqueGaugeFillWidth(0)).toBe(0);
    expect(getTechniqueGaugeFillWidth(50)).toBe(17.5);
    expect(getTechniqueGaugeFillWidth(100)).toBe(35);
    expect(getTechniqueGaugeFillWidth(500)).toBe(35);
  });
});
