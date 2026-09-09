import { describe, expect, it } from "vitest";
import { BASE_CONFIG, BATTLEFIELD_CONFIG, BATTLE_OBSTACLES, COMBAT_TIMING_CONFIG, PLAYER_MOUSE_DEAD_ZONE } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import type { SoldierBaseStats } from "../types";
import { startSoldierAttack, updateAttackStates } from "./attackSystem";
import { createBattleBases, getBaseForTeam, resolveBaseAccessCollisions } from "./baseSystem";
import {
  getBaseDamageCoreRect,
  getBaseLowerGateRect,
  getBaseRect,
  getBaseUpperGateRect,
  isPointInsideRect,
} from "./battlefieldGeometry";
import { getZoomAnchoredScroll } from "./cameraSystem";
import { getPlayerMovementIntent, moveAiSoldiers } from "./movementSystem";
import { updateNormalCombatContests } from "./normalCombatSystem";
import { getSwfHealingSlotPosition, startEmergencyRetreat, updateEmergencyRetreat, updateHealing } from "./recoverySystem";
import { getSwfBaseCollisionCodeAtWorld } from "./swfBaseCollisionGrid";

function stats(foot: number, combat = 50): SoldierBaseStats {
  return { maxHp: 60, skill: 50, foot, combat, defense: 0 };
}

function sourceTarget(soldier: ReturnType<typeof createSoldier>) {
  return battlefieldWorldPointToSource({ x: soldier.moveTargetX!, y: soldier.moveTargetY! });
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
  it("attaches player and enemy visual bases exactly to world edges", () => {
    const player = getBaseForTeam(createBattleBases(), "player");
    const enemy = getBaseForTeam(createBattleBases(), "enemy");
    expect(getBaseRect(player).x).toBe(0);
    expect(getBaseRect(enemy).x + enemy.width).toBe(BATTLEFIELD_CONFIG.width);
  });

  it("keeps alpha-derived gate/core rectangles as visual geometry only", () => {
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

  it("selects the SWF upper/lower route from source Y until entry is committed, then latches the inner target", () => {
    const bases = createBattleBases();
    const start = battlefieldSourcePointToWorld({ x: 500, y: 500 });
    const soldier = createSoldier("stable", "player", "ai", start.x, start.y);
    startEmergencyRetreat(soldier, bases);
    expect(soldier.recoveryGate).toBe("TOP");
    expect(sourceTarget(soldier)).toEqual({ x: 140, y: 249 });

    Object.assign(soldier, battlefieldSourcePointToWorld({ x: 500, y: 600 }));
    updateEmergencyRetreat(soldier, bases, () => 0.5, [soldier]);
    expect(soldier.recoveryGate).toBe("BOTTOM");
    expect(sourceTarget(soldier)).toEqual({ x: 140, y: 946 });

    Object.assign(soldier, battlefieldSourcePointToWorld({ x: 231, y: 600 }));
    updateEmergencyRetreat(soldier, bases, () => 0.5, [soldier]);
    expect((soldier as typeof soldier & { recoveryEntryCommitted?: boolean }).recoveryEntryCommitted).toBe(true);
    expect(sourceTarget(soldier)).toEqual({ x: 70, y: 580 });

    Object.assign(soldier, battlefieldSourcePointToWorld({ x: 231, y: 100 }));
    updateEmergencyRetreat(soldier, bases, () => 0.5, [soldier]);
    expect(sourceTarget(soldier)).toEqual({ x: 70, y: 580 });
  });

  it("moves a confirmed tile-999 entrant to its exact raw roster healing slot", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 216, y: 432 });
    const soldier = createSoldier("player-1", "player", "ai", point.x, point.y);
    soldier.state = "EMERGENCY_RETREAT";
    soldier.recoveryGate = "TOP";
    updateEmergencyRetreat(soldier, bases, () => 0.25, [soldier]);
    expect(soldier.state).toBe("HEALING");
    expect({ x: soldier.x, y: soldier.y }).toEqual(getSwfHealingSlotPosition(soldier));
  });

  it("uses roster-fixed healing positions rather than random crowd-placement candidates", () => {
    const first = createSoldier("player-1", "player", "ai", 0, 0);
    const second = createSoldier("player-2", "player", "ai", 0, 0);
    const firstSource = battlefieldWorldPointToSource(getSwfHealingSlotPosition(first));
    const secondSource = battlefieldWorldPointToSource(getSwfHealingSlotPosition(second));
    expect(firstSource).toEqual({ x: 68, y: 540 });
    expect(secondSource).toEqual({ x: 68, y: 600 });
  });

  it("keeps a healing soldier stationary while HP changes below the p7 transition", () => {
    const bases = createBattleBases();
    const base = bases[0];
    const soldier = createSoldier("h", "player", "ai", base.x, base.y);
    soldier.state = "HEALING";
    soldier.hp -= 10;
    const hpBefore = soldier.hp;
    const before = { x: soldier.x, y: soldier.y };
    updateHealing(soldier, 1, bases);
    expect({ x: soldier.x, y: soldier.y }).toEqual(before);
    expect(soldier.hp).toBeCloseTo(hpBefore + soldier.maxHp / 400 * 24);
    expect(soldier.state).toBe("HEALING");
  });
});

