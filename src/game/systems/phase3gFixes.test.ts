import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLEFIELD_CONFIG, BATTLE_OBSTACLES, COMBAT_TIMING_CONFIG, PLAYER_MOUSE_DEAD_ZONE, SOLDIER_RADIUS } from "../config";
import { createSoldier } from "../entities/Soldier";
import type { SoldierBaseStats } from "../types";
import { startSoldierAttack, updateAttackStates } from "./attackSystem";
import { canAttackEnemyBase, createBattleBases, getBaseForTeam, resolveBaseAccessCollisions } from "./baseSystem";
import {
  getBaseDamageCoreRect,
  getBaseGatePoint,
  getBaseHealingInteriorRect,
  getBaseLowerGateRect,
  getBaseRect,
  getBaseUpperGateRect,
  getPreferredBaseGate,
  isPointInsideRect,
} from "./battlefieldGeometry";
import { getZoomAnchoredScroll } from "./cameraSystem";
import { applyForcedMovement, getPlayerMovementIntent, moveAiSoldiers } from "./movementSystem";
import { updateNormalCombatContests } from "./normalCombatSystem";
import { chooseHealingSlotPosition, startEmergencyRetreat, updateEmergencyRetreat, updateHealing } from "./recoverySystem";

function stats(foot: number, combat = 50): SoldierBaseStats {
  return { maxHp: 60, skill: 50, foot, combat, defense: 0 };
}

describe("Phase 3G explicit player input", () => {
  const player = { x: 100, y: 100 };
  const pointer = { x: 300, y: 100 };

  it("stops without arrows or a held mouse button even when the cursor is distant", () => {
    expect(getPlayerMovementIntent(player, { x: 0, y: 0 }, pointer, false, PLAYER_MOUSE_DEAD_ZONE)).toEqual({ x: 0, y: 0 });
  });

  it("moves toward the cursor only while left mouse is held", () => {
    expect(getPlayerMovementIntent(player, { x: 0, y: 0 }, pointer, true, PLAYER_MOUSE_DEAD_ZONE)).toEqual({ x: 1, y: 0 });
    expect(getPlayerMovementIntent(player, { x: 0, y: 0 }, pointer, false, PLAYER_MOUSE_DEAD_ZONE)).toEqual({ x: 0, y: 0 });
  });

  it("gives normalized arrow input priority over mouse input", () => {
    const intent = getPlayerMovementIntent(player, { x: 0, y: -1 }, pointer, true, PLAYER_MOUSE_DEAD_ZONE);
    expect(intent).toEqual({ x: 0, y: -1 });
  });
});

