import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import {
  getCombatWinProbability,
  updateNormalCombatContests,
} from "../../src/game/systems/normalCombatSystem";
import { resolveSequentialSwfSoldierContacts } from "../../src/game/systems/swfSoldierContactSystem";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 500): Soldier {
  const point = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", point.x, point.y, "melee");
}

function sourcePoint(sourceX: number, sourceY = 500): { x: number; y: number } {
  return battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
}

function selectedPairFixture(): {
  current: Soldier;
  candidate: Soldier;
  soldiers: Soldier[];
  movementStart: Map<string, { x: number; y: number }>;
} {
  const candidate = unit("candidate", "enemy", 498);
  const current = unit("current", "player", 490);
  const soldiers = [candidate, current];
  const movementStart = new Map<string, { x: number; y: number }>([
    [candidate.id, sourcePoint(498)],
    [current.id, sourcePoint(470)],
  ]);
  return { current, candidate, soldiers, movementStart };
}

describe("selected raw contact -> attacker contest bridge", () => {
  it("records the one-candidate raw contest scope and cubic combat weighting", () => {
    const contact = combatSpec.rules.find((rule) => rule.id === "NORMAL_CONTACT_CONTEST");
    expect(contact?.status).toBe("confirmed");
    expect(contact?.expected).toMatchObject({
      dynamicCandidateCountPerCurrentUpdate: 1,
      contestScope: "selectedDynamicCandidateOnly",
      combatWeightExpression: "pow(rawCombat, 3)",
      attackSideProbabilityExpression: "pwA / (pwA + pwB)",
      selectedPairAttackerCount: 1,
      selectedAttackBranchSkipsPhysicalContactBranch: true,
    });
    expect(getCombatWinProbability(75, 25)).toBeCloseTo(27 / 28);
    expect(getCombatWinProbability(25, 75)).toBeCloseTo(1 / 28);
    expect(getCombatWinProbability(0, 0)).toBe(0.5);
  });

  it("starts the selected current soldier during contact replay and does not arm k=3", () => {
    const { current, candidate, soldiers, movementStart } = selectedPairFixture();
    current.stats.combat = 75;
    candidate.stats.combat = 25;

    const contact = resolveSequentialSwfSoldierContacts(soldiers, movementStart, 1_000, () => 0.95);
    updateNormalCombatContests(soldiers, 1_000, () => 0);

    expect(contact.impulsesArmed).toBe(0);
    expect(current.combatActionState).toBe("ATTACK_WINDUP");
    expect(current.attackTargetId).toBe(candidate.id);
    expect(candidate.combatActionState).toBe("IDLE");
  });

  it("lets the selected candidate win without re-entering the physical branch", () => {
    const { current, candidate, soldiers, movementStart } = selectedPairFixture();
    current.stats.combat = 75;
    candidate.stats.combat = 25;

    const contact = resolveSequentialSwfSoldierContacts(soldiers, movementStart, 1_000, () => 0.99);
    updateNormalCombatContests(soldiers, 1_000, () => 0);

    expect(contact.impulsesArmed).toBe(0);
    expect(candidate.combatActionState).toBe("ATTACK_WINDUP");
    expect(candidate.attackTargetId).toBe(current.id);
    expect(current.combatActionState).toBe("IDLE");
  });

  it("keeps k=3 and the legacy combat fallback when the selected branch cannot safely start", () => {
    const { current, candidate, soldiers, movementStart } = selectedPairFixture();
    current.stats.combat = 0;
    candidate.stats.combat = 100;
    current.combatActionState = "ATTACK_RECOVERY";
    current.attackRecoveryEndsAt = 10_000;

    const contact = resolveSequentialSwfSoldierContacts(soldiers, movementStart, 1_000, () => 0);
    updateNormalCombatContests(soldiers, 1_000, () => 0);

    expect(contact.impulsesArmed).toBeGreaterThan(0);
    expect(candidate.combatActionState).toBe("ATTACK_WINDUP");
    expect(candidate.attackTargetId).toBe(current.id);
  });
});
