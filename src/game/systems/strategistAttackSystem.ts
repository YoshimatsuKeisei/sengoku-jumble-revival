import { BATTLE_RANGE_UNIT_PX, STRATEGIST_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { applyConfusion } from "./confusionSystem";
import { applyRareDamageImmunity, totalDamageComponents } from "./damageComponentSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { startHitReaction } from "./reactionSystem";
import { calculateSpecialCooldownMs } from "./skillCooldownSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { SPECIAL_ABILITY_CONFIG } from "../config";

export type StrategistFireTechnique = keyof typeof STRATEGIST_CONFIG.fireDiameterUnits;
export type StrategistTechnique = StrategistFireTechnique | "STRATEGIST_FALSE_REPORT" | "STRATEGIST_SORCERY" | "STRATEGIST_HEAL";
export interface StrategistFireZone {
  id: string; ownerId: string; team: Team; x: number; y: number; radius: number; createdAt: number; expiresAt: number;
  damagedSoldierIds: Set<string>;
}
export interface StrategistAttackEvent {
  kind: "STRATEGIST"; attackerId: string; team: Team; technique: StrategistTechnique; x: number; y: number; radius: number;
  victimIds: string[]; confusedIds: string[]; healed: Array<{ targetId: string; amount: number }>; fireZone: StrategistFireZone | null;
}

export function isStrategistTechnique(technique: UnitTechnique): technique is StrategistTechnique {
  return technique.startsWith("STRATEGIST_");
}
export function isStrategistFireTechnique(technique: UnitTechnique): technique is StrategistFireTechnique {
  return technique in STRATEGIST_CONFIG.fireDiameterUnits;
}
export function getStrategistFireRadius(technique: StrategistFireTechnique): number {
  return STRATEGIST_CONFIG.fireDiameterUnits[technique] * BATTLE_RANGE_UNIT_PX / 2;
}
function activeEnemy(attacker: Soldier, target: Soldier): boolean {
  return isValidCombatTarget(attacker, target) && target.state !== "HEALING" && target.state !== "REJOINING";
}
function enemiesInRadius(attacker: Soldier, soldiers: readonly Soldier[], x: number, y: number, radius: number): Soldier[] {
  return soldiers.filter((target) => activeEnemy(attacker, target) && Math.hypot(target.x - x, target.y - y) <= radius);
}
function nearestEnemy(attacker: Soldier, soldiers: readonly Soldier[]): Soldier | null {
  return soldiers.filter((target) => activeEnemy(attacker, target))
    .sort((a, b) => Math.hypot(a.x - attacker.x, a.y - attacker.y) - Math.hypot(b.x - attacker.x, b.y - attacker.y))[0] ?? null;
}
export function getStrategistFirePlacement(attacker: Soldier, soldiers: readonly Soldier[]): { x: number; y: number; radius: number } | null {
  if (!isStrategistFireTechnique(attacker.technique)) return null;
  const radius = getStrategistFireRadius(attacker.technique); const target = nearestEnemy(attacker, soldiers);
  let dx = target ? target.x - attacker.x : attacker.facingX; let dy = target ? target.y - attacker.y : attacker.facingY;
  const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length;
  const offset = 14 + radius * 0.5;
  return { x: attacker.x + dx * offset, y: attacker.y + dy * offset, radius };
}
export function findStrategistHealTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((target) => target.team === attacker.team && !target.isDead && target.hp > 0 && target.state !== "HEALING"
    && target.hp < target.maxHp && Math.hypot(target.x - attacker.x, target.y - attacker.y) <= STRATEGIST_CONFIG.healRadius);
}
export function canActivateStrategist(attacker: Soldier, soldiers: readonly Soldier[], currentTime: number): boolean {
  if (isStrategistFireTechnique(attacker.technique)) {
    if (currentTime < attacker.strategistFireZoneUntil) return false;
    const placement = getStrategistFirePlacement(attacker, soldiers);
    return Boolean(placement && enemiesInRadius(attacker, soldiers, placement.x, placement.y, placement.radius).length);
  }
  if (attacker.technique === "STRATEGIST_HEAL") return findStrategistHealTargets(attacker, soldiers).length > 0;
  const radius = attacker.technique === "STRATEGIST_FALSE_REPORT" ? STRATEGIST_CONFIG.falseReportRadius : STRATEGIST_CONFIG.sorceryRadius;
  return enemiesInRadius(attacker, soldiers, attacker.x, attacker.y, radius).length > 0;
}
function applyNonLethalDamage(target: Soldier, amount: number): number {
  const applied = Math.min(Math.max(0, amount), Math.max(0, target.hp - 1)); target.hp -= applied; return applied;
}
export function updateStrategistFireZone(zone: StrategistFireZone, soldiers: Soldier[], currentTime: number): string[] {
  if (currentTime >= zone.expiresAt) return [];
  const owner = soldiers.find((soldier) => soldier.id === zone.ownerId); if (!owner || owner.isDead) return [];
  const hitIds: string[] = [];
  for (const target of soldiers) {
    if (!activeEnemy(owner, target) || zone.damagedSoldierIds.has(target.id)
      || Math.hypot(target.x - zone.x, target.y - zone.y) > zone.radius) continue;
    zone.damagedSoldierIds.add(target.id);
    const damage = totalDamageComponents(applyRareDamageImmunity(target, { FIRE: 1 }));
    if (damage <= 0) continue;
    if (applyNonLethalDamage(target, damage) <= 0) continue;
    target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + 250;
    startHitReaction(target, owner, currentTime, 0); hitIds.push(target.id);
  }
  return hitIds;
}
export function updateStrategistFireZones(zones: StrategistFireZone[], soldiers: Soldier[], currentTime: number): { active: StrategistFireZone[]; hitIds: string[] } {
  const active = zones.filter((zone) => currentTime < zone.expiresAt && soldiers.some((soldier) => soldier.id === zone.ownerId && !soldier.isDead));
  return { active, hitIds: active.flatMap((zone) => updateStrategistFireZone(zone, soldiers, currentTime)) };
}
export function executeStrategistAttack(attacker: Soldier, soldiers: Soldier[], _obstacles: readonly BattleObstacle[], _bases: readonly BattleBase[],
  currentTime: number, random: RandomSource, consumeCooldown: boolean): StrategistAttackEvent | null {
  if (!isStrategistTechnique(attacker.technique) || !canActivateStrategist(attacker, soldiers, currentTime)) return null;
  if (consumeCooldown) {
    attacker.specialReadyAt = currentTime + calculateSpecialCooldownMs(attacker.stats.skill);
    if (hasSpecialAbility(attacker, "DOUBLE_SPECIAL") && random() < SPECIAL_ABILITY_CONFIG.doubleSpecialChance)
      attacker.pendingSecondSpecialAt = currentTime + SPECIAL_ABILITY_CONFIG.doubleSpecialDelayMs;
  }
  const event: StrategistAttackEvent = { kind: "STRATEGIST", attackerId: attacker.id, team: attacker.team, technique: attacker.technique,
    x: attacker.x, y: attacker.y, radius: 0, victimIds: [], confusedIds: [], healed: [], fireZone: null };
  if (isStrategistFireTechnique(attacker.technique)) {
    const placement = getStrategistFirePlacement(attacker, soldiers)!;
    const target = nearestEnemy(attacker, soldiers); if (target) { const dx = target.x - attacker.x; const dy = target.y - attacker.y; const l = Math.hypot(dx, dy) || 1; attacker.facingX = dx / l; attacker.facingY = dy / l; }
    const zone: StrategistFireZone = { id: `${attacker.id}:${currentTime}`, ownerId: attacker.id, team: attacker.team,
      ...placement, createdAt: currentTime, expiresAt: currentTime + STRATEGIST_CONFIG.fireZoneDurationMs, damagedSoldierIds: new Set() };
    attacker.strategistFireZoneUntil = zone.expiresAt; event.x = zone.x; event.y = zone.y; event.radius = zone.radius; event.fireZone = zone;
    event.victimIds = updateStrategistFireZone(zone, soldiers, currentTime); return event;
  }
  if (attacker.technique === "STRATEGIST_HEAL") {
    event.radius = STRATEGIST_CONFIG.healRadius;
    for (const target of findStrategistHealTargets(attacker, soldiers)) { target.hp += 1; event.healed.push({ targetId: target.id, amount: 1 }); }
    return event;
  }
  event.radius = attacker.technique === "STRATEGIST_FALSE_REPORT" ? STRATEGIST_CONFIG.falseReportRadius : STRATEGIST_CONFIG.sorceryRadius;
  const targets = enemiesInRadius(attacker, soldiers, attacker.x, attacker.y, event.radius);
  for (const target of targets) {
    if (attacker.technique === "STRATEGIST_SORCERY" && applyNonLethalDamage(target, 1) > 0) {
      target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + 250; startHitReaction(target, attacker, currentTime, 0); event.victimIds.push(target.id);
    }
    applyConfusion(target); event.confusedIds.push(target.id);
  }
  return event;
}
