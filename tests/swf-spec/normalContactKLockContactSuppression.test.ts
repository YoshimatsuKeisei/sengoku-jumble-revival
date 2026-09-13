import { describe, expect, it } from "vitest";
import { COMBAT_TIMING_CONFIG } from "../../src/game/config";
import { createSoldier } from "../../src/game/entities/Soldier";
import { startSoldierAttack, updateAttackStates } from "../../src/game/systems/attackSystem";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { resolveSequentialSwfSoldierContacts } from "../../src/game/systems/swfSoldierContactSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";

describe("raw normal-contact k=10 excludes the physical contact branch", () => {
  it("does not stack a k=3 contact impulse on either participant after a melee hit", () => {
    const attacker = createSoldier("player-1", "player", "ai", 500, 450);
    const defender = createSoldier("enemy-1", "enemy", "ai", 520, 450);
    defender.stats.defense = 0;

    expect(startSoldierAttack(attacker, defender, 0)).toBe(true);
    const hitAt = COMBAT_TIMING_CONFIG.attackWindupMs;
    updateAttackStates([attacker, defender], createBattleBases(), hitAt, false, () => 1);

    const snapshot = new Map([
      [attacker.id, { x: attacker.x, y: attacker.y }],
      [defender.id, { x: defender.x, y: defender.y }],
    ]);

    const sameFrame = resolveSequentialSwfSoldierContacts(
      [attacker, defender],
      snapshot,
      hitAt,
      () => 0,
    );
    expect(sameFrame.dynamicContacts).toBe(0);
    expect(sameFrame.impulsesArmed).toBe(0);
    expect(sameFrame.impulseTicksApplied).toBe(0);

    const midLock = resolveSequentialSwfSoldierContacts(
      [attacker, defender],
      snapshot,
      hitAt + swfLogicTicksToMs(5),
      () => 0,
    );
    expect(midLock.dynamicContacts).toBe(0);
    expect(midLock.impulsesArmed).toBe(0);
    expect(midLock.impulseTicksApplied).toBe(0);
  });
});
