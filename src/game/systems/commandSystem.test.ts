import { describe, expect, it } from "vitest";
import { BATTLEFIELD_CONFIG } from "../config";
import { battlefieldSourceDistanceToWorldX } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { updateAiTargets } from "./aiSystem";
import {
  issueAdvanceCommand,
  issueRallyCommand,
  issueDefendCommand,
  issueRetreatCommand,
  updateTemporaryOrder,
} from "./commandSystem";
import { swfCellsToWorldX, swfCellsToWorldY } from "./techniqueCombatProfiles";
import { updateRecoveryStates } from "./recoverySystem";

function setup() {
  const player = createSoldier("player-0", "player", "player", 100, 500);
  const near = createSoldier("player-1", "player", "ai", 140, 500, "defend");
  const far = createSoldier("player-2", "player", "ai", 400, 500, "wait");
  const enemy = createSoldier("enemy-0", "enemy", "ai", 120, 500);
  return { player, near, far, enemy, soldiers: [player, near, far, enemy] };
}

describe("temporary command system", () => {
  it("ADVANCE only affects living NORMAL allied AI inside its radius", () => {
    const { player, near, far, enemy, soldiers } = setup();
    const targets = issueAdvanceCommand(player, soldiers, 100);
    expect(targets).toEqual([near]);
    expect(near.temporaryOrder?.type).toBe("ADVANCE");
    expect(far.temporaryOrder).toBeNull();
    expect(enemy.temporaryOrder).toBeNull();
    expect(player.temporaryOrder).toBeNull();
  });

  it("DEFEND_ORDER only affects allies inside its radius", () => {
    const { player, near, far, enemy, soldiers } = setup();
    issueDefendCommand(player, soldiers, 0);
    expect(near.temporaryOrder?.type).toBe("DEFEND_ORDER");
    expect(far.temporaryOrder).toBeNull();
    expect(enemy.temporaryOrder).toBeNull();
  });

  it("RALLY uses the same 11x11 area and excludes recovery states", () => {
    const { player, near, far, soldiers } = setup();
    const retreating = createSoldier("p3", "player", "ai", 0, 0);
    const healing = createSoldier("p4", "player", "ai", 0, 0);
    const rejoining = createSoldier("p5", "player", "ai", 0, 0);
    const dead = createSoldier("p6", "player", "ai", 0, 0);
    retreating.state = "EMERGENCY_RETREAT";
    healing.state = "HEALING";
    rejoining.state = "REJOINING";
    dead.isDead = true;
    const targets = issueRallyCommand(player, [...soldiers, retreating, healing, rejoining, dead], 0);
    expect(targets).toEqual([near]);
    expect(retreating.temporaryOrder).toBeNull();
    expect(healing.temporaryOrder).toBeNull();
    expect(rejoining.temporaryOrder).toBeNull();
    expect(dead.temporaryOrder).toBeNull();
  });

  it("RETREAT is a distinct temporary order and never overwrites base strategy", () => {
    const { player, near, soldiers } = setup();
    issueRetreatCommand(player, soldiers, 0);
    updateTemporaryOrder(near, player, 100);
    expect(near.temporaryOrder?.type).toBe("RETREAT");
    expect(near.moveTargetX).toBe(BATTLEFIELD_CONFIG.playerHomeX);
    expect(near.strategy).toBe("defend");
    expect(near.state).toBe("NORMAL");
  });

  it("selects command recipients with an axis-aligned 11x11 rectangle", () => {
    const player = createSoldier("p", "player", "player", 500, 400);
    const corner = createSoldier("corner", "player", "ai",
      player.x + swfCellsToWorldX(4.99), player.y + swfCellsToWorldY(4.99));
    const outsideX = createSoldier("outside-x", "player", "ai",
      player.x + swfCellsToWorldX(5.01), player.y);
    const outsideY = createSoldier("outside-y", "player", "ai",
      player.x, player.y + swfCellsToWorldY(5.01));
    const targets = issueAdvanceCommand(player, [player, corner, outsideX, outsideY], 0);
    expect(targets).toEqual([corner]);
  });

  it("ADVANCE moves toward the enemy side without changing strategy", () => {
    const { player, near, soldiers } = setup();
    issueAdvanceCommand(player, soldiers, 0);
    updateTemporaryOrder(near, player, 100);
    expect(near.moveTargetX).toBe(BATTLEFIELD_CONFIG.enemyHomeX);
    expect(near.strategy).toBe("defend");
  });

  it("DEFEND_ORDER gathers around the player instead of advancing", () => {
    const { player, near, soldiers } = setup();
    issueDefendCommand(player, soldiers, 0);
    updateTemporaryOrder(near, player, 100);
    expect(Math.hypot((near.moveTargetX ?? 0) - player.x, (near.moveTargetY ?? 0) - player.y)).toBeCloseTo(62.5);
  });

  it("does not invent a timer release for the partially confirmed S path", () => {
    const { player, near, soldiers } = setup();
    issueAdvanceCommand(player, soldiers, 0);
    updateTemporaryOrder(near, player, 60_000);
    expect(near.temporaryOrder?.type).toBe("ADVANCE");
    expect(near.strategy).toBe("defend");
  });

  it("replaces an active A/S/D order without changing the base strategy", () => {
    const { player, near, soldiers } = setup();
    issueRetreatCommand(player, soldiers, 0);
    expect(near.temporaryOrder?.type).toBe("RETREAT");
    issueRallyCommand(player, soldiers, 1);
    expect(near.temporaryOrder?.type).toBe("RALLY");
    expect(near.strategy).toBe("defend");
  });

  it("recovery cancels an active command when HP becomes dangerous", () => {
    const { player, near, soldiers } = setup();
    issueAdvanceCommand(player, soldiers, 0);
    near.hp = 5;
    updateRecoveryStates(soldiers, 0);
    expect(near.state).toBe("EMERGENCY_RETREAT");
    expect(near.temporaryOrder).toBeNull();
  });

  it("prevents strategy AI from overwriting an active command destination", () => {
    const { player, near, soldiers } = setup();
    issueAdvanceCommand(player, soldiers, 0);
    updateTemporaryOrder(near, player, 100);
    const destination = [near.moveTargetX, near.moveTargetY];
    updateAiTargets(soldiers);
    expect([near.moveTargetX, near.moveTargetY]).toEqual(destination);
    expect(near.targetId).toBeNull();
  });

  it("RALLY keeps the issued D point and releases only below the SWF Manhattan boundary", () => {
    const { player, far, soldiers } = setup();
    far.x = 300;
    const issuedAt = { x: player.x, y: player.y };
    issueRallyCommand(player, soldiers, 0);
    player.x = 200;
    player.y = 300;
    updateTemporaryOrder(far, player, 100);
    expect({ x: far.moveTargetX, y: far.moveTargetY }).toEqual(issuedAt);
    far.x = issuedAt.x + battlefieldSourceDistanceToWorldX(49);
    far.y = issuedAt.y;
    updateTemporaryOrder(far, player, 200);
    expect(far.temporaryOrder).toBeNull();
  });
});
