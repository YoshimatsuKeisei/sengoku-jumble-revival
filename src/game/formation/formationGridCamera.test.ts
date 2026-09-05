import { describe, expect, it } from "vitest";
import {
  buildFormationOccupancy,
  canDropFormationSoldier,
  formationGridToWorld,
  formationWorldToGrid,
  getFormationOccupancyAt,
  getFormationFixedObstacleCells,
  isFormationGridCellInside,
} from "./formationGrid";
import {
  clampFormationCamera,
  createFormationCameraState,
  formationStageToWorld,
  formationWorldToStage,
  panFormationCameraAtPointer,
  toggleFormationCamera,
} from "./formationCamera";

describe("formation 36px grid and occupancy", () => {
  it("converts world coordinates to the nearest 36px cell and back", () => {
    expect(formationWorldToGrid(270, 198)).toEqual({ gridX: 8, gridY: 6 });
    expect(formationGridToWorld(8, 6)).toEqual({ x: 288, y: 216 });
  });

  it("uses inclusive gx and gy boundaries", () => {
    expect(isFormationGridCellInside(6, 5)).toBe(false);
    expect(isFormationGridCellInside(7, 5)).toBe(true);
    expect(isFormationGridCellInside(22, 28)).toBe(true);
    expect(isFormationGridCellInside(23, 28)).toBe(false);
    expect(isFormationGridCellInside(7, 4)).toBe(false);
    expect(isFormationGridCellInside(22, 29)).toBe(false);
  });

  it("accepts an empty legal cell and rejects range, soldier, and fixed-obstacle cells", () => {
    const soldiers = [
      { soldierId: "a", gridX: 10, gridY: 10 },
      { soldierId: "b", gridX: 11, gridY: 10 },
    ];
    expect(canDropFormationSoldier(soldiers, "a", 10, 10)).toBe(true);
    expect(canDropFormationSoldier(soldiers, "a", 12, 10)).toBe(true);
    expect(canDropFormationSoldier(soldiers, "a", 23, 10)).toBe(false);
    expect(canDropFormationSoldier(soldiers, "a", 11, 10)).toBe(false);
    expect(getFormationFixedObstacleCells().get("18:10")).toBe("s3");
    expect(canDropFormationSoldier(soldiers, "a", 18, 10)).toBe(false);
  });

  it("represents an unoccupied cell as null", () => {
    const occupancy = buildFormationOccupancy([{ soldierId: "a", gridX: 10, gridY: 10 }]);
    expect(getFormationOccupancyAt(occupancy, 12, 12)).toBeNull();
    expect(getFormationOccupancyAt(occupancy, 10, 10)).toEqual({ type: "soldier", soldierId: "a" });
  });
});

describe("formation camera transform", () => {
  it("round-trips stage and world coordinates in normal view", () => {
    const camera = createFormationCameraState("normal");
    expect(formationWorldToStage(400, 575, camera)).toEqual({ x: 190, y: 190 });
    expect(formationStageToWorld(190, 190, camera)).toEqual({ x: 400, y: 575 });
  });

  it("uses the SWF overview scale and origin", () => {
    const overview = toggleFormationCamera(createFormationCameraState("normal"));
    expect(overview).toMatchObject({ mode: "overview", scale: 0.36, centerX: 600, centerY: 625 });
    expect(formationWorldToStage(0, 0, overview)).toEqual({ x: -26, y: -35 });
  });

  it("clamps normal camera center and does not pan downward over the toolbar", () => {
    expect(clampFormationCamera({ mode: "normal", centerX: -100, centerY: 2_000, scale: 1 }))
      .toMatchObject({ centerX: 240, centerY: 934 });
    const camera = createFormationCameraState("normal");
    expect(panFormationCameraAtPointer(camera, 190, 350)).toEqual(camera);
    expect(panFormationCameraAtPointer(camera, 350, 190).centerX).toBe(407);
  });
});
