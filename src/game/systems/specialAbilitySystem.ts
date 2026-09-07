import { BATTLEFIELD_CONFIG, SOLDIERS_PER_TEAM, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, CommonSpecialAbilityId, Soldier, Team } from "../types";
import { cancelAttack } from "./attackRuntime";
import { swfCellsToWorldX, swfCellsToWorldY, swfLogicTicksToMs } from "./techniqueCombatProfiles";
import { recordRecovery, recordSmallRecoveryPulse } from "./meritSystem";

export const COMMON_SPECIAL_ABILITY_POOL: readonly CommonSpecialAbilityId[] = [
  "RUSH", "SIEGE", "MIGHT", "DOUBLE_SPECIAL", "IRON_WALL", "FORESIGHT", "FINISHER", "RALLY_SPIRIT",
  "INSPIRE", "RECOVERY_BOOST", "TREATMENT", "FIELD_HOSPITAL", "TRAP", "FORTIFY", "HORO", "FLEET_FOOT",
];
export const COMMON_SPECIAL_ABILITY_LABELS: Record<CommonSpecialAbilityId, string> = {
  RUSH: "突進", SIEGE: "攻略", MIGHT: "膂力", DOUBLE_SPECIAL: "連発", IRON_WALL: "鉄壁", FORESIGHT: "見切",
  FINISHER: "討取", RALLY_SPIRIT: "奮起", INSPIRE: "鼓舞", RECOVERY_BOOST: "回復", TREATMENT: "治療",
  FIELD_HOSPITAL: "療所", TRAP: "仕掛", FORTIFY: "堅陣", HORO: "母衣", FLEET_FOOT: "逃足",
};
export const SWF_SUPPORT_AREA_CELLS = 11;
export const SWF_ABILITY_ACTION_LOCK_TICKS = 16;

