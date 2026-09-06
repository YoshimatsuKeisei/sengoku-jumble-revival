import { describe, expect, it } from "vitest";
import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import { createSoldier } from "../entities/Soldier";
import { REACTION_CONFIG } from "../config";
import type { Soldier, SoldierLoadout } from "../types";
import { updateMeleeAI } from "./aiSystem";
import { startSoldierAttack, updateAttackStates } from "./attackSystem";
import { createBattleBases } from "./baseSystem";
import { getBaseAttackBounceDistance } from "./baseAttackBounceSystem";
import { isBaseHitBlockedByFortify } from "./baseContactSystem";
import { isDamageGuarded } from "./defenseSystem";
import { applyRareDamageImmunity, totalDamageComponents } from "./damageComponentSystem";
import { clearReaction, startHitReaction } from "./reactionSystem";
import {
  calculateTreatmentHealAmount,
  findNearestTreatmentHealer,
  startEmergencyRetreat,
  updateEmergencyRetreat,
  updateHealing,
  updateRecoveryStates,
} from "./recoverySystem";
import {
  COMMON_SPECIAL_ABILITY_LABELS,
  applyFieldHospitalArrival,
  calculateBaseAttackDamage,
  calculateSuccessfulAttackDamage,
  handleRetreatStateEntered,
  rosterSlotDrawHasAbility,
} from "./specialAbilitySystem";
import { updateSpecialAttacks } from "./specialAttackSystem";
import { updateInvaderTrapMovement } from "./trapAbilitySystem";
import { normalizeRareSpecialAbilityId, validateSoldierLoadout } from "./unitLoadoutSystem";

function unit(id: string, team: "player" | "enemy" = "player", x = 500, y = 450): Soldier {
  return createSoldier(id, team, "ai", x, y);
}
function roster(team: "player" | "enemy", ability?: Soldier["specialAbilities"][number]): Soldier[] {
  return Array.from({ length: 30 }, (_, index) => {
    const soldier = unit(`${team}-${index}`, team);
    if (index === 0 && ability) soldier.specialAbilities = [ability];
    return soldier;
  });
}

