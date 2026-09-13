import { describe, expect, it } from "vitest";
import { battlefieldSwfPointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import {
  SWF_FORCED_TARGET_CONTACT_AXIS_UNITS,
  getSwfDynamicContactCellKey,
  selectSwfDynamicContactCandidate,
} from "../../src/game/systems/swfContactCandidateSelection";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function soldier(id: string, team: "player" | "enemy", rawX: number, rawY: number) {
  const point = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  return createSoldier(id, team, id === "player-0" ? "player" : "ai", point.x, point.y, "melee", STATS);
}

function rawPoint(rawX: number, rawY: number) {
  return battlefieldSwfPointToWorld({ x: rawX, y: rawY });
}

describe("raw SWF dynamic-contact candidate selection only", () => {
  it("selects nobody merely because another soldier is nearby when the proposed f[][] cell is free", () => {
    const current = soldier("player-0", "player", 800, 500);
    const nearby = soldier("enemy-0", "enemy", 820, 500);
    const selection = selectSwfDynamicContactCandidate(
      current,
      [current, nearby],
      rawPoint(780, 500),
      new Map(),
    );
    expect(selection).toEqual({ candidate: null, source: "NONE" });
  });

  it("selects only the soldier stored in the proposed 36-unit dynamic cell", () => {
    const current = soldier("player-0", "player", 800, 500);
    const selected = soldier("enemy-0", "enemy", 820, 500);
    const ignoredNearby = soldier("enemy-1", "enemy", 805, 525);
    const proposed = rawPoint(814, 500);
    const occupancy = new Map([[getSwfDynamicContactCellKey(proposed), selected]]);
    const selection = selectSwfDynamicContactCandidate(
      current,
      [current, selected, ignoredNearby],
      proposed,
      occupancy,
    );
    expect(selection.candidate).toBe(selected);
    expect(selection.source).toBe("PROPOSED_CELL");
  });

  it("lets the current l target inside strict <20/<20 override the proposed-cell occupant", () => {
    const current = soldier("player-0", "player", 800, 500);
    const target = soldier("enemy-0", "enemy", 819, 519);
    const cellOccupant = soldier("enemy-1", "enemy", 850, 500);
    current.targetId = target.id;
    const proposed = rawPoint(850, 500);
    const occupancy = new Map([[getSwfDynamicContactCellKey(proposed), cellOccupant]]);
    const selection = selectSwfDynamicContactCandidate(
      current,
      [current, target, cellOccupant],
      proposed,
      occupancy,
    );
    expect(selection.candidate).toBe(target);
    expect(selection.source).toBe("FORCED_TARGET");
  });

  it("keeps the current-target override strict: exactly 20 source units does not qualify", () => {
    const current = soldier("player-0", "player", 800, 500);
    const target = soldier("enemy-0", "enemy", 800 + SWF_FORCED_TARGET_CONTACT_AXIS_UNITS, 500);
    const cellOccupant = soldier("enemy-1", "enemy", 850, 500);
    current.targetId = target.id;
    const proposed = rawPoint(850, 500);
    const occupancy = new Map([[getSwfDynamicContactCellKey(proposed), cellOccupant]]);
    const selection = selectSwfDynamicContactCandidate(
      current,
      [current, target, cellOccupant],
      proposed,
      occupancy,
    );
    expect(selection.candidate).toBe(cellOccupant);
    expect(selection.source).toBe("PROPOSED_CELL");
  });

  it("does not force an inactive current target and falls back to the proposed cell", () => {
    const current = soldier("player-0", "player", 800, 500);
    const inactiveTarget = soldier("enemy-0", "enemy", 810, 500);
    const cellOccupant = soldier("enemy-1", "enemy", 850, 500);
    inactiveTarget.state = "HEALING";
    current.targetId = inactiveTarget.id;
    const proposed = rawPoint(850, 500);
    const occupancy = new Map([[getSwfDynamicContactCellKey(proposed), cellOccupant]]);
    const selection = selectSwfDynamicContactCandidate(
      current,
      [current, inactiveTarget, cellOccupant],
      proposed,
      occupancy,
    );
    expect(selection.candidate).toBe(cellOccupant);
    expect(selection.source).toBe("PROPOSED_CELL");
  });
});
