import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import { applyDamage } from "./combatSystem";
import { recordNormalCombatResult, recordRecovery, recordSmallRecoveryPulse } from "./meritSystem";
import { startEmergencyRetreat } from "./recoverySystem";

describe("SWF battle merit counters", () => {
  it("records actual soldier damage and the final blow exactly once", () => {
    const attacker = createSoldier("a", "player", "ai", 0, 0);
    const target = createSoldier("t", "enemy", "ai", 0, 0);
    target.hp = 2;
    expect(applyDamage(target, 4, attacker)).toEqual({ appliedDamage: 2, battleOutStarted: true });
    applyDamage(target, 4, attacker);
    expect(attacker.merits.soldierDamage).toBe(2);
    expect(attacker.merits.kills).toBe(1);
  });

  it("records normal wins/losses and player-side defense independently of damage", () => {
    const player = createSoldier("p", "player", "ai", 10, 0);
    const enemy = createSoldier("e", "enemy", "ai", 20, 0);
    recordNormalCombatResult(enemy, player);
    expect(enemy.merits.battleWins).toBe(1);
    expect(player.merits.battleLosses).toBe(1);
    expect(player.merits.defense).toBe(1);
  });

  it("credits only yellow base retreat, not healer retreat", () => {
    const attacker = createSoldier("a", "enemy", "ai", 0, 0);
    const yellow = createSoldier("yellow", "player", "ai", 0, 0);
    yellow.lastDamageSourceId = attacker.id;
    startEmergencyRetreat(yellow, undefined, [yellow, attacker]);
    expect(attacker.merits.repels).toBe(1);

    const healer = createSoldier("h", "player", "ai", 1, 0);
    healer.specialAbilities = ["TREATMENT"];
    const blue = createSoldier("blue", "player", "ai", 2, 0);
    blue.lastDamageSourceId = attacker.id;
    startEmergencyRetreat(blue, undefined, [blue, healer, attacker]);
    expect(blue.recoveryTargetKind).toBe("HEALER");
    expect(attacker.merits.repels).toBe(1);
  });

  it("credits only actual effect healing; natural base healing never calls this hook", () => {
    const healer = createSoldier("h", "player", "ai", 0, 0);
    const target = createSoldier("t", "player", "ai", 0, 0);
    target.hp = target.maxHp - 1;
    recordRecovery(healer, target, 1);
    recordRecovery(healer, healer, 10);
    expect(healer.merits.recovery).toBe(11);
  });

  it("counts an sz small recovery as one event even when s20 restores two HP", () => {
    const healer = createSoldier("h", "player", "ai", 0, 0);
    const target = createSoldier("t", "player", "ai", 0, 0);
    recordSmallRecoveryPulse(healer, target, 2);
    expect(healer.merits.recovery).toBe(1);
  });
});
