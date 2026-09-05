import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { createArmy } from "../factories/createArmy";
import { COMMON_SPECIAL_ABILITY_POOL } from "./specialAbilitySystem";
import { formatSoldierInspector, STRATEGY_LABELS, updateInspectorTarget } from "./soldierInspectorSystem";
import { canPlayerContinueManualPursuitDuringWindup, canPlayerMoveInCurrentState, getSpecialGaugeProgress } from "./playerControlSystem";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import { getBaseGatePoint } from "./battlefieldGeometry";
import { updateRecoveryStates } from "./recoverySystem";
import { updateSpecialAttacks } from "./specialAttackSystem";

describe("Phase 3J inspector and player controls", () => {
  it("selects nearest touching friendly, excludes enemies, and holds before clearing", () => {
    const player = createSoldier("player", "player", "player", 100, 100);
    const farther = createSoldier("b", "player", "ai", 112, 100);
    const nearer = createSoldier("a", "player", "ai", 108, 100);
    const enemy = createSoldier("enemy", "enemy", "ai", 101, 100);
    let runtime = updateInspectorTarget(player, [player, farther, nearer, enemy], 100, { targetId: null, holdUntil: 0 });
    expect(runtime.targetId).toBe("a");
    nearer.x = 300; farther.x = 300;
    runtime = updateInspectorTarget(player, [player, farther, nearer, enemy], 300, runtime);
    expect(runtime.targetId).toBe("a");
    runtime = updateInspectorTarget(player, [player, farther, nearer, enemy], 501, runtime);
    expect(runtime.targetId).toBeNull();
  });
  it("formats Japanese strategy and ability labels", () => {
    const soldier = createSoldier("player-12", "player", "ai", 0, 0, "intercept");
    soldier.specialAbilities = ["MIGHT", "FORESIGHT"];
    expect(STRATEGY_LABELS.intercept).toBe("迎撃");
    expect(formatSoldierInspector(soldier)).toContain("・膂力\n・見切");
  });
  it("can debug-assign all and only common abilities to player", () => {
    const debugArmy = createArmy("player", () => 0, { playerAllCommonAbilities: true });
    expect(debugArmy[0].specialAbilities).toEqual(COMMON_SPECIAL_ABILITY_POOL);
    expect(new Set(debugArmy[0].specialAbilities).size).toBe(16);
    expect(debugArmy[1].specialAbilities).toEqual([]);
    expect(createArmy("player", () => 0, { playerAllCommonAbilities: false })[0].specialAbilities).toEqual([]);
  });
  it("allows manual movement in retreat and only retreat-target windup", () => {
    const player = createSoldier("p", "player", "player", 0, 0);
    const target = createSoldier("e", "enemy", "ai", 10, 0);
    player.state = "EMERGENCY_RETREAT";
    expect(canPlayerMoveInCurrentState(player, [player, target])).toBe(true);
    player.state = "NORMAL"; player.combatActionState = "ATTACK_WINDUP"; player.attackTargetKind = "SOLDIER"; player.attackTargetId = target.id;
    expect(canPlayerContinueManualPursuitDuringWindup(player, [player, target])).toBe(false);
    target.state = "EMERGENCY_RETREAT";
    expect(canPlayerContinueManualPursuitDuringWindup(player, [player, target])).toBe(true);
    player.reactionState = "HIT_STUN";
    expect(canPlayerMoveInCurrentState(player, [player, target])).toBe(false);
  });
  it("normalizes the special gauge and reports ready as one", () => {
    const player = createSoldier("p", "player", "player", 0, 0);
    player.specialReadyAt = 5_000;
    expect(getSpecialGaugeProgress(player, 0)).toBeGreaterThanOrEqual(0);
    expect(getSpecialGaugeProgress(player, 0)).toBeLessThanOrEqual(1);
    expect(getSpecialGaugeProgress(player, 5_000)).toBe(1);
  });
  it("starts player retreat without automatic gate, healer, or movement target", () => {
    const player = createSoldier("p", "player", "player", 500, 400);
    const healer = createSoldier("h", "player", "ai", 510, 400); healer.specialAbilities = ["TREATMENT"];
    player.hp = player.maxHp * 0.3;
    updateRecoveryStates([player, healer], 0, createBattleBases(), () => 1);
    expect(player.state).toBe("EMERGENCY_RETREAT");
    expect(player.recoveryGate).toBeNull();
    expect(player.recoveryHealerId).toBeNull();
    expect(player.moveTargetX).toBeNull();
  });
  it("enters after manually clearing a gate and exits instantly through the same gate", () => {
    const bases = createBattleBases(); const base = getBaseForTeam(bases, "player");
    const player = createSoldier("p", "player", "player", 0, 0); player.state = "EMERGENCY_RETREAT"; player.hp = 10;
    Object.assign(player, getBaseGatePoint(base, "BOTTOM", true));
    updateRecoveryStates([player], 0, bases, () => 1);
    expect(player.state).toBe("HEALING"); expect(player.recoveryGate).toBe("BOTTOM");
    updateRecoveryStates([player], 1_000, bases, () => 1);
    expect(player.state).toBe("NORMAL");
    expect({ x: player.x, y: player.y }).toEqual(getBaseGatePoint(base, "BOTTOM", false));
  });
  it("never auto-fires player special and does not spend cooldown without a target", () => {
    const player = createSoldier("p", "player", "player", 100, 100);
    const bases = createBattleBases();
    expect(updateSpecialAttacks([player], [], bases, 100, false)).toEqual([]);
    expect(player.specialReadyAt).toBe(0);
    expect(updateSpecialAttacks([player], [], bases, 100, true)).toEqual([]);
    expect(player.specialReadyAt).toBe(0);
  });
});
