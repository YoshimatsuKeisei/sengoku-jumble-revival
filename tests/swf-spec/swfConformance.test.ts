import { describe, expect, it } from "vitest";
import { BATTLE_OBSTACLES, SOLDIER_RADIUS } from "../../src/game/config";
import { battlefieldSourcePointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { captureSoldierPositions, resolveBaseMovementContacts } from "../../src/game/systems/baseContactSystem";
import { createBattleBases, getBaseForTeam } from "../../src/game/systems/baseSystem";
import { beginTechniqueAction, COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import { updateEnemyFenceTrapContacts } from "../../src/game/systems/trapAbilitySystem";
import movementSpec from "../../swf-spec/rules/movement.json";
import abilitySpec from "../../swf-spec/rules/abilities.json";
import baseSpec from "../../swf-spec/rules/bases.json";
import commandSpec from "../../swf-spec/rules/commands.json";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 450): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y);
}

function trapRoster(): Soldier[] {
  return Array.from({ length: 30 }, (_, index) => {
    const defender = unit(`enemy-${index}`, "enemy", 1200, 450 + index);
    if (index === 0) defender.specialAbilities = ["TRAP"];
    return defender;
  });
}

describe("SWF conformance: confirmed rules", () => {
  it("preserves the raw X=900 TRAP branch as evidence without recreating an invisible runtime trigger line", () => {
    const rule = movementSpec.rules[0];
    expect(rule.status).toBe("confirmed");
    expect(rule.expected.rawSwfSourceCenterX).toBe(900);
    expect(rule.expected.rawSwfComparisonSpace).toBe("swf-source");
    expect(rule.expected.rawSwfContainsOpposingHalfEligibilityBranch).toBe(true);
    expect(rule.expected.activePortTrigger).toBe("new-enemy-fixed-fence-contact");
    expect(rule.expected.activePortUsesHalfBoundaryAsCollisionOrTrigger).toBe(false);

    const defenders = trapRoster();
    const halfInvader = unit("half-invader", "player", 901);
    let halfDraws = 0;
    expect(updateEnemyFenceTrapContacts([halfInvader, ...defenders], BATTLE_OBSTACLES, 100, () => {
      halfDraws += 1;
      return 0;
    })).toEqual([]);
    expect(halfDraws).toBe(0);

    const fence = BATTLE_OBSTACLES.find((candidate) => candidate.id === "enemy-upper")!;
    const fenceInvader = createSoldier(
      "fence-invader",
      "player",
      "ai",
      fence.x - SOLDIER_RADIUS,
      fence.y + fence.height / 2,
    );
    expect(updateEnemyFenceTrapContacts([fenceInvader, ...defenders], BATTLE_OBSTACLES, 100, () => 0))
      .toEqual([fenceInvader.id]);
  });

  it("does not redraw TRAP while the confirmed trap state or same fence contact is active", () => {
    expect(abilitySpec.rules[0].status).toBe("confirmed");
    const defenders = trapRoster();
    const fence = BATTLE_OBSTACLES.find((candidate) => candidate.id === "enemy-upper")!;
    const contactX = fence.x - SOLDIER_RADIUS;
    const invader = createSoldier("invader", "player", "ai", contactX, fence.y + fence.height / 2);

    expect(updateEnemyFenceTrapContacts([invader, ...defenders], BATTLE_OBSTACLES, 100, () => 0))
      .toEqual([invader.id]);
    const hpAfterFirst = invader.hp;

    invader.x = contactX;
    expect(updateEnemyFenceTrapContacts([invader, ...defenders], BATTLE_OBSTACLES, 101, () => 0)).toEqual([]);
    expect(invader.hp).toBe(hpAfterFirst);

    invader.x = contactX;
    expect(updateEnemyFenceTrapContacts(
      [invader, ...defenders],
      BATTLE_OBSTACLES,
      invader.trapStateUntil + 1,
      () => 0,
    )).toEqual([]);
    expect(invader.hp).toBe(hpAfterFirst);
  });

  it("keeps ranged and non-ranged 連発 as separate confirmed scd retention rules", () => {
    const nonRanged = abilitySpec.rules.find((candidate) => candidate.id === "NON_RANGED_DOUBLE_SPECIAL_RETENTION");
    const ranged = abilitySpec.rules.find((candidate) => candidate.id === "RANGED_DOUBLE_SPECIAL_RETENTION");
    expect(nonRanged?.status).toBe("confirmed");
    expect(nonRanged?.expected.mustNotImplementImmediateRecursiveRepeat).toBe(true);
    expect(ranged?.status).toBe("confirmed");
    expect(ranged?.expected.globalMaximumTwoActivations).toBe(false);
  });

  it("holds a fresh ranged activation for the confirmed SWF k=10 lock", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "RANGED_ACTION_FRAME_LOCK");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.directionPoseCount).toBe(8);
    expect(rule?.expected.mustNotInterpretDirectionFramesAsSequentialCadence).toBe(true);
    expect(rule?.expected.actionLockVariable).toBe("k");
    expect(rule?.expected.actionLockLogicTicks).toBe(10);

    const archer = unit("cycle-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.targetId = enemy.id;
    archer.stats.skill = 100;
    archer.combatGauge = 200;
    archer.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;

    const first = updateSpecialAttacks([archer, enemy], [], createBattleBases(), 1_000, false, () => 1);
    expect(first.filter((event) => event.kind === "ARROW")).toHaveLength(1);
    expect(archer.specialLockUntil).toBe(1_000 + swfLogicTicksToMs(10));
    expect(beginTechniqueAction(archer, 1_000 + swfLogicTicksToMs(9), () => 1, false)).toBe(false);
    expect(beginTechniqueAction(archer, 1_000 + swfLogicTicksToMs(10), () => 1, false)).toBe(true);
  });

  it("puts a GENERAL_COMMAND-forced ranged activation into the same confirmed SWF k=10 lock", () => {
    const rule = combatSpec.rules.find((candidate) => candidate.id === "RANGED_ACTION_FRAME_LOCK");
    expect(rule?.status).toBe("confirmed");

    const generalA = unit("general-a", "player", 500);
    const generalB = unit("general-b", "player", 510);
    const archer = unit("forced-archer", "player", 520);
    const enemy = unit("enemy", "enemy", 600);
    generalA.unitType = generalB.unitType = "GENERAL";
    generalA.technique = generalB.technique = "GENERAL_COMMAND";
    generalA.combatGauge = generalB.combatGauge = 10_000;
    generalA.combatGaugeUpdatedAt = generalB.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;
    archer.unitType = "ARCHER";
    archer.technique = "ARCHER_ARROW";
    archer.targetId = enemy.id;
    archer.combatGauge = 0;
    archer.combatGaugeUpdatedAt = 1_000;

    const events = updateSpecialAttacks(
      [generalA, generalB, archer, enemy], [], createBattleBases(), 1_000, false, () => 1,
    );
    const arrows = events.filter((event) => event.kind === "ARROW" && event.projectile.shooterId === archer.id);
    expect(arrows).toHaveLength(1);
    expect(archer.specialLockUntil).toBe(1_000 + swfLogicTicksToMs(10));
    expect(archer.activeSpecialTechnique).toBe("ARCHER_ARROW");
  });

  it("uses the confirmed 36-unit SWF collision cells for base damage", () => {
    const contactRule = baseSpec.rules.find((candidate) => candidate.id === "BASE_CONTACT_BOUNCE_SEQUENCE");
    const surfaceRule = baseSpec.rules.find((candidate) => candidate.id === "BASE_ATTACK_SURFACE_VERTICAL_SPAN");
    const laneRule = baseSpec.rules.find((candidate) => candidate.id === "BASE_ATTACK_OFF_CENTER_LANES_EXIST");
    expect(contactRule?.status).toBe("confirmed");
    expect(contactRule?.expected.swfCollisionGridSize).toBe(36);
    expect(surfaceRule?.status).toBe("confirmed");
    expect(surfaceRule?.expected.enemyBaseDamageCells.yIndices).toEqual([15, 16, 17, 18]);
    expect(laneRule?.status).toBe("confirmed");
    expect(laneRule?.expected.offCenterFrontCollisionCellsDealBaseDamage).toBe(false);

    const bases = createBattleBases();
    const enemyBase = getBaseForTeam(bases, "enemy");
    const attacker = unit("swf-grid-base-attacker", "player", 1595, 540);
    const previous = captureSoldierPositions([attacker]);
    const enteredCell = battlefieldSourcePointToWorld({ x: 1605, y: 540 });
    attacker.x = enteredCell.x;
    attacker.y = enteredCell.y;

    const hpBefore = enemyBase.hp;
    resolveBaseMovementContacts([attacker], bases, previous, 1_000, () => 1);
    expect(enemyBase.hp).toBe(hpBefore - 1);
    expect(attacker.baseContactLockTicks).toBe(10);
  });

  it("records the confirmed SWF retreat entry-commit states instead of visual gate-span admission", () => {
    const rule = baseSpec.rules.find((candidate) => candidate.id === "FRIENDLY_BASE_RETREAT_GATE_CONGESTION");
    expect(rule?.status).toBe("confirmed");
    expect(rule?.expected.playerRecoveryTileCode).toBe(999);
    expect(rule?.expected.enemyRecoveryTileCode).toBe(998);
    expect(rule?.expected.playerEntryCommittedState).toBe(93);
    expect(rule?.expected.enemyEntryCommittedState).toBe(94);
    expect(rule?.expected.playerHealingState).toBe(97);
    expect(rule?.expected.enemyHealingState).toBe(98);
    expect(rule?.expected.visualGateRectsUsedForAdmission).toBe(false);
    expect(rule?.expected.selectedGateSpanRecheckedAfterEntryCommit).toBe(false);
    expect(rule?.expected.mustModelPreHealingEntryCommittedState).toBe(true);
  });
});

describe("SWF conformance: evidence status", () => {
  it("keeps the directly recovered command and ranged rules confirmed", () => {
    expect(commandSpec.rules.find((candidate) => candidate.id === "GENERAL_SAME_TICK_DEDUPE")?.status).toBe("confirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_ATTACK_CYCLE_SINGLE_LAUNCH")?.status).toBe("confirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_ACTION_FRAME_LOCK")?.status).toBe("confirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_GAUGE_BANKING_LIMIT")?.status).toBe("confirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_TARGET_LATCH_AND_SCAN")?.status).toBe("confirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_SYNCHRONOUS_GAMEPLAY_RESOLUTION")?.status).toBe("confirmed");
    expect(combatSpec.rules.find((candidate) => candidate.id === "RANGED_PRE_EFFECT_DAMAGE_ORDER")?.status).toBe("confirmed");
  });
});