describe("SWF special ability hooks", () => {
  it("RUSH ignores eligible non-contact retargeting on the 70% branch, never normal contact", () => {
    const target = unit("rush"); const attacker = unit("attacker", "enemy");
    target.strategy = "charge"; target.specialAbilities = ["RUSH"];
    startHitReaction(target, attacker, 0, 0, () => 0.69, "GUN_ATTACK");
    expect(target.targetId).toBeNull();
    clearReaction(target);
    startHitReaction(target, attacker, 1, 0, () => 0, "NORMAL_ATTACK");
    expect(target.targetId).toBe(attacker.id);
  });

  it("orders FORTIFY before normal/SIEGE base damage and keeps ninja bypass", () => {
    const attacker = unit("attacker"); const defenders = roster("enemy", "FORTIFY");
    expect(calculateBaseAttackDamage(attacker)).toBe(1);
    attacker.specialAbilities = ["SIEGE"];
    expect(calculateBaseAttackDamage(attacker)).toBe(2);
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => 0)).toBe(true);
    attacker.unitType = "NINJA";
    expect(isBaseHitBlockedByFortify(attacker, defenders, () => 0)).toBe(false);
    defenders[0].isDead = true;
    expect(getBaseAttackBounceDistance(defenders)).toBeGreaterThan(getBaseAttackBounceDistance([]));
  });

  it("applies 将力, 忍狩, then 討取 after the prior components", () => {
    const attacker = unit("attacker"); const target = unit("target", "enemy");
    attacker.specialAbilities = ["FINISHER"];
    target.hp = 6;
    expect(calculateSuccessfulAttackDamage(attacker, target)).toBe(2);
    attacker.specialAbilities = ["MIGHT", "FINISHER"];
    expect(calculateSuccessfulAttackDamage(attacker, target)).toBe(3);
    attacker.rareSpecialAbilities = ["NINJA_HUNTER"];
    target.unitType = "NINJA";
    expect(calculateSuccessfulAttackDamage(attacker, target)).toBe(4);
    expect(COMMON_SPECIAL_ABILITY_LABELS.MIGHT).toBe("将力");
  });

  it("keeps IRON_WALL out of guard chance and applies FORESIGHT before HORO", () => {
    const defender = unit("defender"); defender.stats.defense = 100;
    defender.specialAbilities = ["IRON_WALL"];
    expect(isDamageGuarded(defender, "NORMAL_ATTACK", () => 0.51)).toBe(false);
    defender.specialAbilities = ["HORO"];
    expect(isDamageGuarded(defender, "SPECIAL_ATTACK", () => 0)).toBe(false);
    defender.specialAbilities = ["FORESIGHT", "HORO"];
    expect(isDamageGuarded(defender, "SPECIAL_ATTACK", () => 0.69)).toBe(true);

    const normalGuard = unit("normal-guard", "enemy", 510, 450);
    const ironGuard = unit("iron-guard", "enemy", 510, 450); ironGuard.specialAbilities = ["IRON_WALL"];
    const attackerA = unit("attacker-a", "player", 500, 450);
    const attackerB = unit("attacker-b", "player", 500, 450);
    startSoldierAttack(attackerA, normalGuard, 0); updateAttackStates([attackerA, normalGuard], createBattleBases(), 1_000, false, () => 0);
    startSoldierAttack(attackerB, ironGuard, 0); updateAttackStates([attackerB, ironGuard], createBattleBases(), 1_000, false, () => 0);
    expect(normalGuard.x - 510).toBeCloseTo(REACTION_CONFIG.knockbackDistance);
    expect(ironGuard.x - 510).toBeCloseTo(REACTION_CONFIG.ironWallGuardKnockbackDistance);
  });

  it("fires RALLY for ally retreat and INSPIRE/JINTO independently for enemy retreat in 11x11", () => {
    const retreater = unit("retreater", "player", 500, 450); retreater.state = "EMERGENCY_RETREAT";
    const rally = unit("rally", "player", 510, 450); rally.specialAbilities = ["RALLY_SPIRIT"];
    const ally = unit("ally", "player", 520, 450); ally.hp -= 5; ally.specialAbilities = ["RECOVERY_BOOST"];
    const inspire = unit("inspire", "enemy", 520, 450); inspire.specialAbilities = ["INSPIRE"];
    const jinto = unit("jinto", "enemy", 530, 450); jinto.rareSpecialAbilities = ["JINTO"];
    const enemyAlly = unit("enemy-ally", "enemy", 540, 450); enemyAlly.hp -= 5; enemyAlly.strategy = "defend";
    const events = handleRetreatStateEntered(retreater, [retreater, rally, ally, inspire, jinto, enemyAlly], 100);
    expect(events.map((event) => event.ability)).toEqual(["RALLY_SPIRIT", "INSPIRE", "JINTO"]);
    expect(ally.hp).toBe(ally.maxHp - 3);
    expect(enemyAlly.hp).toBe(enemyAlly.maxHp - 4);
    expect(enemyAlly.temporaryOrder?.type).toBe("JINTO_CHARGE");
    expect(enemyAlly.strategy).toBe("defend");
  });

  it("selects the nearest actionable TREATMENT holder by SWF Manhattan distance and applies H/2H", () => {
    const patient = unit("patient", "player", 500, 450); patient.maxHp = 100; patient.hp = 10;
    const near = unit("near", "player", 510, 450); near.specialAbilities = ["TREATMENT"];
    const far = unit("far", "player", 700, 450); far.specialAbilities = ["TREATMENT"];
    expect(findNearestTreatmentHealer(patient, [patient, far, near])).toBe(near);
    expect(calculateTreatmentHealAmount(patient)).toBe(22);
    patient.specialAbilities = ["RECOVERY_BOOST"];
    const pulseTarget = unit("pulse", "player", 515, 450); pulseTarget.hp -= 3;
    startEmergencyRetreat(patient, createBattleBases(), [patient, near, pulseTarget], 0);
    Object.assign(patient, { x: near.x, y: near.y });
    updateEmergencyRetreat(patient, createBattleBases(), () => 1, [patient, near, pulseTarget], 1);
    expect(patient.hp).toBe(54);
    expect(patient.state).toBe("NORMAL");
    expect(pulseTarget.hp).toBe(pulseTarget.maxHp - 2);
  });

  it("uses three FIELD_HOSPITAL roster-slot draws with replacement without alive filtering", () => {
    const defenders = roster("player", "FIELD_HOSPITAL"); defenders[0].isDead = true;
    const patient = unit("patient"); patient.hp = patient.maxHp - 40;
    expect(rosterSlotDrawHasAbility(defenders, "player", "FIELD_HOSPITAL", 3, () => 0)).toBe(true);
    expect(applyFieldHospitalArrival(patient, defenders, () => 0)).toBe(30);
    expect(patient.hp).toBe(patient.maxHp - 10);
  });

  it("checks TRAP during movement in the enemy half, samples two slots and floors HP at two", () => {
    const source = battlefieldSourcePointToWorld({ x: 901, y: 450 });
    const invader = unit("invader", "player", source.x, source.y); invader.hp = 2;
    const defenders = roster("enemy", "TRAP"); defenders[0].isDead = true;
    const soldiers = [invader, ...defenders];
    const previous = new Map([[invader.id, { x: invader.x - 1, y: invader.y }]]);
    expect(updateInvaderTrapMovement(soldiers, previous, 100, () => 0)).toEqual([invader.id]);
    expect(invader.hp).toBe(2);
    expect(invader.trapStateUntil).toBeGreaterThan(invader.abilityActionLockUntil);
  });

  it("doubles SWF base recovery increments with RECOVERY_BOOST", () => {
    const normal = unit("normal"); const boosted = unit("boosted");
    normal.state = boosted.state = "HEALING"; normal.maxHp = boosted.maxHp = 60; normal.hp = boosted.hp = 10;
    boosted.specialAbilities = ["RECOVERY_BOOST"];
    updateHealing(normal, 1 / 24); updateHealing(boosted, 1 / 24);
    expect(boosted.hp - 10).toBeCloseTo((normal.hp - 10) * 2);
  });

  it("queues a gauge-free current-technique MOUTAI special before entering retreat", () => {
    const attacker = unit("moutai", "player", 500, 450); attacker.hp = 5; attacker.rareSpecialAbilities = ["MOUTAI"];
    const enemy = unit("enemy", "enemy", 510, 450);
    updateRecoveryStates([attacker, enemy], 0, createBattleBases(), () => 1, 100);
    expect(attacker.state).toBe("NORMAL"); expect(attacker.pendingMoutaiSpecials).toBe(1);
    const events = updateSpecialAttacks([attacker, enemy], [], createBattleBases(), 100, false, () => 1);
    expect(events.some((event) => "attackerId" in event && event.attackerId === attacker.id)).toBe(true);
    expect(attacker.pendingMoutaiSpecials).toBe(0);
  });

  it("KATON removes only FIRE/EXPLOSION and preserves direct components", () => {
    const victim = unit("katon"); victim.rareSpecialAbilities = ["KATON"];
    expect(totalDamageComponents(applyRareDamageImmunity(victim,
      { DIRECT_ARROW: 1, DIRECT_SPECIAL: 1, FIRE: 2, EXPLOSION: 3 }))).toBe(2);
  });

  it("NINJA_HUNTER melee AI selects the frontmost enemy ninja and legacy rare IDs normalize", () => {
    const hunter = unit("hunter", "player"); hunter.strategy = "melee"; hunter.rareSpecialAbilities = ["NINJA_HUNTER"];
    const rear = unit("rear", "enemy", 700); rear.unitType = "NINJA";
    const front = unit("front", "enemy", 600); front.unitType = "NINJA";
    updateMeleeAI(hunter, [hunter, rear, front], 10, () => 0);
    expect(hunter.targetId).toBe(front.id);
    expect(normalizeRareSpecialAbilityId("VANGUARD")).toBe("JINTO");
    expect(normalizeRareSpecialAbilityId("FIRE_ESCAPE")).toBe("KATON");
    const loadout = { unitType: "PROTOTYPE", technique: "PROTOTYPE_AREA",
      stats: { maxHp: 50, skill: 50, foot: 3, combat: 50, defense: 50 }, specialAbilities: [],
      rareSpecialAbilities: ["VANGUARD", "FIRE_ESCAPE"] } as unknown as SoldierLoadout;
    expect(validateSoldierLoadout(loadout).rareSpecialAbilities).toEqual(["JINTO", "KATON"]);
  });
});
