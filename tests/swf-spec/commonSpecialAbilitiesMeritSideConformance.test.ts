import { describe, expect, it } from "vitest";
import { createSoldier } from "../../src/game/entities/Soldier";
import type { Soldier } from "../../src/game/types";
import { recordBaseAttack, recordRecovery } from "../../src/game/systems/meritSystem";
import { applyFieldHospitalArrival, applySupportHealingPulse } from "../../src/game/systems/specialAbilitySystem";

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

describe("SWF conformance: common ability merit is player-side only", () => {
  it("records s8/base rsj for player attackers but not mirrored enemy attackers", () => {
    const player = unit("player");
    const enemy = unit("enemy", "enemy");
    recordBaseAttack(player, 2);
    recordBaseAttack(enemy, 2);
    expect(player.merits.baseDamage).toBe(2);
    expect(enemy.merits.baseDamage).toBe(0);
  });

  it("lets enemy sz-style support healing occur without creating raw rsk merit", () => {
    const source = unit("enemy-source", "enemy");
    const target = unit("enemy-target", "enemy", 510, 450);
    target.hp -= 4;
    target.specialAbilities = ["RECOVERY_BOOST"];

    expect(applySupportHealingPulse(source, [source, target])).toEqual([target.id]);
    expect(target.hp).toBe(target.maxHp - 2);
    expect(source.merits.recovery).toBe(0);
  });

  it("lets enemy s16 FIELD_HOSPITAL heal 30 while leaving the drawn holder rsk unchanged", () => {
    const soldiers = roster("enemy", "FIELD_HOSPITAL");
    const patient = unit("enemy-patient", "enemy");
    patient.hp = patient.maxHp - 40;

    expect(applyFieldHospitalArrival(patient, soldiers, () => 0)).toBe(30);
    expect(patient.hp).toBe(patient.maxHp - 10);
    expect(soldiers[0].merits.recovery).toBe(0);
  });

  it("records tat/mrjo-style actual recovery merit only for player-side sources", () => {
    const playerSource = unit("player-source");
    const playerTarget = unit("player-target");
    const enemySource = unit("enemy-source", "enemy");
    const enemyTarget = unit("enemy-target", "enemy");

    recordRecovery(playerSource, playerTarget, 17);
    recordRecovery(enemySource, enemyTarget, 17);
    expect(playerSource.merits.recovery).toBe(17);
    expect(enemySource.merits.recovery).toBe(0);
  });
});