export function hasSpecialAbility(soldier: Pick<Soldier, "specialAbilities">, id: CommonSpecialAbilityId): boolean {
  return soldier.specialAbilities.includes(id);
}
export function createRandomCommonSpecialAbilities(random: RandomSource = Math.random): CommonSpecialAbilityId[] {
  const { randomCommonAbilityMin: min, randomCommonAbilityMax: max } = SPECIAL_ABILITY_CONFIG;
  const count = min + Math.floor(Math.max(0, Math.min(0.999999999, random())) * (max - min + 1));
  const pool = [...COMMON_SPECIAL_ABILITY_POOL];
  const result: CommonSpecialAbilityId[] = [];
  while (result.length < count && pool.length) {
    const index = Math.floor(Math.max(0, Math.min(0.999999999, random())) * pool.length);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

/** Common atck() order: basic, 将力, 忍狩, then 討取 against the resulting HP. */
export function calculateSuccessfulAttackDamage(attacker: Soldier, defender: Soldier, basicDamage = 1): number {
  const beforeFinisher = basicDamage
    + Number(hasSpecialAbility(attacker, "MIGHT"))
    + Number(attacker.rareSpecialAbilities.includes("NINJA_HUNTER") && defender.unitType === "NINJA");
  return beforeFinisher + Number(hasSpecialAbility(attacker, "FINISHER") && defender.hp - beforeFinisher < 6);
}
export const calculateNormalAttackDamage = calculateSuccessfulAttackDamage;
export function calculateBaseAttackDamage(attacker: Soldier): number { return hasSpecialAbility(attacker, "SIEGE") ? 2 : 1; }
export function calculateRetreatMoveSpeed(baseSpeed: number, soldier: Soldier): number {
  if (!hasSpecialAbility(soldier, "FLEET_FOOT")) return baseSpeed;
  const normalFoot = Math.max(0, soldier.stats.foot);
  const retreatFoot = Math.min(normalFoot + SPECIAL_ABILITY_CONFIG.fleetFootBonus, SPECIAL_ABILITY_CONFIG.fleetFootMaximum);
  return normalFoot > 0 ? baseSpeed * retreatFoot / normalFoot : baseSpeed;
}
export function getEffectiveDefenseForAttack(defender: Soldier, _kind?: AttackKind): number { return defender.stats.defense; }
export function countTeamAbility(soldiers: readonly Soldier[], team: Team, id: CommonSpecialAbilityId): number {
  return soldiers.filter((soldier) => soldier.team === team && !soldier.isDead && hasSpecialAbility(soldier, id)).length;
}
export function isAbilityActionCapable(soldier: Soldier, currentTime = 0): boolean {
  return !soldier.isDead && soldier.hp > 0 && soldier.state === "NORMAL" && soldier.reactionState === "NONE"
    && soldier.combatActionState === "IDLE" && soldier.activeSpecialTechnique === null
    && currentTime >= soldier.abilityActionLockUntil && currentTime >= soldier.trapStateUntil;
}
export function getTeamRosterSlots(soldiers: readonly Soldier[], team: Team): readonly (Soldier | undefined)[] {
  const teamMembers = soldiers.filter((soldier) => soldier.team === team);
  return Array.from({ length: SOLDIERS_PER_TEAM }, (_, index) => teamMembers[index]);
}
function randomSlotIndex(random: RandomSource): number {
  return Math.floor(Math.max(0, Math.min(0.999999999, random())) * SOLDIERS_PER_TEAM);
}
export function rosterSlotDrawHasAbility(
  soldiers: readonly Soldier[], team: Team, ability: CommonSpecialAbilityId, draws: number, random: RandomSource,
): boolean {
  const slots = getTeamRosterSlots(soldiers, team);
  for (let attempt = 0; attempt < draws; attempt += 1) {
    const selected = slots[randomSlotIndex(random)];
    if (selected && hasSpecialAbility(selected, ability)) return true;
  }
  return false;
}
export function drawRosterSlotAbilityHolder(
  soldiers: readonly Soldier[], team: Team, ability: CommonSpecialAbilityId, draws: number, random: RandomSource,
): Soldier | null {
  const slots = getTeamRosterSlots(soldiers, team);
  for (let attempt = 0; attempt < draws; attempt += 1) {
    const selected = slots[randomSlotIndex(random)];
    if (selected && hasSpecialAbility(selected, ability)) return selected;
  }
  return null;
}
export function countRosterSlotAbility(soldiers: readonly Soldier[], team: Team, ability: CommonSpecialAbilityId): number {
  return getTeamRosterSlots(soldiers, team).filter((slot) => slot && hasSpecialAbility(slot, ability)).length;
}
export function applyFieldHospitalArrival(patient: Soldier, soldiers: readonly Soldier[], random: RandomSource = Math.random): number {
  const holder = drawRosterSlotAbilityHolder(soldiers, patient.team, "FIELD_HOSPITAL", 3, random);
  if (!holder) return 0;
  const amount = Math.min(SPECIAL_ABILITY_CONFIG.fieldHospitalHealAmount, patient.maxHp - patient.hp);
  patient.hp += amount;
  recordRecovery(holder, patient, amount);
  return amount;
}
export function isInsideSupportRectangle(center: Pick<Soldier, "x" | "y">, target: Pick<Soldier, "x" | "y">): boolean {
  const halfCells = (SWF_SUPPORT_AREA_CELLS - 1) / 2;
  return Math.abs(target.x - center.x) <= swfCellsToWorldX(halfCells)
    && Math.abs(target.y - center.y) <= swfCellsToWorldY(halfCells);
}
export function applySupportHealingPulse(source: Soldier, soldiers: readonly Soldier[], includeSource = true): string[] {
  const healed: string[] = [];
  for (const target of soldiers) {
    if ((!includeSource && target === source) || target.isDead || target.hp <= 0 || target.team !== source.team
      || !isInsideSupportRectangle(source, target)) continue;
    const requested = hasSpecialAbility(target, "RECOVERY_BOOST") ? 2 : 1;
    const amount = Math.min(requested, target.maxHp - target.hp);
    if (amount <= 0) continue;
    target.hp += amount;
    recordSmallRecoveryPulse(source, target, amount);
    healed.push(target.id);
  }
  return healed;
}
function lockAbilityHolder(holder: Soldier, currentTime: number): void {
  cancelAttack(holder);
  holder.velocityX = 0;
  holder.velocityY = 0;
  holder.abilityActionLockUntil = Math.max(holder.abilityActionLockUntil,
    currentTime + swfLogicTicksToMs(SWF_ABILITY_ACTION_LOCK_TICKS));
}
function clearCombatTarget(soldier: Soldier): void {
  soldier.targetId = null;
  soldier.engagementStartedAt = null;
  soldier.engagementOriginX = null;
  soldier.engagementOriginY = null;
  soldier.preferredApproachAngle = null;
  soldier.preferredApproachTargetId = null;
}
function applyJintoCharge(holder: Soldier, soldiers: readonly Soldier[], currentTime: number): string[] {
  const affected: string[] = [];
  for (const target of soldiers) {
    if (target.team !== holder.team || (target !== holder && !isAbilityActionCapable(target, currentTime))
      || !isInsideSupportRectangle(holder, target)) continue;
    clearCombatTarget(target);
    target.temporaryOrder = { type: "JINTO_CHARGE", issuedAt: currentTime, expiresAt: Number.POSITIVE_INFINITY,
      sourceX: holder.x, sourceY: holder.y };
    target.strategyObjectiveKind = "ENEMY_SIDE";
    target.strategyObjectiveX = target.team === "player" ? BATTLEFIELD_CONFIG.enemyHomeX : BATTLEFIELD_CONFIG.playerHomeX;
    target.strategyObjectiveY = target.y;
    target.moveTargetX = target.strategyObjectiveX;
    target.moveTargetY = target.y;
    affected.push(target.id);
  }
  return affected;
}
export interface RetreatAbilityEvent {
  holderId: string;
  ability: "RALLY_SPIRIT" | "INSPIRE" | "JINTO";
  affectedIds: string[];
}
export function handleRetreatStateEntered(
  retreater: Soldier, soldiers: readonly Soldier[], currentTime: number,
): RetreatAbilityEvent[] {
  const events: RetreatAbilityEvent[] = [];
  for (const holder of soldiers) {
    if (!isAbilityActionCapable(holder, currentTime)) continue;
    if (holder.team === retreater.team && hasSpecialAbility(holder, "RALLY_SPIRIT")) {
      lockAbilityHolder(holder, currentTime);
      events.push({ holderId: holder.id, ability: "RALLY_SPIRIT", affectedIds: applySupportHealingPulse(holder, soldiers) });
    }
    if (holder.team !== retreater.team && hasSpecialAbility(holder, "INSPIRE")) {
      lockAbilityHolder(holder, currentTime);
      events.push({ holderId: holder.id, ability: "INSPIRE", affectedIds: applySupportHealingPulse(holder, soldiers) });
    }
    if (holder.team !== retreater.team && holder.rareSpecialAbilities.includes("JINTO")) {
      const affectedIds = applyJintoCharge(holder, soldiers, currentTime);
      lockAbilityHolder(holder, currentTime);
      events.push({ holderId: holder.id, ability: "JINTO", affectedIds });
    }
  }
  return events;
}
