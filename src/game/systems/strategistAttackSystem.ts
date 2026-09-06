import { STRATEGIST_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleBase, BattleObstacle, Soldier, Team, UnitTechnique } from "../types";
import { applyConfusion } from "./confusionSystem";
import { applyRareDamageImmunity, totalDamageComponents } from "./damageComponentSystem";
import { isValidCombatTarget } from "./combatTargetSystem";
import { startHitReaction } from "./reactionSystem";
import { hasSpecialAbility } from "./specialAbilitySystem";
import { applyDamage } from "./combatSystem";
import { beginTechniqueAction } from "./combatGaugeSystem";
import { getTechniqueAreaCenter, getTechniqueAreaWorld, isPointInTechniqueRectangle } from "./techniqueCombatProfiles";

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
  return getTechniqueAreaWorld(technique).width / 2;
}
function activeEnemy(attacker: Soldier, target: Soldier): boolean {
  return isValidCombatTarget(attacker, target) && target.state !== "HEALING" && target.state !== "REJOINING";
}
function enemiesInRadius(attacker: Soldier, soldiers: readonly Soldier[], x: number, y: number, _radius: number): Soldier[] {
  return soldiers.filter((target) => activeEnemy(attacker, target)
    && isPointInTechniqueRectangle(attacker.technique, { x, y }, target));
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
  attacker.facingX = dx; attacker.facingY = dy;
  return { ...getTechniqueAreaCenter(attacker.technique, attacker), radius };
}
export function findStrategistHealTargets(attacker: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((target) => target.team === attacker.team && !target.isDead && target.hp > 0 && target.state !== "HEALING"
    && target.hp < target.maxHp
    && isPointInTechniqueRectangle("STRATEGIST_HEAL", getTechniqueAreaCenter("STRATEGIST_HEAL", attacker), target));
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
  void zone; void soldiers; void currentTime;
  // Damage is applied by the three scheduled SWF processing waves. The zone
  // remains a visual lifetime record only, so render updates cannot deal damage.
  return [];
}
export function updateStrategistFireZones(zones: StrategistFireZone[], soldiers: Soldier[], currentTime: number): { active: StrategistFireZone[]; hitIds: string[] } {
  const active = zones.filter((zone) => currentTime < zone.expiresAt && soldiers.some((soldier) => soldier.id === zone.ownerId && !soldier.isDead));
  return { active, hitIds: active.flatMap((zone) => updateStrategistFireZone(zone, soldiers, currentTime)) };
}
export function executeStrategistAttack(attacker: Soldier, soldiers: Soldier[], _obstacles: readonly BattleObstacle[], _bases: readonly BattleBase[],
  currentTime: number, random: RandomSource, consumeCooldown: boolean, isWave = false): StrategistAttackEvent | null {
  if (!isStrategistTechnique(attacker.technique)) return null;
  if (consumeCooldown && !beginTechniqueAction(attacker, currentTime, random, true)) return null;
  const event: StrategistAttackEvent = { kind: "STRATEGIST", attackerId: attacker.id, team: attacker.team, technique: attacker.technique,
    x: attacker.x, y: attacker.y, radius: 0, victimIds: [], confusedIds: [], healed: [], fireZone: null };
  if (isStrategistFireTechnique(attacker.technique)) {
    const placement = isWave
      ? { ...getTechniqueAreaCenter(attacker.technique, attacker), radius: getStrategistFireRadius(attacker.technique) }
      : getStrategistFirePlacement(attacker, soldiers)!;
    event.x = placement.x; event.y = placement.y; event.radius = placement.radius;
    if (!isWave) {
      const zone: StrategistFireZone = { id: `${attacker.id}:${currentTime}`, ownerId: attacker.id, team: attacker.team,
        ...placement, createdAt: currentTime, expiresAt: currentTime + STRATEGIST_CONFIG.fireZoneDurationMs, damagedSoldierIds: new Set() };
      attacker.strategistFireZoneUntil = zone.expiresAt; event.fireZone = zone;
    }
    for (const target of enemiesInRadius(attacker, soldiers, placement.x, placement.y, placement.radius)) {
      const damage = totalDamageComponents(applyRareDamageImmunity(target, {
        FIRE: 1,
        DIRECT_SPECIAL: Number(hasSpecialAbility(attacker, "MIGHT")),
      }));
      if (damage <= 0 || applyNonLethalDamage(target, damage) <= 0) continue;
      target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + 250;
      startHitReaction(target, attacker, currentTime, 0); event.victimIds.push(target.id);
    }
    return event;
  }
  if (attacker.technique === "STRATEGIST_HEAL") {
    event.radius = STRATEGIST_CONFIG.healRadius;
    for (const target of findStrategistHealTargets(attacker, soldiers)) {
      const amount = Math.min(1 + Number(hasSpecialAbility(target, "RECOVERY_BOOST")), target.maxHp - target.hp);
      target.hp += amount; if (amount > 0) event.healed.push({ targetId: target.id, amount });
    }
    return event;
  }
  event.radius = getTechniqueAreaWorld(attacker.technique).width / 2;
  const targets = enemiesInRadius(attacker, soldiers, attacker.x, attacker.y, event.radius);
  for (const target of targets) {
    if (attacker.technique === "STRATEGIST_SORCERY") {
      applyDamage(target, 1 + Number(hasSpecialAbility(attacker, "MIGHT")));
      target.combatFeedbackMarker = "H"; target.combatFeedbackUntil = currentTime + 250; startHitReaction(target, attacker, currentTime, 0); event.victimIds.push(target.id);
    }
    applyConfusion(target); event.confusedIds.push(target.id);
  }
  return event;
}
