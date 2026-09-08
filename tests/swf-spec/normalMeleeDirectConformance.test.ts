import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import { applyDamage } from "../../src/game/systems/combatSystem";
import { moveAiSoldiers } from "../../src/game/systems/movementSystem";
import {
  getCombatWinProbability,
  updateNormalCombatContests,
} from "../../src/game/systems/normalCombatSystem";
import {
  startEmergencyRetreat,
  updateEmergencyRetreat,
} from "../../src/game/systems/recoverySystem";
import {
  startHitReaction,
  SWF_HIT_REACTION_MS,
  updateReactions,
} from "../../src/game/systems/reactionSystem";
import combatSpec from "../../swf-spec/rules/combat.json";

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

describe("direct raw-SWF normal melee conformance", () => {
  it("records the confirmed contact, pursuit, and release rules", () => {
    const contact = combatSpec.rules.find((rule) => rule.id === "NORMAL_CONTACT_CONTEST");
    expect(contact?.status).toBe("confirmed");
    expect(contact?.expected).toMatchObject({
      atckMode: 0,
      combatWeightExpression: "pow(rawCombat, 3)",
      targetReferenceVariable: "l",
      engagementStateExpression: "pp + 20",
    });
    const pursuit = combatSpec.rules.find((rule) => rule.id === "NORMAL_PURSUIT_LIFECYCLE");
    expect(pursuit?.expected).toMatchObject({
      dynamicTargetCoordinates: true,
      standaloneMaximumChaseDistance: null,
      closeAxisThresholdExclusive: 20,
      closeSpacingSourceUnits: 24,
      deathReleaseFunction: "led",
      retreatReleaseStates: [93, 94],
    });
  });

  it("uses raw pw=pow(combat,3) weighting rather than a linear combat ratio", () => {
    expect(getCombatWinProbability(75, 25)).toBeCloseTo(27 / 28);
    expect(getCombatWinProbability(25, 75)).toBeCloseTo(1 / 28);
    expect(getCombatWinProbability(0, 0)).toBe(0.5);
  });

  it("normal contact overwrites ordinary units' l-equivalent targets independently on both sides", () => {
    const first = unit("first", "player", 500, 500);
    const second = unit("second", "enemy", 510, 500);
    const firstPrior = unit("first-prior", "enemy", 1400, 400);
    const secondPrior = unit("second-prior", "player", 200, 400);
    first.targetId = firstPrior.id;
    second.targetId = secondPrior.id;

    updateNormalCombatContests([first, second, firstPrior, secondPrior], 0, () => 0);

    expect(first.targetId).toBe(second.id);
    expect(second.targetId).toBe(first.id);
    expect(first.combatActionState).toBe("ATTACK_WINDUP");
    expect(second.combatActionState).toBe("IDLE");
  });

  it("keeps normal-contact retaliation asymmetric for a RUSH charge attacker on the raw <=70 branch", () => {
    const rush = unit("rush", "player", 500, 500, "charge");
    const defender = unit("defender", "enemy", 510, 500);
    const prior = unit("prior", "enemy", 1400, 500);
    rush.specialAbilities = ["RUSH"];
    rush.stats.combat = 100;
    defender.stats.combat = 0;
    rush.targetId = prior.id;

    // First sample chooses the contact attacker. The second is the attacker's
    // s7/RUSH retarget roll; exactly 0.70 stays on the keep-prior-target branch.
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

  it("applies the raw strict <20 overlap correction to an exact 24-source-unit separation", () => {
    const first = unit("first", "player", 500, 500);
    const second = unit("second", "enemy", 518, 500);
    updateNormalCombatContests([first, second], 0, () => 0);
    const firstSource = battlefieldWorldPointToSource(first);
    const secondSource = battlefieldWorldPointToSource(second);
    expect(firstSource.x).toBeCloseTo(494);
    expect(firstSource.y).toBeCloseTo(500);
    expect(Math.hypot(firstSource.x - secondSource.x, firstSource.y - secondSource.y)).toBeCloseTo(24);
  });

  it("pursues the target's live coordinates without an independent maximum chase distance", () => {
    const pursuer = unit("pursuer", "player", 500, 500);
    const target = unit("target", "enemy", 1100, 700);
    pursuer.targetId = target.id;
    const before = Math.hypot(target.x - pursuer.x, target.y - pursuer.y);
    moveAiSoldiers([pursuer, target], 0.1, [], 0);
    const after = Math.hypot(target.x - pursuer.x, target.y - pursuer.y);
    expect(after).toBeLessThan(before);
    expect(pursuer.targetId).toBe(target.id);

    const movedTarget = battlefieldSourcePointToWorld({ x: 1500, y: 850 });
    target.x = movedTarget.x;
    target.y = movedTarget.y;
    moveAiSoldiers([pursuer, target], 0.1, [], 100);
    expect(pursuer.targetId).toBe(target.id);
    expect(pursuer.velocityX).toBeGreaterThan(0);
    expect(pursuer.velocityY).toBeGreaterThan(0);
  });

  it("finishes fatal k=10 reaction before death and runs led-equivalent pursuer release immediately", () => {
    const attacker = unit("attacker", "player", 500, 500);
    const victim = unit("victim", "enemy", 510, 500);
    const pursuer = unit("pursuer", "player", 700, 500);
    pursuer.targetId = victim.id;
    victim.hp = 1;
    applyDamage(victim, 1);
    startHitReaction(victim, attacker, 0, 0, () => 0, "NORMAL_ATTACK");

    updateReactions([attacker, victim, pursuer], [], SWF_HIT_REACTION_MS - 1, SWF_HIT_REACTION_MS - 1);
    expect(victim.isDead).toBe(false);
    expect(pursuer.targetId).toBe(victim.id);

    updateReactions([attacker, victim, pursuer], [], SWF_HIT_REACTION_MS, 1);
    expect(victim.isDead).toBe(true);
    expect(victim.battleOutState).toBe("EXITING");
    expect(pursuer.targetId).toBeNull();
  });

  it("keeps pursuit during retreat but releases it at the raw p93/p94 entry-commit transition", () => {
    const retreater = unit("retreater", "player", 300, 500);
    const pursuer = unit("pursuer", "enemy", 340, 500);
    pursuer.targetId = retreater.id;
    retreater.treatmentUsedSinceLastBaseVisit = true;
    startEmergencyRetreat(retreater, undefined, [retreater, pursuer], 0);
    expect(retreater.state).toBe("EMERGENCY_RETREAT");
    expect(pursuer.targetId).toBe(retreater.id);

    const committed = battlefieldSourcePointToWorld({ x: 220, y: 500 });
    retreater.x = committed.x;
    retreater.y = committed.y;
    updateEmergencyRetreat(retreater, undefined, () => 0, [retreater, pursuer], 1);
    expect(pursuer.targetId).toBeNull();
  });
});
