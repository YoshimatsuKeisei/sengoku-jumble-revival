import { PROTOTYPE_COMBAT_MAX, PROTOTYPE_DEFENSE_MAX, PROTOTYPE_SKILL_MAX } from "../config";
import type { CommonSpecialAbilityId, LegacyRareSpecialAbilityId, RareSpecialAbilityId, SoldierLoadout, UnitTechnique, UnitType } from "../types";
import { COMMON_SPECIAL_ABILITY_POOL } from "./specialAbilitySystem";

export const UNIT_TYPE_LABELS: Record<UnitType, string> = { PROTOTYPE: "Prototype", TEPPOU: "鉄砲", CAVALRY: "騎馬", ARCHER: "弓兵", ASHIGARU: "足軽", NINJA: "忍者", GENERAL: "武将", STRATEGIST: "軍師", MOSA: "猛者" };
export const UNIT_DEFINITIONS: Record<UnitType, { label: string; maxPerTeam?: number; techniques: UnitTechnique[]; strategyLocked?: boolean }> = {
  PROTOTYPE: { label: "Prototype", techniques: ["PROTOTYPE_AREA"] },
  TEPPOU: { label: "鉄砲", techniques: ["TEPPOU_SHOOTING", "TEPPOU_SNIPING", "TEPPOU_BOMBARDMENT"] },
  CAVALRY: { label: "騎馬", maxPerTeam: 1, techniques: ["CAVALRY_CHARGE"], strategyLocked: true },
  ARCHER: { label: "弓兵", maxPerTeam: 30, techniques: ["ARCHER_ARROW", "ARCHER_LONG_SHOT", "ARCHER_FIRE_ARROW", "ARCHER_HOROKU"] },
  ASHIGARU: { label: "足軽", maxPerTeam: 30, techniques: ["ASHIGARU_SPEAR_STRIKE", "ASHIGARU_SPEAR_TECHNIQUE"] },
  NINJA: { label: "忍者", maxPerTeam: 6, techniques: ["NINJA_NINJUTSU", "NINJA_SHADOW_RUN", "NINJA_GENJUTSU", "NINJA_BARRIER"] },
  GENERAL: { label: "武将", maxPerTeam: 4, techniques: ["GENERAL_COMMAND", "GENERAL_HEROIC", "GENERAL_HEAL"] },
  STRATEGIST: { label: "軍師", maxPerTeam: 4, techniques: ["STRATEGIST_FIRE_PLAY", "STRATEGIST_FIRE_ATTACK", "STRATEGIST_FIRE_PLAN", "STRATEGIST_HELLFIRE", "STRATEGIST_FLAME_ART", "STRATEGIST_FALSE_REPORT", "STRATEGIST_SORCERY", "STRATEGIST_HEAL"] },
  MOSA: { label: "猛者", maxPerTeam: 6, techniques: ["MOSA_SENPUU", "MOSA_MUSOU", "MOSA_KIJIN"] },
};
export const TECHNIQUE_DEFINITIONS: Record<UnitTechnique, { unitType: UnitType; label: string; gunRange?: number }> = {
  PROTOTYPE_AREA: { unitType: "PROTOTYPE", label: "Prototype Area" },
  TEPPOU_SHOOTING: { unitType: "TEPPOU", label: "射撃" },
  TEPPOU_SNIPING: { unitType: "TEPPOU", label: "狙撃" },
  TEPPOU_BOMBARDMENT: { unitType: "TEPPOU", label: "砲撃" },
  CAVALRY_CHARGE: { unitType: "CAVALRY", label: "騎突" },
  ARCHER_ARROW: { unitType: "ARCHER", label: "弓矢" },
  ARCHER_LONG_SHOT: { unitType: "ARCHER", label: "遠射" },
  ARCHER_FIRE_ARROW: { unitType: "ARCHER", label: "火矢" },
  ARCHER_HOROKU: { unitType: "ARCHER", label: "焙烙" },
  ASHIGARU_SPEAR_STRIKE: { unitType: "ASHIGARU", label: "槍撃" },
  ASHIGARU_SPEAR_TECHNIQUE: { unitType: "ASHIGARU", label: "槍術" },
  NINJA_NINJUTSU: { unitType: "NINJA", label: "忍術" },
  NINJA_SHADOW_RUN: { unitType: "NINJA", label: "影走" },
  NINJA_GENJUTSU: { unitType: "NINJA", label: "幻術" },
  NINJA_BARRIER: { unitType: "NINJA", label: "結界" },
  GENERAL_COMMAND: { unitType: "GENERAL", label: "号令" },
  GENERAL_HEROIC: { unitType: "GENERAL", label: "豪傑" },
  GENERAL_HEAL: { unitType: "GENERAL", label: "治癒" },
  STRATEGIST_FIRE_PLAY: { unitType: "STRATEGIST", label: "火遊" },
  STRATEGIST_FIRE_ATTACK: { unitType: "STRATEGIST", label: "火攻" },
  STRATEGIST_FIRE_PLAN: { unitType: "STRATEGIST", label: "火計" },
  STRATEGIST_HELLFIRE: { unitType: "STRATEGIST", label: "業火" },
  STRATEGIST_FLAME_ART: { unitType: "STRATEGIST", label: "炎術" },
  STRATEGIST_FALSE_REPORT: { unitType: "STRATEGIST", label: "虚報" },
  STRATEGIST_SORCERY: { unitType: "STRATEGIST", label: "妖術" },
  STRATEGIST_HEAL: { unitType: "STRATEGIST", label: "治癒" },
  MOSA_SENPUU: { unitType: "MOSA", label: "旋風" },
  MOSA_MUSOU: { unitType: "MOSA", label: "無双" },
  MOSA_KIJIN: { unitType: "MOSA", label: "鬼神" },
};
export function isTechniqueCompatibleWithUnitType(unitType: UnitType, technique: UnitTechnique): boolean {
  return TECHNIQUE_DEFINITIONS[technique]?.unitType === unitType;
}
export function normalizeRareSpecialAbilityId(id: RareSpecialAbilityId | LegacyRareSpecialAbilityId | string): RareSpecialAbilityId | null {
  if (id === "VANGUARD") return "JINTO";
  if (id === "FIRE_ESCAPE") return "KATON";
  return id === "MOUTAI" || id === "JINTO" || id === "KATON" || id === "NINJA_HUNTER" ? id : null;
}
export function validateSoldierLoadout(loadout: SoldierLoadout): SoldierLoadout {
  if (!isTechniqueCompatibleWithUnitType(loadout.unitType, loadout.technique)) throw new Error("Incompatible unit type and technique");
  if (!(loadout.stats.maxHp > 0)) throw new Error("maxHp must be positive");
  if (loadout.stats.foot < 1 || loadout.stats.foot > 6) throw new Error("foot must be between 1 and 6");
  for (const key of ["skill", "combat", "defense"] as const) {
    if (!Number.isFinite(loadout.stats[key]) || loadout.stats[key] < 0) throw new Error(`${key} must be non-negative`);
  }
  const abilities = [...new Set(loadout.specialAbilities)];
  if (abilities.some((id) => !COMMON_SPECIAL_ABILITY_POOL.includes(id))) throw new Error("Only common abilities are supported");
  if (loadout.unitType === "CAVALRY") {
    for (const mandatory of ["RUSH", "FLEET_FOOT"] as const) if (!abilities.includes(mandatory)) abilities.push(mandatory);
  }
  const rareSpecialAbilities = [...new Set((loadout.rareSpecialAbilities ?? [])
    .map((id) => normalizeRareSpecialAbilityId(id))
    .filter((id): id is RareSpecialAbilityId => id !== null))];
  if (loadout.unitType === "CAVALRY" && !rareSpecialAbilities.includes("MOUTAI")) rareSpecialAbilities.push("MOUTAI");
  return { ...loadout, stats: { ...loadout.stats }, specialAbilities: abilities, rareSpecialAbilities };
}
export const DEFAULT_PLAYER_LOADOUT: SoldierLoadout = {
  unitType: "PROTOTYPE", technique: "PROTOTYPE_AREA",
  stats: { maxHp: 60, skill: PROTOTYPE_SKILL_MAX / 2, foot: 6, combat: PROTOTYPE_COMBAT_MAX, defense: PROTOTYPE_DEFENSE_MAX },
  specialAbilities: [...COMMON_SPECIAL_ABILITY_POOL],
};
export function makePlayerDebugPreset(technique: UnitTechnique): SoldierLoadout {
  const unitType: UnitType = TECHNIQUE_DEFINITIONS[technique].unitType;
  const stats = unitType === "CAVALRY" ? { maxHp: 82, skill: 95, foot: 6, combat: 125, defense: 52 }
    : unitType === "ARCHER" ? { maxHp: 90, skill: 90, foot: 3, combat: 85, defense: 85 }
    : unitType === "ASHIGARU" ? { maxHp: 90, skill: 90, foot: 3, combat: 95, defense: 90 }
    : unitType === "NINJA" ? { maxHp: 31, skill: 90, foot: 5, combat: 108, defense: 108 }
    : unitType === "GENERAL" ? { maxHp: 90, skill: 90, foot: 3, combat: 90, defense: 108 }
    : unitType === "STRATEGIST" ? { maxHp: 85, skill: 90, foot: 3, combat: 80, defense: 90 }
    : unitType === "MOSA" ? { maxHp: 98, skill: 90, foot: 3, combat: 108, defense: 90 }
    : { ...DEFAULT_PLAYER_LOADOUT.stats };
  return validateSoldierLoadout({ ...DEFAULT_PLAYER_LOADOUT, unitType, technique,
    stats, specialAbilities: [...COMMON_SPECIAL_ABILITY_POOL] });
}
