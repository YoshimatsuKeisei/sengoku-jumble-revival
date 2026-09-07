import { REACTION_CONFIG, SOLDIER_RADIUS, SPECIAL_ABILITY_CONFIG } from "../config";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleObstacle, Soldier, Team } from "../types";
import { cancelAttack } from "./attackRuntime";
import { applyForcedMovement } from "./movementSystem";
import { rosterSlotDrawHasAbility } from "./specialAbilitySystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_TRAP_ACTION_LOCK_TICKS = 10;
export const SWF_TRAP_STATE_TICKS = 20;

function fixedFenceOwner(fence: BattleObstacle): Team | null {
  if (fence.id.startsWith("player-")) return "player";
  if (fence.id.startsWith("enemy-")) return "enemy";
  return null;
}

function isTouchingFence(soldier: Soldier, fence: BattleObstacle): boolean {
  const x = Math.max(fence.x, Math.min(soldier.x, fence.x + fence.width));
  const y = Math.max(fence.y, Math.min(soldier.y, fence.y + fence.height));
  return Math.hypot(soldier.x - x, soldier.y - y) <= SOLDIER_RADIUS + 0.5;
}

function applyTrapEffect(invader: Soldier, currentTime: number, fences: readonly BattleObstacle[]): void {
  invader.hp = Math.max(2, invader.hp - SPECIAL_ABILITY_CONFIG.trapDamage);
  invader.hpBarHp = invader.hp;
  cancelAttack(invader);
  invader.activeSpecialTechnique = null;
  invader.specialWavesRemaining = 0;
  invader.nextSpecialWaveAt = null;
  invader.abilityActionLockUntil = Math.max(invader.abilityActionLockUntil,
    currentTime + swfLogicTicksToMs(SWF_TRAP_ACTION_LOCK_TICKS));
  invader.trapStateUntil = currentTime + swfLogicTicksToMs(SWF_TRAP_STATE_TICKS);
  invader.combatFeedbackMarker = "H";
  invader.combatFeedbackUntil = invader.abilityActionLockUntil;
  applyForcedMovement(invader, invader.team === "player" ? -1 : 1, 0,
    REACTION_CONFIG.knockbackDistance, fences);
}

/**
 * Checks TRAP only when a soldier starts touching an enemy-owned fixed fence.
 * Remaining in enemy territory or remaining in contact never re-rolls it.
 */
export function updateEnemyFenceTrapContacts(
  soldiers: Soldier[], fences: readonly BattleObstacle[], currentTime: number,
  random: RandomSource = Math.random,
): string[] {
  const triggered: string[] = [];
  for (const invader of soldiers) {
    if (invader.isDead || invader.hp <= 0) continue;
    const touching = fences.filter((fence) => {
      const owner = fixedFenceOwner(fence);
      return owner !== null && owner !== invader.team && isTouchingFence(invader, fence);
    });
    const previousIds = new Set(invader.touchingEnemyFenceIds);
    invader.touchingEnemyFenceIds = touching.map((fence) => fence.id);
    if (invader.state !== "NORMAL" || invader.reactionState !== "NONE"
      || currentTime < invader.trapStateUntil) continue;
    for (const fence of touching) {
      if (previousIds.has(fence.id)) continue;
      const defendingTeam = fixedFenceOwner(fence)!;
      if (!rosterSlotDrawHasAbility(soldiers, defendingTeam, "TRAP", 2, random)) continue;
      applyTrapEffect(invader, currentTime, fences);
      triggered.push(invader.id);
      break;
    }
  }
  return triggered;
}
