import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld, battlefieldSwfPointToWorld } from "../../src/game/battlefieldLayout";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { createBattleBases } from "../../src/game/systems/baseSystem";
import { isBaseHitBlockedByFortify, resolveBaseMovementContacts } from "../../src/game/systems/baseContactSystem";
import { beginTechniqueAction } from "../../src/game/systems/combatGaugeSystem";
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

  it("uses strict >50 and consumes both s18 FORTIFY attempts", () => {
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
});
