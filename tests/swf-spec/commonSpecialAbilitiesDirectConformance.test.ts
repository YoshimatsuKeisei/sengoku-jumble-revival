import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldSwfPointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { isBaseHitBlockedByFortify, resolveBaseMovementContacts } from "../../src/game/systems/baseContactSystem";
import { beginTechniqueAction } from "../../src/game/systems/combatGaugeSystem";
import { isDamageGuarded } from "../../src/game/systems/defenseSystem";
import { clearReaction, startHitReaction } from "../../src/game/systems/reactionSystem";
import {
  SWF_TREATMENT_FORWARD_TOLERANCE_UNITS,
  TREATMENT_RECOVERY_LOCK_TICKS,
  findNearestTreatmentHealer,
  isSwfTreatmentDirectionEligible,
  startEmergencyRetreat,
  updateEmergencyRetreat,
} from "../../src/game/systems/recoverySystem";
import {
  applyFieldHospitalArrival,
  applySupportHealingPulse,
  calculateRetreatMoveSpeed,
  calculateSuccessfulAttackDamage,
  handleRetreatStateEntered,
  rosterSlotDrawHasAbility,
} from "../../src/game/systems/specialAbilitySystem";
import { swfLogicTicksToMs } from "../../src/game/systems/techniqueCombatProfiles";
import abilitySpec from "../../swf-spec/rules/abilities.json";

function unit(id: string, team: "player" | "enemy" = "player", x = 500, y = 450): Soldier {
  return createSoldier(id, team, "ai", x, y);
}

function sourceUnit(id: string, team: "player" | "enemy", x: number, y = 500): Soldier {
  const point = battlefieldSourcePointToWorld({ x, y });
  return unit(id, team, point.x, point.y);
}

function roster(team: "player" | "enemy"): Soldier[] {
  return Array.from({ length: 30 }, (_, index) => unit(`${team}-${index}`, team));
}

function rule(id: string) {
  return abilitySpec.rules.find((candidate) => candidate.id === id);
}

