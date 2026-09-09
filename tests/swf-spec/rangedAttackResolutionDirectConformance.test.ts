import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier, UnitTechnique } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { executeArrowAttack, findArrowTarget, updateArrowProjectile } from "../../src/game/systems/arrowAttackSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "../../src/game/systems/combatGaugeSystem";
import { executeGunAttack } from "../../src/game/systems/gunAttackSystem";
import { updateReactions } from "../../src/game/systems/reactionSystem";
import { updateSpecialAttacks } from "../../src/game/systems/specialAttackSystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import combatSpec from "../../swf-spec/rules/combat.json";

function unit(id: string, team: "player" | "enemy", sourceX: number, sourceY = 500): Soldier {
  const world = battlefieldSourcePointToWorld({ x: sourceX, y: sourceY });
  return createSoldier(id, team, "ai", world.x, world.y);
}

function ranged(id: string, technique: UnitTechnique, sourceX = 500): Soldier {
  const soldier = unit(id, "player", sourceX);
  soldier.unitType = technique.startsWith("TEPPOU_") ? "TEPPOU" : "ARCHER";
  soldier.technique = technique;
  return soldier;
}

describe("direct raw-SWF ranged attack resolution", () => {
  it("records latch, synchronous resolution, pre-effect order, and ranged impulse rules", () => {
    expect(combatSpec.rules.find((rule) => rule.id === "RANGED_TARGET_LATCH_AND_SCAN")?.expected).toMatchObject({
      existingTargetRangeFailureFallsBackToAnotherEnemy: false,
      gaugeConsumedBeforeRangeFailure: true,
      unlatchedSearchUsesGridScan: true,
      unlatchedSearchUsesNearestSort: false,
      generalForcedSplRequiresExistingLatchedTarget: true,
      generalForcedSplMayInventTarget: false,
    });
    expect(combatSpec.rules.find((rule) => rule.id === "RANGED_SYNCHRONOUS_GAMEPLAY_RESOLUTION")?.expected).toMatchObject({
      gameplayResolvedInsideAtck: true,
      damageDeferredUntilProjectileArrival: false,
      projectileVisualMayHomeToFutureTargetCoordinates: false,
      defenderKLogicTicks: 10,
      defenderImpulseSourceUnits: 10,
      guardedRangedStillReceivesKAndImpulse: true,
      ironWallRangedGuardImpulseSourceUnits: 10,
      ironWallRangedGuardAttackerRecoilSourceUnits: 0,
    });
    expect(combatSpec.rules.find((rule) => rule.id === "RANGED_PRE_EFFECT_DAMAGE_ORDER")?.expected).toMatchObject({
      preEffectRunsBeforeDirectDefense: true,
      splashHasIndependentDefenseRoll: false,
      primaryKatonSuppressesWholeExplosionGrid: true,
      splashKatonCheckedIndividually: false,
    });
  });

  it("does not replace an out-of-range latched target with a closer enemy after gauge consumption", () => {
    const archer = ranged("archer", "ARCHER_ARROW");
    const far = unit("far", "enemy", 650);
    const near = unit("near", "enemy", 550);
    archer.targetId = far.id;
    archer.stats.skill = 100;
    archer.combatGauge = 200;
    archer.combatGaugeUpdatedAt = 1_000 - COMBAT_GAUGE_UPDATE_INTERVAL_MS;

    expect(findArrowTarget(archer, [archer, far, near])).toBeNull();
    const events = updateSpecialAttacks([archer, far, near], [], createBattleBases(), 1_000, false, () => 1);
    expect(events.some((event) => event.kind === "ARROW")).toBe(false);
    expect(archer.combatGauge).toBe(100);
  });

  it("uses the raw local grid scan only when l is absent, while forced spl may not invent one", () => {
    const archer = ranged("archer", "ARCHER_ARROW");
    const near = unit("near", "enemy", 550);
    const farther = unit("farther", "enemy", 570);
    archer.targetId = null;
    expect(findArrowTarget(archer, [archer, near, farther])?.id).toBe("near");
    expect(findArrowTarget(archer, [archer, near, farther], false)).toBeNull();
  });

  it("commits arrow damage at launch and keeps the visual projectile on the launch-time impact point", () => {
    const archer = ranged("archer", "ARCHER_ARROW");
    const target = unit("target", "enemy", 560);
    target.stats.defense = 0;
    const before = target.hp;
    const launch = executeArrowAttack(archer, target, 0, () => 1, false, [archer, target])!;
    const sampledImpact = { x: launch.projectile.impactX, y: launch.projectile.impactY };
    expect(target.hp).toBe(before - 1);

    Object.assign(target, battlefieldSourcePointToWorld({ x: 800, y: 700 }));
    const visual = updateArrowProjectile(launch.projectile, [archer, target], 100_000, 100_000, () => 0);
    expect(visual.active).toBe(false);
    expect(visual.impact).toMatchObject({ x: sampledImpact.x, y: sampledImpact.y, targetId: target.id });
    expect(target.hp).toBe(before - 1);
  });

  it("applies fire-arrow fire before a guarded direct arrow, while primary KATON removes only that pre-effect", () => {
    const fire = ranged("fire", "ARCHER_FIRE_ARROW");
    const target = unit("target", "enemy", 560);
    target.stats.defense = 200;
    const before = target.hp;
    const launch = executeArrowAttack(fire, target, 0, () => 0, false, [fire, target])!;
    expect(target.hp).toBe(before - 1);
    expect(target.combatFeedbackMarker).toBe("S");
    expect(launch.projectile.flameVictimIds).toEqual([target.id]);

    const katon = unit("katon", "enemy", 560, 600);
    katon.stats.defense = 200;
    katon.rareSpecialAbilities = ["KATON"];
    const beforeKaton = katon.hp;
    const fire2 = ranged("fire2", "ARCHER_FIRE_ARROW", 500);
    fire2.y = katon.y;
    const launch2 = executeArrowAttack(fire2, katon, 0, () => 0, false, [fire2, katon])!;
    expect(katon.hp).toBe(beforeKaton);
    expect(launch2.projectile.flameVictimIds).toEqual([]);
  });

  it("keeps horoku explosion damage when the direct arrow guards and ignores splash KATON", () => {
    const horoku = ranged("horoku", "ARCHER_HOROKU");
    const primary = unit("primary", "enemy", 560);
    const splashKaton = unit("splash-katon", "enemy", 610);
    primary.stats.defense = 200;
    splashKaton.rareSpecialAbilities = ["KATON"];
    const primaryBefore = primary.hp;
    const splashBefore = splashKaton.hp;

    const launch = executeArrowAttack(horoku, primary, 0, () => 0, false, [horoku, primary, splashKaton])!;
    expect(primary.hp).toBe(primaryBefore - 2);
    expect(primary.combatFeedbackMarker).toBe("S");
    expect(splashKaton.hp).toBe(splashBefore - 1);
    expect(launch.projectile.brownSmokeVictimIds).toEqual(expect.arrayContaining([primary.id, splashKaton.id]));
  });

  it("lets primary KATON suppress the entire horoku explosion grid but not the later direct hit", () => {
    const horoku = ranged("horoku", "ARCHER_HOROKU");
    const primary = unit("primary", "enemy", 560);
    const splash = unit("splash", "enemy", 610);
    primary.rareSpecialAbilities = ["KATON"];
    primary.stats.defense = 0;
    const primaryBefore = primary.hp;
    const splashBefore = splash.hp;

    const launch = executeArrowAttack(horoku, primary, 0, () => 1, false, [horoku, primary, splash])!;
    expect(primary.hp).toBe(primaryBefore - 1);
    expect(splash.hp).toBe(splashBefore);
    expect(launch.projectile.brownSmokeVictimIds).toEqual([]);
  });

  it("does not let a guarded bombardment cancel its pre-defense 3x3 explosion", () => {
    const gun = ranged("gun", "TEPPOU_BOMBARDMENT");
    const primary = unit("primary", "enemy", 560);
    const splash = unit("splash", "enemy", 610);
    primary.stats.defense = 200;
    const primaryBefore = primary.hp;
    const splashBefore = splash.hp;

    const event = executeGunAttack(gun, primary, 0, () => 0, false, [gun, primary, splash])!;
    expect(event.primaryDefended).toBe(true);
    expect(primary.hp).toBe(primaryBefore - 2);
    expect(splash.hp).toBe(splashBefore - 1);
    expect(event.bombardmentVictimIds).toEqual(expect.arrayContaining([primary.id, splash.id]));
  });

  it("gives a guarded ranged IRON_WALL target the full raw 10-unit impulse and no attacker recoil", () => {
    const gun = ranged("gun", "TEPPOU_SHOOTING");
    const target = unit("target", "enemy", 700);
    target.stats.defense = 200;
    target.specialAbilities = ["IRON_WALL"];
    const targetBefore = battlefieldWorldPointToSource(target);
    const gunBefore = battlefieldWorldPointToSource(gun);

    executeGunAttack(gun, target, 0, () => 0, false, [gun, target]);
    expect(target.reactionState).toBe("HIT_STUN");
    expect(target.abilityActionLockUntil).toBeGreaterThanOrEqual(swfLogicTicksToMs(10));
    updateReactions([gun, target], [], swfLogicTicksToMs(1), swfLogicTicksToMs(1));

    const targetAfter = battlefieldWorldPointToSource(target);
    const gunAfter = battlefieldWorldPointToSource(gun);
    expect(targetAfter.x - targetBefore.x).toBeCloseTo(-10, 6);
    expect(gunAfter.x).toBeCloseTo(gunBefore.x, 6);
  });
});
