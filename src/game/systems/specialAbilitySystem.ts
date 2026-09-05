import { SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, BattleObstacle, CommonSpecialAbilityId, Soldier, Team } from "../types";
import { SOLDIER_RADIUS } from "../config";
import { applyDamage } from "./combatSystem";

export const COMMON_SPECIAL_ABILITY_POOL: readonly CommonSpecialAbilityId[] = [
  "RUSH", "SIEGE", "MIGHT", "DOUBLE_SPECIAL", "IRON_WALL", "FORESIGHT", "FINISHER", "RALLY_SPIRIT",
  "INSPIRE", "RECOVERY_BOOST", "TREATMENT", "FIELD_HOSPITAL", "TRAP", "FORTIFY", "HORO", "FLEET_FOOT",
];
export const COMMON_SPECIAL_ABILITY_LABELS: Record<CommonSpecialAbilityId, string> = {
  RUSH: "突進", SIEGE: "攻略", MIGHT: "膂力", DOUBLE_SPECIAL: "連発", IRON_WALL: "鉄壁", FORESIGHT: "見切",
  FINISHER: "討取", RALLY_SPIRIT: "奮起", INSPIRE: "鼓舞", RECOVERY_BOOST: "回復", TREATMENT: "治療",
  FIELD_HOSPITAL: "療所", TRAP: "仕掛", FORTIFY: "堅陣", HORO: "母衣", FLEET_FOOT: "逃足",
};
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
export function calculateNormalAttackDamage(attacker: Soldier, defender: Soldier): number {
  return 1 + Number(hasSpecialAbility(attacker, "MIGHT")) + Number(hasSpecialAbility(attacker, "FINISHER") && defender.hp <= 5);
}
export function calculateBaseAttackDamage(attacker: Soldier): number { return hasSpecialAbility(attacker, "SIEGE") ? 2 : 1; }
export function calculateRetreatMoveSpeed(baseSpeed: number, soldier: Soldier): number {
  return baseSpeed * (hasSpecialAbility(soldier, "FLEET_FOOT") ? SPECIAL_ABILITY_CONFIG.fleetFootRetreatMultiplier : 1);
}
export function getEffectiveDefenseForAttack(defender: Soldier, kind: AttackKind): number {
  return defender.stats.defense * (kind === "ARROW_ATTACK" && hasSpecialAbility(defender, "HORO")
    ? SPECIAL_ABILITY_CONFIG.horoArrowDefenseMultiplier : 1);
}
export function countTeamAbility(soldiers: readonly Soldier[], team: Team, id: CommonSpecialAbilityId): number {
  return soldiers.filter((s) => s.team === team && !s.isDead && hasSpecialAbility(s, id)).length;
}
export function aggregateProcChance(count: number, perHolder: number, cap: number): number {
  return Math.min(cap, 1 - Math.pow(1 - perHolder, Math.max(0, count)));
}
export function pulseFriendlyHealing(source: Soldier, soldiers: readonly Soldier[]): void {
  for (const target of soldiers) if (target !== source && !target.isDead && target.team === source.team
    && Math.hypot(target.x - source.x, target.y - source.y) <= SPECIAL_ABILITY_CONFIG.supportPulseRadius) {
    target.hp = Math.min(target.maxHp, target.hp + 1);
  }
}
export function handleRetreatStarted(retreater: Soldier, soldiers: readonly Soldier[]): void {
  for (const source of soldiers) {
    const ability = source.team === retreater.team ? "RALLY_SPIRIT" : "INSPIRE";
    if (!source.isDead && hasSpecialAbility(source, ability)) pulseFriendlyHealing(source, soldiers);
  }
}
function ownedFenceTeam(fence: BattleObstacle): Team | null {
  if (fence.id.startsWith("player-")) return "player";
  if (fence.id.startsWith("enemy-")) return "enemy";
  return null;
}
function touchingFence(soldier: Soldier, fence: BattleObstacle): boolean {
  const x = Math.max(fence.x, Math.min(soldier.x, fence.x + fence.width));
  const y = Math.max(fence.y, Math.min(soldier.y, fence.y + fence.height));
  return Math.hypot(soldier.x - x, soldier.y - y) <= SOLDIER_RADIUS + 0.5;
}
export function updateFenceTrapContacts(soldiers: Soldier[], fences: readonly BattleObstacle[], random: RandomSource = Math.random): void {
  for (const soldier of soldiers) {
    if (soldier.isDead) continue;
    const now = fences.filter((fence) => ownedFenceTeam(fence) !== null && ownedFenceTeam(fence) !== soldier.team
      && touchingFence(soldier, fence)).map((fence) => fence.id);
    for (const id of now) if (!soldier.touchingEnemyFenceIds.includes(id)) {
      const fence = fences.find((candidate) => candidate.id === id)!;
      const owner = ownedFenceTeam(fence)!;
      const count = countTeamAbility(soldiers, owner, "TRAP");
      if (random() < aggregateProcChance(count, SPECIAL_ABILITY_CONFIG.trapPerHolderChance,
        SPECIAL_ABILITY_CONFIG.trapMaxChance)) applyDamage(soldier, SPECIAL_ABILITY_CONFIG.trapDamage);
    }
    soldier.touchingEnemyFenceIds = now;
  }
}
