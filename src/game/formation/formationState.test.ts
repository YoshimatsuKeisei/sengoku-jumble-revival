import { afterEach, describe, expect, it } from "vitest";
import { createArmy } from "../factories/createArmy";
import { createDefaultTeamArmySetup } from "../systems/armySetupSystem";
import {
  clearCommittedFormationState,
  cloneFormationState,
  commitFormationState,
  createInitialFormationState,
  getCommittedFormationState,
  moveFormationSoldier,
  reconcileFormationState,
  resolveCommittedFormationForRoster,
  validateFormationState,
} from "./formationState";

const roster = Array.from({ length: 30 }, (_, index) => ({
  id: `player-${index}`,
  x: 340 + Math.floor(index / 10) * 52 + (index % 2) * 10,
  y: 180 + (index % 10) * 60,
}));

afterEach(() => clearCommittedFormationState());

describe("formation working and committed state", () => {
  it("creates and atomically commits 30 unique legal positions", () => {
    const state = createInitialFormationState(roster);
    expect(validateFormationState(state)).toBe(true);
    expect(new Set(state.soldiers.map((soldier) => `${soldier.gridX}:${soldier.gridY}`)).size).toBe(30);
    const committed = commitFormationState(state);
    expect(getCommittedFormationState()).toEqual(committed);
    expect(getCommittedFormationState()).not.toBe(committed);
  });

  it("keeps the start cell when a drop is rejected and cancel clones the entry snapshot", () => {
    const working = createInitialFormationState(roster);
    const snapshot = cloneFormationState(working);
    const first = working.soldiers[0];
    expect(moveFormationSoldier(working, first.soldierId, 15, 14)).toBe(false);
    expect(working.soldiers[0]).toEqual(snapshot.soldiers[0]);
    expect(cloneFormationState(snapshot)).toEqual(snapshot);
  });

  it("keeps committed positions unchanged until edited working positions are confirmed", () => {
    const original = commitFormationState(createInitialFormationState(roster));
    const working = cloneFormationState(original);
    const first = working.soldiers[0];
    const free = working.soldiers.every((soldier) => soldier.gridX !== 14 || soldier.gridY !== 7)
      ? { x: 14, y: 7 }
      : { x: 14, y: 8 };

    expect(moveFormationSoldier(working, first.soldierId, free.x, free.y)).toBe(true);
    expect(getCommittedFormationState()).toEqual(original);

    const confirmed = commitFormationState(working);
    expect(getCommittedFormationState()).toEqual(confirmed);
    expect(confirmed).not.toEqual(original);
  });

  it("resolves roster changes by stable id before rosterIndex fallback", () => {
    const saved = createInitialFormationState(roster);
    const firstCell = { gridX: saved.soldiers[0].gridX, gridY: saved.soldiers[0].gridY };
    const reordered = [roster[1], roster[0], ...roster.slice(2)];
    const resolved = reconcileFormationState(reordered, saved);
    expect(resolved.soldiers.find((soldier) => soldier.soldierId === "player-0"))
      .toMatchObject(firstCell);

    const replacement = [{ ...roster[0], id: "replacement" }, ...roster.slice(1)];
    const fallback = reconcileFormationState(replacement, saved);
    expect(fallback.soldiers[0]).toMatchObject({ soldierId: "replacement", ...firstCell });
  });

  it("resolves committed PLAYER positions before Soldier creation without changing ENEMY", () => {
    const player = createArmy("player", () => 0.5, { armySetup: createDefaultTeamArmySetup() });
    const enemy = createArmy("enemy", () => 0.5, { armySetup: createDefaultTeamArmySetup() });
    const state = createInitialFormationState(player);
    const first = state.soldiers[0];
    const free = state.soldiers.every((soldier) => soldier.gridX !== 14 || soldier.gridY !== 7) ? { x: 14, y: 7 } : { x: 14, y: 8 };
    expect(moveFormationSoldier(state, first.soldierId, free.x, free.y)).toBe(true);
    commitFormationState(state);
    const enemyBefore = enemy.map((soldier) => ({ x: soldier.x, y: soldier.y, hp: soldier.hp }));
    const resolved = resolveCommittedFormationForRoster(player);
    expect(resolved?.soldiers[0]).toMatchObject({ worldX: free.x * 36, worldY: free.y * 36 });
    const positionedPlayer = createArmy("player", () => 0.5, {
      armySetup: createDefaultTeamArmySetup(),
      initialPositions: resolved?.soldiers,
    });
    expect(positionedPlayer[0]).toMatchObject({
      x: free.x * 36,
      y: free.y * 36,
      anchorX: free.x * 36,
      anchorY: free.y * 36,
      strategyObjectiveX: free.x * 36,
      strategyObjectiveY: free.y * 36,
    });
    expect(enemy.map((soldier) => ({ x: soldier.x, y: soldier.y, hp: soldier.hp }))).toEqual(enemyBefore);
  });
});
