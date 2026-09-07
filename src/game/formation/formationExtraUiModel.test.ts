import { describe, expect, it } from "vitest";
import {
  FORMATION_DOUBLE_CLICK_MS,
  FORMATION_SAVE_DRAWER,
  formationSaveDrawerY,
  isFormationDoubleClick,
} from "./formationExtraUiModel";

describe("formation save drawer timeline", () => {
  it("moves from the confirmed closed position to open over ten 24fps frames", () => {
    expect(formationSaveDrawerY(0, true)).toBe(FORMATION_SAVE_DRAWER.closedY);
    expect(formationSaveDrawerY(9 / 24 * 1_000, true)).toBe(FORMATION_SAVE_DRAWER.openY);
    expect(formationSaveDrawerY(9 / 24 * 1_000, false)).toBe(FORMATION_SAVE_DRAWER.closedY);
  });

  it("opens detail only for the same soldier within the double-click window", () => {
    const previous = { id: "p1", at: 1_000 };
    expect(isFormationDoubleClick(previous, "p1", 1_000 + FORMATION_DOUBLE_CLICK_MS)).toBe(true);
    expect(isFormationDoubleClick(previous, "p1", 1_001 + FORMATION_DOUBLE_CLICK_MS)).toBe(false);
    expect(isFormationDoubleClick(previous, "p2", 1_050)).toBe(false);
  });
});
