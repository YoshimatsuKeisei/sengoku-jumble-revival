import {
  battlefieldSourceDistanceToWorldX,
  battlefieldSourceDistanceToWorldY,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { BattleObstacle, Soldier } from "../types";
import { cancelAttack } from "./attackRuntime";
import { applyDamage } from "./combatSystem";
import { isDamageGuarded } from "./defenseSystem";
import { applyForcedMovement } from "./movementSystem";
import { startHitReaction, SWF_HIT_REACTION_TICKS } from "./reactionSystem";
import { calculateNormalAttackDamage, hasSpecialAbility } from "./specialAbilitySystem";
import { isWithinNormalContact, swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_NORMAL_CONTACT_MODE = 0;
export const SWF_NORMAL_CONTACT_K_TICKS = 10;
export const SWF_NORMAL_CONTACT_IMPULSE_DECAY = 0.7;
export const SWF_NORMAL_CONTACT_IMPULSE_UNITS = 10;
export const SWF_IRON_WALL_GUARD_IMPULSE_UNITS = 5;

// Raw global fx/fy arrays, indexed by fi=1..8. Index 0 is the SWF's unused
// sentinel. The diagonal components are exactly +/-0.6 rather than normalized.
export const SWF_DIRECTION_FX = [0, -1, -0.6, 0, 0.6, 1, 0.6, 0, -0.6] as const;
export const SWF_DIRECTION_FY = [0, 0, -0.6, -1, -0.6, 0, 0.6, 1, 0.6] as const;

interface RawImpulseRuntime {
  startedAt: number;
  fi: number;
  initialUnits: number;
  appliedTicks: number;
}

const rawImpulses = new WeakMap<Soldier, RawImpulseRuntime>();

export interface RawNormalContactAttackResult {
  resolved: boolean;
  guarded: boolean;
  appliedDamage: number;
  defenderFi: number;
}

function rawDirectionIndex(defender: Soldier, attacker: Soldier): number {
  const a = battlefieldWorldPointToSource(attacker);
  const d = battlefieldWorldPointToSource(defender);
  const angle = Math.atan2(a.y - d.y, a.x - d.x);
  let fi = Math.round(angle / 0.75) + 5;
  if (fi > 8) fi -= 8;
  if (fi < 1) fi += 8;
  return fi;
}

function oppositeFi(fi: number): number {
  const value = fi + 4;
  return value > 8 ? value - 8 : value;
}

function startRawImpulse(soldier: Soldier, fi: number, initialUnits: number, currentTime: number): void {
  rawImpulses.set(soldier, { startedAt: currentTime, fi, initialUnits, appliedTicks: 0 });
}

function rawKResumeAt(currentTime: number): number {
  // atck() sets k=10 after d() already passed its k==0 gate. The following ten
  // d() calls consume k=10..1; ordinary d() behavior resumes on the next call.
  return currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS + 1);
}

function applyRawKLock(soldier: Soldier, currentTime: number): void {
  soldier.abilityActionLockUntil = rawKResumeAt(currentTime);
}

function setAttackerPoseLock(attacker: Soldier, defender: Soldier, currentTime: number): void {
  cancelAttack(attacker);
  attacker.combatActionState = "ATTACK_RECOVERY";
  attacker.attackStartedAt = currentTime;
  attacker.attackHitAt = currentTime;
  attacker.attackRecoveryEndsAt = rawKResumeAt(currentTime);
  attacker.attackTargetKind = "SOLDIER";
  attacker.attackTargetId = defender.id;
  attacker.attackHitApplied = true;
  attacker.lastAttackAt = currentTime;
}

export function isRawNormalContactKLocked(soldier: Soldier, currentTime: number): boolean {
  return currentTime < soldier.abilityActionLockUntil;
}

export function resolveRawNormalContactAttack(
  attacker: Soldier,
  defender: Soldier,
  currentTime: number,
  random: RandomSource = Math.random,
): RawNormalContactAttackResult {
  if (attacker.isDead || defender.isDead || attacker.hp <= 0 || defender.hp <= 0
    || attacker.team === defender.team || !isWithinNormalContact(attacker, defender)) {
    return { resolved: false, guarded: false, appliedDamage: 0, defenderFi: 0 };
  }

  const defenderFi = rawDirectionIndex(defender, attacker);
  const attackerFi = oppositeFi(defenderFi);
  const guarded = isDamageGuarded(defender, "NORMAL_ATTACK", random);
  const ironWallGuard = guarded && hasSpecialAbility(defender, "IRON_WALL");

  applyRawKLock(defender, currentTime);
  applyRawKLock(attacker, currentTime);
  setAttackerPoseLock(attacker, defender, currentTime);

  defender.facingX = SWF_DIRECTION_FX[defenderFi];
  defender.facingY = SWF_DIRECTION_FY[defenderFi];
  attacker.facingX = SWF_DIRECTION_FX[attackerFi];
  attacker.facingY = SWF_DIRECTION_FY[attackerFi];

  startRawImpulse(
    defender,
    defenderFi,
    ironWallGuard ? SWF_IRON_WALL_GUARD_IMPULSE_UNITS : SWF_NORMAL_CONTACT_IMPULSE_UNITS,
    currentTime,
  );
  if (ironWallGuard) startRawImpulse(attacker, attackerFi, SWF_NORMAL_CONTACT_IMPULSE_UNITS, currentTime);

  if (guarded) {
    cancelAttack(defender);
    defender.combatFeedbackMarker = "S";
    defender.combatFeedbackUntil = currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS);
    return { resolved: true, guarded: true, appliedDamage: 0, defenderFi };
  }

  const result = applyDamage(defender, calculateNormalAttackDamage(attacker, defender), attacker);
  defender.combatFeedbackMarker = "H";
  defender.combatFeedbackUntil = currentTime + swfLogicTicksToMs(SWF_NORMAL_CONTACT_K_TICKS);
  // Normal atck() already owns the raw fx/fy impulse, so keep the existing
  // k=10 hit-state/death-order machinery but suppress its legacy linear push.
  startHitReaction(defender, attacker, currentTime, 0, random, "NORMAL_ATTACK");
  return { resolved: true, guarded: false, appliedDamage: result.appliedDamage, defenderFi };
}

export function updateRawNormalContactImpulses(
  soldiers: readonly Soldier[],
  obstacles: readonly BattleObstacle[],
  currentTime: number,
): void {
  const tickMs = swfLogicTicksToMs(1);
  for (const soldier of soldiers) {
    const runtime = rawImpulses.get(soldier);
    if (!runtime) continue;
    const elapsedTicks = Math.min(
      SWF_HIT_REACTION_TICKS,
      Math.max(0, Math.floor((currentTime - runtime.startedAt) / tickMs + 1e-9)),
    );
    while (runtime.appliedTicks < elapsedTicks) {
      const decay = SWF_NORMAL_CONTACT_IMPULSE_DECAY ** runtime.appliedTicks;
      const sourceDx = SWF_DIRECTION_FX[runtime.fi] * runtime.initialUnits * decay;
      const sourceDy = SWF_DIRECTION_FY[runtime.fi] * runtime.initialUnits * decay;
      const worldDx = battlefieldSourceDistanceToWorldX(sourceDx);
      const worldDy = battlefieldSourceDistanceToWorldY(sourceDy);
      const distance = Math.hypot(worldDx, worldDy);
      if (distance > 0) applyForcedMovement(soldier, worldDx, worldDy, distance, obstacles);
      runtime.appliedTicks += 1;
    }
    if (runtime.appliedTicks >= SWF_NORMAL_CONTACT_K_TICKS) rawImpulses.delete(soldier);
  }
}
