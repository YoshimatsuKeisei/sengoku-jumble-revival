import { describe, expect, it } from "vitest";
import { createSoldier } from "../entities/Soldier";
import type { Soldier, SoldierLoadout, UnitTechnique, UnitType } from "../types";
import { updateArrowProjectile, type ArrowProjectileRuntime } from "./arrowAttackSystem";
import { COMBAT_GAUGE_UPDATE_INTERVAL_MS } from "./combatGaugeSystem";
import { updateSpecialAttacks, type SpecialAttackEvent } from "./specialAttackSystem";

const RANGED_STATS = { maxHp: 60, skill: 100, foot: 3, combat: 50, defense: 50 } as const;

function rangedLoadout(unitType: UnitType, technique: UnitTechnique): SoldierLoadout {
  return { unitType, technique, stats: RANGED_STATS, specialAbilities: [], rareSpecialAbilities: [] };
}

function makeRanged(id: string, unitType: "ARCHER" | "TEPPOU", technique: UnitTechnique, x = 100): Soldier {
  return createSoldier(id, "player", "ai", x, 100, "charge", RANGED_STATS, rangedLoadout(unitType, technique));
}

function countKind(events: readonly SpecialAttackEvent[], kind: SpecialAttackEvent["kind"]): number {
  return events.filter((event) => event.kind === kind).length;
}

describe("ranged attack cycle regressions", () => {
  it.each([
    ["TEPPOU", "TEPPOU_SHOOTING", "GUN"],
    ["ARCHER", "ARCHER_ARROW", "ARROW"],
  ] as const)("does not drain a banked %s gauge once per render frame during one second", (unitType, technique, eventKind) => {
    const attacker = makeRanged("ranged", unitType, technique);
    const target = createSoldier("target", "enemy", "ai", 180, 100);
    target.maxHp = target.hp = 1_000;
    attacker.combatGauge = 1_000;
    let launches = 0;

    for (let frame = 0; frame < 60; frame += 1) {
      const events = updateSpecialAttacks([attacker, target], [], [], frame * 1000 / 60, false, () => 1);
      launches += countKind(events, eventKind);
    }

    // One initial restored/precharged decision plus the decision at ~958 ms.
    // The pre-fix per-render-frame path produced five launches in this window.
    expect(launches).toBe(2);
    expect(attacker.combatGauge).toBe(700);
  });

  it("allows the next autonomous gun shot only on the next 23-tick combat decision", () => {
    const attacker = makeRanged("gun", "TEPPOU", "TEPPOU_SHOOTING");
    const target = createSoldier("target", "enemy", "ai", 180, 100);
    target.maxHp = target.hp = 1_000;
    attacker.combatGauge = 1_000;

    expect(countKind(updateSpecialAttacks([attacker, target], [], [], 0, false, () => 1), "GUN")).toBe(1);
    expect(countKind(updateSpecialAttacks([attacker, target], [], [], COMBAT_GAUGE_UPDATE_INTERVAL_MS - 1, false, () => 1), "GUN")).toBe(0);
    expect(countKind(updateSpecialAttacks([attacker, target], [], [], COMBAT_GAUGE_UPDATE_INTERVAL_MS, false, () => 1), "GUN")).toBe(1);
  });

  it.each(["before", "after"] as const)("serializes a general-forced shot with the recipient's autonomous path (%s general)", (order) => {
    const generalLoadout: SoldierLoadout = {
      unitType: "GENERAL", technique: "GENERAL_COMMAND",
      stats: RANGED_STATS, specialAbilities: [], rareSpecialAbilities: [],
    };
    const general = createSoldier("general", "player", "ai", 100, 100, "charge", RANGED_STATS, generalLoadout);
    const gun = makeRanged("gun", "TEPPOU", "TEPPOU_SHOOTING", 120);
    const target = createSoldier("target", "enemy", "ai", 180, 100);
    target.maxHp = target.hp = 1_000;
    general.combatGauge = 401;
    gun.combatGauge = 201;
    const roster = order === "before" ? [general, gun, target] : [gun, general, target];

    const events = updateSpecialAttacks(roster, [], [], 0, false, () => 1);

    expect(countKind(events, "GENERAL")).toBe(1);
    expect(countKind(events, "GUN")).toBe(1);
    expect(target.hp).toBe(999);
  });

  it("applies one arrow impact once in the BattleScene-style active-projectile lifecycle", () => {
    const archer = makeRanged("archer", "ARCHER", "ARCHER_ARROW");
    const target = createSoldier("target", "enemy", "ai", 180, 100);
    archer.combatGauge = 201;
    const launch = updateSpecialAttacks([archer, target], [], [], 0, false, () => 1)
      .find((event): event is Extract<SpecialAttackEvent, { kind: "ARROW" }> => event.kind === "ARROW")!;
    let active: ArrowProjectileRuntime[] = [launch.projectile];
    const hpBefore = target.hp;

    for (let frame = 0; frame < 120 && active.length > 0; frame += 1) {
      active = active.filter((projectile) => updateArrowProjectile(projectile, [archer, target], 1000 / 60,
        frame * 1000 / 60, () => 1).active);
    }

    expect(active).toHaveLength(0);
    expect(target.hp).toBe(hpBefore - 1);
  });
});
