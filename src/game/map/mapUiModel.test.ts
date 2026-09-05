import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_CELL_ID,
  MAP_CELLS,
  MAP_CELL_METADATA,
  enterMapCell,
  entryTipYAtFrame,
  expectedCellStagePosition,
  getMapCell,
  isAzuchiLocked,
  isMapCellMovable,
  leaveMapCell,
  levelUpTipAlphaAtFrame,
  markerAssetAtElapsed,
  trainingPanelYAtFrame,
} from "./mapUiModel";

function cell(id: string) {
  const result = getMapCell(id);
  if (!result) throw new Error(`Missing fixture cell ${id}`);
  return result;
}

describe("map UI cell model", () => {
  it("loads exactly 251 positioned cells with unique ids", () => {
    expect(MAP_CELLS).toHaveLength(251);
    expect(new Set(MAP_CELLS.map((entry) => entry.cell_id)).size).toBe(251);
    expect(MAP_CELL_METADATA.map((entry) => entry.cell_id)).toContain("x8y8_special_locked");
  });

  it("uses the manifest grid equation for every cell coordinate", () => {
    for (const entry of MAP_CELLS) {
      expect({ x: entry.stage_x, y: entry.stage_y }).toEqual(expectedCellStagePosition(entry.grid_x, entry.grid_y));
    }
  });

  it("applies rectangular movement, forced training access, and all four sea routes", () => {
    const current = cell(DEFAULT_MAP_CELL_ID);
    expect(isMapCellMovable(cell("x8y13"), current)).toBe(true);
    expect(isMapCellMovable(cell("x8y10"), current)).toBe(true);
    expect(isMapCellMovable(cell("x14y15"), cell("x9y15"))).toBe(true);
    expect(isMapCellMovable(cell("x0y6"), cell("x0y10"))).toBe(true);
    expect(isMapCellMovable(cell("x7y15"), cell("x2y16"))).toBe(true);
    expect(isMapCellMovable(cell("x10y1"), cell("x6y2"))).toBe(true);
  });

  it("hides hover on leave while retaining the last bottom-info cell", () => {
    const initial = { hoveredCellId: null, infoCellId: DEFAULT_MAP_CELL_ID };
    const entered = enterMapCell(initial, "x9y15");
    expect(leaveMapCell(entered, "x9y15")).toEqual({ hoveredCellId: null, infoCellId: "x9y15" });
  });

  it("uses the original 4/2/4/2 current-marker loop", () => {
    expect(markerAssetAtElapsed(0)).toBe("current_marker_0");
    expect(markerAssetAtElapsed(4 / 24 * 1_000)).toBe("current_marker_1");
    expect(markerAssetAtElapsed(6 / 24 * 1_000)).toBe("current_marker_2");
    expect(markerAssetAtElapsed(10 / 24 * 1_000)).toBe("current_marker_1");
  });

  it("uses the six-castle condition for the x9y7 lock", () => {
    const lockedCell = cell("x9y7");
    expect(isAzuchiLocked(lockedCell, new Set())).toBe(true);
    expect(isAzuchiLocked(lockedCell, new Set(["x3y8", "x16y12", "x6y7", "x14y1", "x13y13", "x3y2"])))
      .toBe(false);
  });

  it("honors the entry-tip, level-tip, and training-panel timeline bounds", () => {
    expect(entryTipYAtFrame(1)).toBe(0);
    expect(entryTipYAtFrame(60)).toBe(62);
    expect(entryTipYAtFrame(61)).toBeNull();
    expect(levelUpTipAlphaAtFrame(14)).toBe(1);
    expect(levelUpTipAlphaAtFrame(81)).toBe(1);
    expect(levelUpTipAlphaAtFrame(92)).toBeNull();
    expect(trainingPanelYAtFrame(2)).toBeCloseTo(13 - 368.95);
    expect(trainingPanelYAtFrame(11)).toBe(13);
  });
});