describe("SWF conformance: common special abilities s7..s22", () => {
  it("records all sixteen common SWF ability codes", () => {
    const mapping = rule("COMMON_SPECIAL_ABILITY_CODE_MAP")?.expected as Record<string, string> | undefined;
    expect(mapping).toBeDefined();
    expect(Object.keys(mapping!)).toHaveLength(16);
    expect(mapping).toMatchObject({
      s7: "RUSH", s8: "SIEGE", s9: "FINISHER", s10: "MIGHT", s11: "IRON_WALL", s12: "HORO",
      s13: "RALLY_SPIRIT", s14: "TREATMENT", s15: "INSPIRE", s16: "FIELD_HOSPITAL", s17: "TRAP",
      s18: "FORTIFY", s19: "FORESIGHT", s20: "RECOVERY_BOOST", s21: "DOUBLE_SPECIAL", s22: "FLEET_FOOT",
    });
  });

  it("keeps a machine-readable direct-audit row with every required field for all sixteen abilities", () => {
    const matrix = rule("COMMON_SPECIAL_ABILITY_DIRECT_AUDIT_MATRIX")?.expected as Record<string, Record<string, unknown>> | undefined;
    expect(matrix).toBeDefined();
    expect(Object.keys(matrix!)).toEqual([
      "s7", "s8", "s9", "s10", "s11", "s12", "s13", "s14",
      "s15", "s16", "s17", "s18", "s19", "s20", "s21", "s22",
    ]);
    for (const row of Object.values(matrix!)) {
      for (const key of [
        "label", "tsId", "trigger", "probability", "target", "effect", "effectOrder",
        "lockCooldown", "merit", "interactions", "playerEnemyDifference", "implementation", "testId", "evidenceGrade",
      ]) expect(row).toHaveProperty(key);
      expect(row.evidenceGrade).toBe("confirmed");
    }
  });

  it("uses the raw s7 RUSH random*100 <= 70 keep-target boundary and never suppresses normal contact retarget", () => {
    const target = unit("rush"); const attacker = unit("attacker", "enemy");
    target.strategy = "charge"; target.specialAbilities = ["RUSH"];
    startHitReaction(target, attacker, 0, 0, () => 0.7, "GUN_ATTACK");
    expect(target.targetId).toBeNull();
    clearReaction(target);
    startHitReaction(target, attacker, 1, 0, () => 0.700001, "GUN_ATTACK");
    expect(target.targetId).toBe(attacker.id);
    target.targetId = null; clearReaction(target);
    startHitReaction(target, attacker, 2, 0, () => 0, "NORMAL_ATTACK");
    expect(target.targetId).toBe(attacker.id);
  });

  it("orders successful-hit damage as basic -> s10 MIGHT -> s9 FINISHER threshold -> NINJA_HUNTER", () => {
    const attacker = unit("attacker"); const target = unit("target", "enemy");
    target.unitType = "NINJA";
    attacker.specialAbilities = ["FINISHER"];
    attacker.rareSpecialAbilities = ["NINJA_HUNTER"];
    target.hp = 7;
    expect(calculateSuccessfulAttackDamage(attacker, target)).toBe(2);
    target.hp = 6;
    expect(calculateSuccessfulAttackDamage(attacker, target)).toBe(3);
    attacker.specialAbilities = ["MIGHT", "FINISHER"];
    target.hp = 7;
    expect(calculateSuccessfulAttackDamage(attacker, target)).toBe(4);
  });

  it("consumes defense RNG before s12 HORO, keeps >30 strict, and lets s19 FORESIGHT make ss=1 guard-capable", () => {
    const defender = unit("defender", "enemy"); defender.stats.defense = 100; defender.specialAbilities = ["HORO"];
    let calls = 0; const guarded = [0.6, 0.300001];
    expect(isDamageGuarded(defender, "NORMAL_ATTACK", () => guarded[calls++] ?? 0)).toBe(true);
    expect(calls).toBe(2);

    calls = 0; const exactBoundary = [0.6, 0.3];
    expect(isDamageGuarded(defender, "NORMAL_ATTACK", () => exactBoundary[calls++] ?? 0)).toBe(false);
    expect(calls).toBe(2);

    defender.specialAbilities = ["FORESIGHT", "HORO"];
    calls = 0; const special = [0.6, 0.31];
    expect(isDamageGuarded(defender, "SPECIAL_ATTACK", () => special[calls++] ?? 0)).toBe(true);
    expect(calls).toBe(2);

    defender.specialAbilities = ["HORO"];
    calls = 0;
    expect(isDamageGuarded(defender, "SPECIAL_ATTACK", () => { calls += 1; return calls === 1 ? 0.6 : 0.31; })).toBe(false);
    expect(calls).toBe(2);
  });

  it("forces the raw teppou(ch6) -> ninja(ch7) hit after one defense draw and skips HORO's second draw", () => {
    const defender = unit("ninja", "enemy"); defender.unitType = "NINJA"; defender.specialAbilities = ["HORO", "FORESIGHT"];
    const gunner = unit("gunner"); gunner.unitType = "TEPPOU";
    let calls = 0;
    expect(isDamageGuarded(defender, "GUN_ATTACK", () => { calls += 1; return 0; }, gunner)).toBe(false);
    expect(calls).toBe(1);
  });

  it("keeps sz support recovery source-excluded, p<89-only, and awards one merit for a two-HP s20 pulse", () => {
    const source = unit("source"); source.hp -= 5;
    const normal = unit("normal", "player", 510, 450); normal.hp -= 5; normal.specialAbilities = ["RECOVERY_BOOST"];
    const retreating = unit("retreating", "player", 515, 450); retreating.hp -= 5; retreating.state = "EMERGENCY_RETREAT";
    const healing = unit("healing", "player", 520, 450); healing.hp -= 5; healing.state = "HEALING";

    expect(applySupportHealingPulse(source, [source, normal, retreating, healing])).toEqual([normal.id]);
    expect(source.hp).toBe(source.maxHp - 5);
    expect(normal.hp).toBe(normal.maxHp - 3);
    expect(retreating.hp).toBe(retreating.maxHp - 5);
    expect(healing.hp).toBe(healing.maxHp - 5);
    expect(source.merits.recovery).toBe(1);
  });

  it("lets s13/s15 holders with raw p<89 equivalents fire even while their normal combat action/reaction is busy", () => {
    const retreater = unit("retreater"); retreater.state = "EMERGENCY_RETREAT";
    const rally = unit("rally"); rally.specialAbilities = ["RALLY_SPIRIT"]; rally.reactionState = "HIT_STUN";
    rally.combatActionState = "ATTACK_RECOVERY"; rally.hp -= 3;
    const ally = unit("ally", "player", 510, 450); ally.hp -= 3;
    const inspire = unit("inspire", "enemy", 510, 450); inspire.specialAbilities = ["INSPIRE"];
    inspire.combatActionState = "ATTACK_WINDUP";
    const enemyAlly = unit("enemy-ally", "enemy", 515, 450); enemyAlly.hp -= 3;

    const events = handleRetreatStateEntered(retreater, [retreater, rally, ally, inspire, enemyAlly], 100);
    expect(events.map((event) => event.ability)).toEqual(["RALLY_SPIRIT", "INSPIRE"]);
    expect(rally.hp).toBe(rally.maxHp - 3);
    expect(ally.hp).toBe(ally.maxHp - 2);
    expect(enemyAlly.hp).toBe(enemyAlly.maxHp - 2);
    expect(rally.abilityActionLockUntil).toBe(100 + swfLogicTicksToMs(16));
    expect(inspire.abilityActionLockUntil).toBe(100 + swfLogicTicksToMs(16));
  });

  it("consumes all three s16 roster draws and credits the last matching FIELD_HOSPITAL holder", () => {
    const soldiers = roster("player");
    soldiers[0].specialAbilities = ["FIELD_HOSPITAL"];
    soldiers[1].specialAbilities = ["FIELD_HOSPITAL"];
    const patient = unit("patient"); patient.hp = patient.maxHp - 40;
    const sequence = [0, 0.04, 0.99]; let calls = 0;

    expect(applyFieldHospitalArrival(patient, soldiers, () => sequence[calls++] ?? 0.99)).toBe(30);
    expect(calls).toBe(3);
    expect(soldiers[0].merits.recovery).toBe(0);
    expect(soldiers[1].merits.recovery).toBe(30);
  });

  it("consumes both s17 roster draws even when the first TRAP draw already matches", () => {
    const soldiers = roster("enemy"); soldiers[0].specialAbilities = ["TRAP"];
    let calls = 0;
    const sequence = [0, 0.99];
    expect(rosterSlotDrawHasAbility(soldiers, "enemy", "TRAP", 2, () => sequence[calls++] ?? 0.99)).toBe(true);
    expect(calls).toBe(2);
  });

  it("uses strict >50 and consumes both s18 FORTIFY attempts with chance RNG short-circuited on non-holder slots", () => {
    const attacker = unit("attacker");
    const defenders = roster("enemy"); defenders[0].specialAbilities = ["FORTIFY"];
    let calls = 0;
    const mixedBoundary = [0, 0.5, 0, 0.500001];
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => mixedBoundary[calls++] ?? 0)).toBe(true);
    expect(calls).toBe(4);

    calls = 0;
    const exactBoundary = [0, 0.5, 0, 0.5];
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => exactBoundary[calls++] ?? 0)).toBe(false);
    expect(calls).toBe(4);

    calls = 0;
    const shortCircuit = [0.99, 0, 0.51];
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => shortCircuit[calls++] ?? 0)).toBe(true);
    expect(calls).toBe(3);
  });

  it("credits s8 SIEGE rsj by two even when the finishing base had only one HP, with no invented capture bonus", () => {
    const bases = createBattleBases();
    const enemyBase = bases.find((candidate) => candidate.team === "enemy")!;
    enemyBase.hp = 1;
    const previous = battlefieldSwfPointToWorld({ x: 44 * 36, y: 16 * 36 });
    const current = battlefieldSwfPointToWorld({ x: 45 * 36, y: 16 * 36 });
    const attacker = unit("siege", "player", current.x, current.y); attacker.specialAbilities = ["SIEGE"];
    const positions = new Map([[attacker.id, previous]]);

    expect(resolveBaseMovementContacts([attacker], bases, positions, 0, () => 0.99)).toBe("enemy");
    expect(enemyBase.hp).toBe(0);
    expect(attacker.merits.baseDamage).toBe(2);
  });

  it("applies the strict mirrored ±30 source-X gate before choosing the nearest s14 TREATMENT holder", () => {
    const player = sourceUnit("player-patient", "player", 500);
    const atBoundary = sourceUnit("player-boundary", "player", 530); atBoundary.specialAbilities = ["TREATMENT"];
    const justInside = sourceUnit("player-inside", "player", 529.9); justInside.specialAbilities = ["TREATMENT"];
    justInside.reactionState = "HIT_STUN";
    expect(SWF_TREATMENT_FORWARD_TOLERANCE_UNITS).toBe(30);
    expect(isSwfTreatmentDirectionEligible(player, atBoundary)).toBe(false);
    expect(isSwfTreatmentDirectionEligible(player, justInside)).toBe(true);
    expect(findNearestTreatmentHealer(player, [player, atBoundary, justInside])).toBe(justInside);

    const enemy = sourceUnit("enemy-patient", "enemy", 1000);
    const enemyBoundary = sourceUnit("enemy-boundary", "enemy", 970); enemyBoundary.specialAbilities = ["TREATMENT"];
    const enemyInside = sourceUnit("enemy-inside", "enemy", 970.1); enemyInside.specialAbilities = ["TREATMENT"];
    expect(isSwfTreatmentDirectionEligible(enemy, enemyBoundary)).toBe(false);
    expect(isSwfTreatmentDirectionEligible(enemy, enemyInside)).toBe(true);
  });

  it("leaves tat treatment with the direct k=12-equivalent lock", () => {
    const patient = sourceUnit("patient", "player", 500); patient.maxHp = 100; patient.hp = 10;
    const healer = sourceUnit("healer", "player", 490); healer.specialAbilities = ["TREATMENT"];
    const soldiers = [patient, healer];
    startEmergencyRetreat(patient, createBattleBases(), soldiers, 0);
    patient.x = healer.x; patient.y = healer.y;
    updateEmergencyRetreat(patient, createBattleBases(), () => 0.99, soldiers, 1_000);

    expect(patient.state).toBe("NORMAL");
    expect(TREATMENT_RECOVERY_LOCK_TICKS).toBe(12);
    expect(patient.abilityActionLockUntil).toBe(1_000 + swfLogicTicksToMs(12));
  });

  it("keeps the inclusive s21 40% boundary for player DOUBLE_SPECIAL retention", () => {
    const player = createSoldier("player", "player", "player", 500, 450);
    player.specialAbilities = ["DOUBLE_SPECIAL"];
    player.playerTechniqueGauge = 100;
    expect(beginTechniqueAction(player, 0, () => 0.4, true)).toBe(true);
    expect(player.playerTechniqueGauge).toBe(100);
  });

  it("applies s22 FLEET_FOOT as +2 foot capped at 8 during retreat", () => {
    const runner = unit("runner"); runner.specialAbilities = ["FLEET_FOOT"];
    runner.stats.foot = 7;
    expect(calculateRetreatMoveSpeed(70, runner)).toBe(80);
    runner.stats.foot = 3;
    expect(calculateRetreatMoveSpeed(30, runner)).toBe(50);
  });
});
