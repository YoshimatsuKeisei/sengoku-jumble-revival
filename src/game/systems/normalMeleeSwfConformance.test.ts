import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { applyDamage } from "./combatSystem";
import { getCombatWinProbability, updateNormalCombatContests } from "./normalCombatSystem";
import { startHitReaction, SWF_HIT_REACTION_MS, updateReactions } from "./reactionSystem";
import { createBattleBases, getBaseForTeam } from "./baseSystem";
import { getBaseGatePoint } from "./battlefieldGeometry";
import { startEmergencyRetreat, updateEmergencyRetreat } from "./recoverySystem";

function unit(
  id: string,
  team: "player" | "enemy",
  sourceX: number,
  sourceY: number,
  strategy: "charge" | "defend" | "intercept" | "melee" | "wait" = "melee",
) {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", point.x, point.y, strategy);
}

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

describe("current branch raw-SWF normal melee conformance", () => {
  it("uses cubic raw-combat weighting for the contact attack side", () => {
    expect(getCombatWinProbability(75, 25)).toBeCloseTo(27 / 28);
    expect(getCombatWinProbability(25, 75)).toBeCloseTo(1 / 28);
    expect(getCombatWinProbability(0, 0)).toBe(0.5);
  });

  it("normal contact independently replaces ordinary units' l-equivalent targets", () => {
    const first = unit("first", "player", 500, 500);
    const second = unit("second", "enemy", 510, 500);
    const firstPrior = unit("first-prior", "enemy", 1400, 400);
    const secondPrior = unit("second-prior", "player", 200, 400);
    first.targetId = firstPrior.id;
    second.targetId = secondPrior.id;

    updateNormalCombatContests([first, second, firstPrior, secondPrior], 0, () => 0);

    expect(first.targetId).toBe(second.id);
    expect(second.targetId).toBe(first.id);
  });

  it("keeps the attack-side RUSH target on the raw <=70 branch", () => {
    const rush = unit("rush", "player", 500, 500, "charge");
    const defender = unit("defender", "enemy", 510, 500);
    const prior = unit("prior", "enemy", 1400, 500);
    rush.specialAbilities = ["RUSH"];
    rush.stats.combat = 100;
    defender.stats.combat = 0;
    rush.targetId = prior.id;

    updateNormalCombatContests([rush, defender, prior], 0, sequence(0, 0.70));
    expect(defender.targetId).toBe(rush.id);
    expect(rush.targetId).toBe(prior.id);

    const rush2 = unit("rush2", "player", 500, 600, "charge");
    const defender2 = unit("defender2", "enemy", 510, 600);
    const prior2 = unit("prior2", "enemy", 1400, 600);
    rush2.specialAbilities = ["RUSH"];
    rush2.stats.combat = 100;
    defender2.stats.combat = 0;
    rush2.targetId = prior2.id;
    updateNormalCombatContests([rush2, defender2, prior2], 0, sequence(0, 0.700001));
    expect(defender2.targetId).toBe(rush2.id);
    expect(rush2.targetId).toBe(defender2.id);
  });

  it("applies strict <20 source-axis overlap correction to a 24-unit separation", () => {
    const first = unit("first", "player", 500, 500);
    const second = unit("second", "enemy", 518, 500);
    updateNormalCombatContests([first, second], 0, () => 0);
    const firstSource = battlefieldWorldPointToSource(first);
    const secondSource = battlefieldWorldPointToSource(second);
    expect(firstSource.x).toBeCloseTo(494);
    expect(firstSource.y).toBeCloseTo(500);
    expect(Math.hypot(firstSource.x - secondSource.x, firstSource.y - secondSource.y)).toBeCloseTo(24);
  });

  it("keeps pursuers through fatal k reaction, then releases them with death finalization", () => {
    const pursuer = unit("pursuer", "player", 500, 500);
    const target = unit("target", "enemy", 510, 500);
    target.hp = 10;
    pursuer.targetId = target.id;

    startHitReaction(target, pursuer, 0);
    applyDamage(target, 10, pursuer);
    expect(target.hp).toBe(0);
    expect(target.isDead).toBe(false);
    expect(pursuer.targetId).toBe(target.id);

    updateReactions([pursuer, target], [], SWF_HIT_REACTION_MS, SWF_HIT_REACTION_MS);
    expect(target.isDead).toBe(true);
    expect(pursuer.targetId).toBeNull();
  });

  it("keeps retreat chase during the outer leg and releases at base-entry commit", () => {
    const bases = createBattleBases();
    const retreater = unit("retreater", "player", 600, 500);
    const pursuer = unit("pursuer", "enemy", 650, 500);
    pursuer.targetId = retreater.id;
    const soldiers = [retreater, pursuer];

    startEmergencyRetreat(retreater, bases, soldiers, 0);
    expect(pursuer.targetId).toBe(retreater.id);

    const base = getBaseForTeam(bases, "player");
    const gate = retreater.recoveryGate!;
    Object.assign(retreater, getBaseGatePoint(base, gate, false));
    updateEmergencyRetreat(retreater, bases, () => 0, soldiers, 1);

    expect(retreater.state).toBe("EMERGENCY_RETREAT");
    expect(pursuer.targetId).toBeNull();
  });
});