describe("Phase 3G base access geometry", () => {
  it("attaches player and enemy bases exactly to world edges", () => {
    const player = getBaseForTeam(createBattleBases(), "player");
    const enemy = getBaseForTeam(createBattleBases(), "enemy");
    expect(getBaseRect(player).x).toBe(0);
    expect(getBaseRect(enemy).x + enemy.width).toBe(BATTLEFIELD_CONFIG.width);
  });

  it("places gate corridors over the visible top/bottom fences and keeps the core on the battlefield-facing side", () => {
    for (const base of createBattleBases()) {
      const rect = getBaseRect(base);
      const top = getBaseUpperGateRect(base);
      const bottom = getBaseLowerGateRect(base);
      const core = getBaseDamageCoreRect(base);
      expect(top.y).toBeCloseTo(rect.y);
      expect(bottom.y + bottom.height).toBeCloseTo(rect.y + rect.height);
      expect(top.x).toBeGreaterThanOrEqual(rect.x);
      expect(top.x + top.width).toBeLessThanOrEqual(rect.x + rect.width);
      expect(core.height).toBe(base.height * BASE_CONFIG.damageCoreHeightRatio);
      expect(base.team === "player" ? core.x + core.width : core.x).toBe(base.team === "player" ? rect.x + rect.width : rect.x);
    }
  });

  it("selects the nearest gate once and never targets the front core", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const soldier = createSoldier("stable", "player", "ai", 500, base.y - 100);
    expect(getPreferredBaseGate(soldier, base)).toBe("TOP");
    startEmergencyRetreat(soldier, bases);
    const chosen = soldier.recoveryGate;
    const originalTarget = { x: soldier.moveTargetX, y: soldier.moveTargetY };
    soldier.y = BATTLEFIELD_CONFIG.height;
    updateEmergencyRetreat(soldier, bases, () => 0.5, [soldier]);
    expect(soldier.recoveryGate).toBe(chosen);
    expect(originalTarget).toEqual(getBaseGatePoint(base, chosen!, false));
    expect(originalTarget.y).not.toBe(base.y);
  });

  it("snaps into a deterministic safe healing slot only after clearing the gate fence", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "player");
    const soldier = createSoldier("s", "player", "ai", 500, 100);
    startEmergencyRetreat(soldier, bases);
    Object.assign(soldier, getBaseGatePoint(base, soldier.recoveryGate!, false));
    updateEmergencyRetreat(soldier, bases, () => 0.25, [soldier]);
    expect(soldier.state).toBe("EMERGENCY_RETREAT");
    Object.assign(soldier, getBaseGatePoint(base, soldier.recoveryGate!, true));
    updateEmergencyRetreat(soldier, bases, () => 0.25, [soldier]);
    const expected = chooseHealingSlotPosition(base, [], () => 0.25);
    expect(soldier.state).toBe("HEALING");
    expect({ x: soldier.x, y: soldier.y }).toEqual(expected);
    expect(isPointInsideRect(soldier, getBaseHealingInteriorRect(base))).toBe(true);
  });

  it("tries alternate deterministic healing candidates to reduce crowding", () => {
    const base = createBattleBases()[0];
    const occupied = createSoldier("h", "player", "ai", 0, 0);
    Object.assign(occupied, chooseHealingSlotPosition(base, [], () => 0));
    occupied.state = "HEALING";
    const samples = [0, 0, 0.9, 0.9];
    const chosen = chooseHealingSlotPosition(base, [occupied], () => samples.shift() ?? 0.9);
    expect(Math.hypot(chosen.x - occupied.x, chosen.y - occupied.y)).toBeGreaterThanOrEqual(BASE_CONFIG.healingMinSpacing);
  });

  it("keeps a healing soldier completely stationary while HP changes", () => {
    const bases = createBattleBases();
    const base = bases[0];
    const soldier = createSoldier("h", "player", "ai", base.x, base.y);
    soldier.state = "HEALING";
    soldier.hp -= 10;
    const before = { x: soldier.x, y: soldier.y };
    updateHealing(soldier, 1, bases);
    expect({ x: soldier.x, y: soldier.y }).toEqual(before);
    expect(soldier.hp).toBe(soldier.maxHp - 9);
  });
});

describe("Phase 3G team-aware base collision", () => {
  it("projects enemies and NORMAL allies out while allowing recovery occupants", () => {
    const bases = createBattleBases();
    const base = bases[0];
    const enemy = createSoldier("e", "enemy", "ai", base.x, base.y);
    const normal = createSoldier("n", "player", "ai", base.x, base.y);
    const healing = createSoldier("h", "player", "ai", base.x, base.y);
    healing.state = "HEALING";
    resolveBaseAccessCollisions([enemy, normal, healing], bases);
    expect(isPointInsideRect(enemy, getBaseRect(base))).toBe(false);
    expect(isPointInsideRect(normal, getBaseRect(base))).toBe(false);
    expect(isPointInsideRect(healing, getBaseRect(base))).toBe(true);
  });

  it("prevents top/bottom entry and forced-movement intrusion", () => {
    const bases = createBattleBases();
    const base = bases[0];
    for (const gate of ["TOP", "BOTTOM"] as const) {
      const enemy = createSoldier(gate, "enemy", "ai", base.x, getBaseGatePoint(base, gate, true).y);
      resolveBaseAccessCollisions([enemy], bases);
      expect(isPointInsideRect(enemy, getBaseRect(base))).toBe(false);
    }
    const knocked = createSoldier("k", "enemy", "ai", base.width + 10, base.y);
    applyForcedMovement(knocked, -1, 0, 100);
    resolveBaseAccessCollisions([knocked], bases);
    expect(isPointInsideRect(knocked, getBaseRect(base))).toBe(false);
  });

  it("keeps attackers outside the front core while preserving base attack eligibility", () => {
    const bases = createBattleBases();
    const base = getBaseForTeam(bases, "enemy");
    const core = getBaseDamageCoreRect(base);
    const attacker = createSoldier("a", "player", "ai", core.x - SOLDIER_RADIUS, base.y);
    expect(canAttackEnemyBase(attacker, base)).toBe(true);
    resolveBaseAccessCollisions([attacker], bases);
    expect(isPointInsideRect(attacker, getBaseRect(base))).toBe(false);
  });

  it("keeps the six independent field fences vertical and excludes base fences", () => {
    expect(BATTLE_OBSTACLES).toHaveLength(6);
    expect(BATTLE_OBSTACLES.every((fence) => fence.height > fence.width)).toBe(true);
    expect(BATTLE_OBSTACLES.some((fence) => fence.id.includes("base-front"))).toBe(false);
  });
});

