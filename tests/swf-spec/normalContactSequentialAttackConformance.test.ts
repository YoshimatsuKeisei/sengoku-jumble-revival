import { describe, expect, it } from "vitest";
import {
  battlefieldSwfPointToWorld,
  battlefieldWorldPointToSwf,
} from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { updateNormalCombatContests } from "../../src/game/systems/normalCombatSystem";
import {
  calculateRawNormalContactDamage,
  isRawNormalContactGuarded,
  resolveRawNormalContactAttack,
} from "../../src/game/systems/normalContactAttackSystem";
import { updateReactions } from "../../src/game/systems/reactionSystem";
import { resolveSequentialSwfSoldierContacts } from "../../src/game/systems/swfSoldierContactSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";

const STATS = { maxHp: 60, skill: 50, foot: 3, combat: 50, defense: 50 } as const;

function unit(id: string, team: "player" | "enemy", rawX: number, rawY: number) {
  const point = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  return createSoldier(id, team, id === "player-0" ? "player" : "ai", point.x, point.y, "melee", STATS);
}
function starts(units: ReturnType<typeof unit>[]) {
  return new Map(units.map((soldier) => [soldier.id, { x: soldier.x, y: soldier.y }]));
}
function propose(soldier: ReturnType<typeof unit>, rawX: number, rawY: number) {
  const point = battlefieldSwfPointToWorld({ x: rawX, y: rawY });
  soldier.x = point.x; soldier.y = point.y;
}
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("raw sequential normal-contact attack integration", () => {
  it("does not attack a merely nearby radial enemy when the proposed f[][] cell is free", () => {
    const player = unit("player-0", "player", 800, 500);
    const enemy = unit("enemy-0", "enemy", 820, 500);
    const roster = [player, enemy];
    const before = enemy.hp;
    const frameStart = starts(roster);
    propose(player, 804, 500);
    const result = resolveSequentialSwfSoldierContacts(roster, frameStart, 1_000, sequence(0, 1));
    expect(result.dynamicContacts).toBe(0);
    expect(result.normalContactAttacks).toBe(0);
    expect(enemy.hp).toBe(before);
  });

  it("resolves only the selected occupied-cell enemy synchronously and skips the k=3 branch", () => {
    const player = unit("player-0", "player", 800, 500);
    const enemy = unit("enemy-0", "enemy", 820, 500);
    player.stats.combat = 100;
    enemy.stats.combat = 1;
    enemy.stats.defense = 0;
    const roster = [player, enemy];
    const before = enemy.hp;
    const frameStart = starts(roster);
    propose(player, 814, 500);
    const result = resolveSequentialSwfSoldierContacts(roster, frameStart, 1_000, sequence(0, 1));
    expect(result.normalContactAttacks).toBe(1);
    expect(result.spacingCorrections).toBe(0);
    expect(result.impulsesArmed).toBe(0);
    expect(enemy.hp).toBe(before - 1);
    expect(enemy.reactionState).toBe("HIT_STUN");
    expect(player.combatActionState).toBe("ATTACK_RECOVERY");
  });

  it("suppresses the later legacy all-pairs BattleScene pass for the same roster", () => {
    const player = unit("player-0", "player", 800, 500);
    const enemy = unit("enemy-0", "enemy", 820, 500);
    player.stats.combat = 100;
    enemy.stats.combat = 1;
    enemy.stats.defense = 0;
    const roster = [player, enemy];
    const frameStart = starts(roster);
    propose(player, 814, 500);
    resolveSequentialSwfSoldierContacts(roster, frameStart, 1_000, sequence(0, 1));
    const afterSequential = enemy.hp;
    updateNormalCombatContests(roster, 1_000, () => 0);
    expect(enemy.hp).toBe(afterSequential);
  });

  it("consumes normal defense before HORO and lets HORO guard ordinary contact", () => {
    const attacker = unit("player-1", "player", 500, 500);
    const defender = unit("enemy-0", "enemy", 520, 500);
    defender.stats.defense = 0;
    defender.specialAbilities = ["HORO"];
    let calls = 0;
    const guarded = isRawNormalContactGuarded(attacker, defender, () => {
      calls += 1;
      return calls === 1 ? 1 : 0.31;
    });
    expect(calls).toBe(2);
    expect(guarded).toBe(true);
  });

  it("uses basic -> MIGHT -> FINISHER -> NINJA_HUNTER damage order", () => {
    const attacker = unit("player-1", "player", 500, 500);
    const defender = unit("enemy-0", "enemy", 520, 500);
    defender.unitType = "NINJA";
    defender.hp = 7;
    attacker.specialAbilities = ["FINISHER"];
    attacker.rareSpecialAbilities = ["NINJA_HUNTER"];
    expect(calculateRawNormalContactDamage(attacker, defender)).toBe(2);
  });

  it("keeps defense equality as guard and marks mode-0 resolution synchronously", () => {
    const attacker = unit("player-1", "player", 500, 500);
    const defender = unit("enemy-0", "enemy", 520, 500);
    defender.stats.defense = 100;
    const result = resolveRawNormalContactAttack(attacker, defender, 2_000, () => 0.5);
    expect(result.resolved).toBe(true);
    expect(result.guarded).toBe(true);
    expect(result.appliedDamage).toBe(0);
    expect(defender.combatFeedbackMarker).toBe("S");
  });

  it("keeps both participants out of a repeat contact attack during the raw k=10 response", () => {
    const player = unit("player-0", "player", 800, 500);
    const enemy = unit("enemy-0", "enemy", 820, 500);
    player.stats.combat = 100;
    enemy.stats.combat = 1;
    enemy.stats.defense = 0;
    const roster = [player, enemy];
    let frameStart = starts(roster);
    propose(player, 814, 500);
    const first = resolveSequentialSwfSoldierContacts(roster, frameStart, 1_000, sequence(0, 1));
    expect(first.normalContactAttacks).toBe(1);
    const afterFirst = enemy.hp;

    frameStart = starts(roster);
    const locked = resolveSequentialSwfSoldierContacts(
      roster,
      frameStart,
      1_000 + swfLogicTicksToMs(5),
      sequence(0, 1),
    );
    expect(locked.normalContactAttacks).toBe(0);
    expect(enemy.hp).toBe(afterFirst);
  });

  it("rejects a repeat mode-0 attack when only one unit differs from stored bx/by", () => {
    const player = unit("player-0", "player", 800, 500);
    const enemy = unit("enemy-0", "enemy", 820, 500);
    player.stats.combat = 100;
    enemy.stats.combat = 1;
    enemy.stats.defense = 0;
    const roster = [player, enemy];
    let frameStart = starts(roster);
    propose(player, 814, 500);
    resolveSequentialSwfSoldierContacts(roster, frameStart, 1_000, sequence(0, 1));
    const afterFirst = enemy.hp;

    updateReactions(roster, [], 1_000 + swfLogicTicksToMs(10), swfLogicTicksToMs(10));
    propose(player, 800, 500);
    propose(enemy, 819, 500);
    frameStart = starts(roster);
    const oneMoved = resolveSequentialSwfSoldierContacts(
      roster,
      frameStart,
      1_000 + swfLogicTicksToMs(11),
      sequence(0, 1),
    );
    expect(oneMoved.dynamicContacts).toBeGreaterThan(0);
    expect(oneMoved.normalContactAttacks).toBe(0);
    expect(enemy.hp).toBe(afterFirst);
  });

  it("allows another mode-0 attack after k response once both units differ from stored bx/by", () => {
    const player = unit("player-0", "player", 800, 500);
    const enemy = unit("enemy-0", "enemy", 820, 500);
    player.stats.combat = 100;
    enemy.stats.combat = 1;
    enemy.stats.defense = 0;
    const roster = [player, enemy];
    let frameStart = starts(roster);
    propose(player, 814, 500);
    resolveSequentialSwfSoldierContacts(roster, frameStart, 1_000, sequence(0, 1));
    const afterFirst = enemy.hp;

    updateReactions(roster, [], 1_000 + swfLogicTicksToMs(10), swfLogicTicksToMs(10));
    propose(player, 801, 500);
    propose(enemy, 819, 500);
    frameStart = starts(roster);
    const bothMoved = resolveSequentialSwfSoldierContacts(
      roster,
      frameStart,
      1_000 + swfLogicTicksToMs(11),
      sequence(0, 1),
    );
    expect(bothMoved.normalContactAttacks).toBe(1);
    expect(enemy.hp).toBe(afterFirst - 1);
  });

  it("applies the ordinary defender 10-unit raw impulse on the first k tick", () => {
    const attacker = unit("player-1", "player", 500, 500);
    const defender = unit("enemy-0", "enemy", 520, 500);
    defender.stats.defense = 0;
    const start = battlefieldWorldPointToSwf(defender);
    resolveRawNormalContactAttack(attacker, defender, 2_000, () => 1);
    updateReactions([attacker, defender], [], 2_000 + swfLogicTicksToMs(1), swfLogicTicksToMs(1));
    const after = battlefieldWorldPointToSwf(defender);
    expect(after.x - start.x).toBeCloseTo(-10, 6);
    expect(after.y - start.y).toBeCloseTo(0, 6);
  });

  it("uses IRON_WALL guard as defender 5-unit plus opposite attacker 10-unit impulse", () => {
    const attacker = unit("player-1", "player", 500, 500);
    const defender = unit("enemy-0", "enemy", 520, 500);
    defender.stats.defense = 100;
    defender.specialAbilities = ["IRON_WALL"];
    const attackerStart = battlefieldWorldPointToSwf(attacker);
    const defenderStart = battlefieldWorldPointToSwf(defender);
    const result = resolveRawNormalContactAttack(attacker, defender, 2_000, () => 0);
    expect(result.guarded).toBe(true);
    updateReactions([attacker, defender], [], 2_000 + swfLogicTicksToMs(1), swfLogicTicksToMs(1));
    const attackerAfter = battlefieldWorldPointToSwf(attacker);
    const defenderAfter = battlefieldWorldPointToSwf(defender);
    expect(defenderAfter.x - defenderStart.x).toBeCloseTo(-5, 6);
    expect(attackerAfter.x - attackerStart.x).toBeCloseTo(10, 6);
  });

  it("keeps fatal HP at zero through the k reaction and finalizes battle-out only when it completes", () => {
    const attacker = unit("player-1", "player", 500, 500);
    const defender = unit("enemy-0", "enemy", 520, 500);
    defender.stats.defense = 0;
    defender.hp = 1;
    resolveRawNormalContactAttack(attacker, defender, 3_000, () => 1);
    expect(defender.hp).toBe(0);
    expect(defender.isDead).toBe(false);

    updateReactions([attacker, defender], [], 3_000 + swfLogicTicksToMs(9), swfLogicTicksToMs(9));
    expect(defender.isDead).toBe(false);
    updateReactions([attacker, defender], [], 3_000 + swfLogicTicksToMs(10), swfLogicTicksToMs(1));
    expect(defender.isDead).toBe(true);
    expect(defender.battleOutState).toBe("EXITING");
  });
});
