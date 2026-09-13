import { describe, expect, it } from "vitest";
import { battlefieldSwfPointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { updateNormalCombatContests } from "../../src/game/systems/normalCombatSystem";
import {
  calculateRawNormalContactDamage,
  isRawNormalContactGuarded,
  resolveRawNormalContactAttack,
} from "../../src/game/systems/normalContactAttackSystem";
import { resolveSequentialSwfSoldierContacts } from "../../src/game/systems/swfSoldierContactSystem";

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
});