describe("Phase 3G player-anchored zoom", () => {
  it("preserves the anchor screen position when zooming in and out", () => {
    const anchor = { x: 900, y: 450 };
    const oldScroll = { x: 300, y: (BATTLEFIELD_CONFIG.height - 900 / 1.1) / 2 };
    for (const newZoom of [0.95, 1.4]) {
      const next = getZoomAnchoredScroll(oldScroll, 1.1, newZoom, anchor, 1600, 900);
      expect((anchor.x - next.x) * newZoom).toBeCloseTo((anchor.x - oldScroll.x) * 1.1);
      expect((anchor.y - next.y) * newZoom).toBeCloseTo((anchor.y - oldScroll.y) * 1.1);
    }
  });
});

describe("Phase 3G retreat pursuit", () => {
  it("uses direct pursuit and lets an AI pursuer move during retreat-target windup", () => {
    const pursuer = createSoldier("p", "player", "ai", 100, 100, "melee", stats(6, 100));
    const retreat = createSoldier("r", "enemy", "ai", 125, 100, "melee", stats(3, 0));
    retreat.state = "EMERGENCY_RETREAT";
    retreat.moveTargetX = 500;
    retreat.moveTargetY = 100;
    pursuer.targetId = retreat.id;
    expect(startSoldierAttack(pursuer, retreat, 0)).toBe(true);
    const before = pursuer.x;
    moveAiSoldiers([retreat, pursuer], 0.1);
    expect(pursuer.x).toBeGreaterThan(before);
    expect(pursuer.y).toBe(100);
  });

  it("does not move during windup against a normal target or for a player pursuer", () => {
    const normalPursuer = createSoldier("a", "player", "ai", 100, 100, "melee", stats(6));
    const target = createSoldier("t", "enemy", "ai", 120, 100);
    normalPursuer.targetId = target.id;
    startSoldierAttack(normalPursuer, target, 0);
    moveAiSoldiers([normalPursuer, target], 0.1);
    expect(normalPursuer.x).toBe(100);

    const player = createSoldier("pc", "player", "player", 100, 200, "melee", stats(6));
    const retreat = createSoldier("r", "enemy", "ai", 120, 200);
    retreat.state = "EMERGENCY_RETREAT";
    player.targetId = retreat.id;
    startSoldierAttack(player, retreat, 0);
    moveAiSoldiers([player, retreat], 0.1);
    expect(player.x).toBe(100);
  });

  it("allows only the pursuer to attack from a retreat contest", () => {
    const pursuer = createSoldier("p", "player", "ai", 100, 100, "melee", stats(3, 100));
    const retreat = createSoldier("r", "enemy", "ai", 120, 100, "melee", stats(3, 0));
    retreat.state = "EMERGENCY_RETREAT";
    pursuer.targetId = retreat.id;
    retreat.targetId = pursuer.id;
    updateNormalCombatContests([pursuer, retreat], 0, () => 0);
    expect(pursuer.combatActionState).toBe("ATTACK_WINDUP");
    expect(retreat.combatActionState).toBe("IDLE");
  });

  it("lets a faster pursuer maintain range and hit but allows a slower pursuer to miss", () => {
    for (const [pursuerFoot, retreatFoot, shouldHit] of [[6, 3, true], [1, 6, false]] as const) {
      const pursuer = createSoldier(`p-${pursuerFoot}`, "player", "ai", 100, 100, "melee", stats(pursuerFoot));
      const retreat = createSoldier(`r-${retreatFoot}`, "enemy", "ai", 125, 100, "melee", stats(retreatFoot));
      retreat.state = "EMERGENCY_RETREAT";
      retreat.moveTargetX = 1000;
      retreat.moveTargetY = 100;
      pursuer.targetId = retreat.id;
      startSoldierAttack(pursuer, retreat, 0);
      moveAiSoldiers([retreat, pursuer], COMBAT_TIMING_CONFIG.attackWindupMs / 1000);
      updateAttackStates([pursuer, retreat], createBattleBases(), COMBAT_TIMING_CONFIG.attackWindupMs, false, () => 1);
      expect(retreat.hp < retreat.maxHp).toBe(shouldHit);
      expect(retreat.reactionState === "HIT_STUN").toBe(shouldHit);
    }
  });

  it("stops considering a healing target in normal combat contests", () => {
    const pursuer = createSoldier("p", "player", "ai", 100, 100);
    const healing = createSoldier("h", "enemy", "ai", 120, 100);
    healing.state = "HEALING";
    pursuer.targetId = healing.id;
    updateNormalCombatContests([pursuer, healing], 0, () => 0);
    expect(pursuer.combatActionState).toBe("IDLE");
  });
});
