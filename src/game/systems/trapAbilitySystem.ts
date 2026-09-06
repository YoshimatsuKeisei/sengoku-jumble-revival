import { BATTLE_OBSTACLES, REACTION_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import { battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { Soldier, Team } from "../types";
import type { SoldierPosition } from "./baseContactSystem";
import { cancelAttack } from "./attackRuntime";
import { applyForcedMovement } from "./movementSystem";
import { rosterSlotDrawHasAbility } from "./specialAbilitySystem";
import { swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_BATTLEFIELD_CENTER_X = 900;
export const SWF_TRAP_ACTION_LOCK_TICKS = 10;
export const SWF_TRAP_STATE_TICKS = 20;

function defendingTeamForInvader(soldier: Soldier): Team | null {
  const sourceX = battlefieldWorldPointToSource(soldier).x;
  if (soldier.team === "player" && sourceX > SWF_BATTLEFIELD_CENTER_X) return "enemy";
  if (soldier.team === "enemy" && sourceX < SWF_BATTLEFIELD_CENTER_X) return "player";
  return null;
}

export function updateInvaderTrapMovement(
  soldiers: Soldier[], previousPositions: ReadonlyMap<string, SoldierPosition>, currentTime: number,
  random: RandomSource = Math.random,
): string[] {
  const triggered: string[] = [];
  for (const invader of soldiers) {
    const previous = previousPositions.get(invader.id);
    if (!previous || (previous.x === invader.x && previous.y === invader.y) || invader.isDead || invader.hp <= 0
      || invader.state !== "NORMAL" || invader.reactionState !== "NONE" || currentTime < invader.trapStateUntil) continue;
    const defendingTeam = defendingTeamForInvader(invader);
    if (!defendingTeam || !rosterSlotDrawHasAbility(soldiers, defendingTeam, "TRAP", 2, random)) continue;

    invader.hp = Math.max(2, invader.hp - SPECIAL_ABILITY_CONFIG.trapDamage);
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
      REACTION_CONFIG.knockbackDistance, BATTLE_OBSTACLES);
    triggered.push(invader.id);
  }
  return triggered;
}