describe("Phase 3G SWF-coded base collision", () => {
  it("restores the 2026-09-07 access guard for zero-code visual-base gaps", () => {
    const bases = createBattleBases();
    const base = bases[0];
    const point = battlefieldSourcePointToWorld({ x: 180, y: 450 });
    const soldier = createSoldier("visual-only", "player", "ai", point.x, point.y);
    const before = { x: soldier.x, y: soldier.y };
    expect(isPointInsideRect(soldier, getBaseRect(base))).toBe(true);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBeNull();
    resolveBaseAccessCollisions([soldier], bases);
    expect(isPointInsideRect(soldier, getBaseRect(base))).toBe(false);
    expect({ x: soldier.x, y: soldier.y }).not.toEqual(before);
  });

  it("does not eject an entry-committed own-base retreat from a zero-code interior cell", () => {
    const bases = createBattleBases();
    const base = bases[0];
    const point = battlefieldSourcePointToWorld({ x: 180, y: 450 });
    const soldier = createSoldier("committed-retreat", "player", "ai", point.x, point.y);
    soldier.state = "EMERGENCY_RETREAT";
    soldier.recoveryGate = "TOP";
    (soldier as typeof soldier & { recoveryEntryCommitted?: boolean }).recoveryEntryCommitted = true;
    const before = { x: soldier.x, y: soldier.y };
    expect(isPointInsideRect(soldier, getBaseRect(base))).toBe(true);
    expect(getSwfBaseCollisionCodeAtWorld(soldier)).toBeNull();
    resolveBaseAccessCollisions([soldier], bases);
    expect({ x: soldier.x, y: soldier.y }).toEqual(before);
  });

  it("applies +6 source units to non-retreaters on tile 999 while allowing matching retreaters through", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 216, y: 432 });
    const normal = createSoldier("n", "player", "ai", point.x, point.y);
    const normalBefore = battlefieldWorldPointToSource(normal);
    resolveBaseAccessCollisions([normal], bases);
    const normalAfter = battlefieldWorldPointToSource(normal);
    expect(normalAfter.x - normalBefore.x).toBeCloseTo(6, 6);

    const retreat = createSoldier("r", "player", "ai", point.x, point.y);
    retreat.state = "EMERGENCY_RETREAT";
    const retreatBefore = { x: retreat.x, y: retreat.y };
    resolveBaseAccessCollisions([retreat], bases);
    expect({ x: retreat.x, y: retreat.y }).toEqual(retreatBefore);
  });

  it("applies the raw 996 collision bounce even when this pass is not resolving base damage", () => {
    const bases = createBattleBases();
    const point = battlefieldSourcePointToWorld({ x: 1605, y: 540 });
    const attacker = createSoldier("a", "player", "ai", point.x, point.y);
    const before = battlefieldWorldPointToSource(attacker);
    expect(getSwfBaseCollisionCodeAtWorld(attacker)).toBe(996);
    resolveBaseAccessCollisions([attacker], bases);
    const after = battlefieldWorldPointToSource(attacker);
    expect(after.x - before.x).toBeCloseTo(-10, 6);
    expect(attacker.baseContactLockTicks).toBe(10);
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

  it("allows only the pursuer to resolve a synchronous mode-0 attack from a retreat contest", () => {
    const pursuer = createSoldier("p", "player", "ai", 100, 100, "melee", stats(3, 100));
    const retreat = createSoldier("r", "enemy", "ai", 120, 100, "melee", stats(3, 0));
    retreat.state = "EMERGENCY_RETREAT";
    pursuer.targetId = retreat.id;
    retreat.targetId = pursuer.id;
    updateNormalCombatContests([pursuer, retreat], 0, () => 0);
    expect(pursuer.combatActionState).toBe("ATTACK_RECOVERY");
    expect(pursuer.attackHitApplied).toBe(true);
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