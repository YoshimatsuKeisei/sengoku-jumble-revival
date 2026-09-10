import { battlefieldWorldPointToSwf } from "../battlefieldLayout";
import type { RandomSource } from "../stats/soldierStats";
import type { AttackKind, Soldier } from "../types";
import { isValidCombatTarget } from "./combatTargetSystem";
import { startHitReaction } from "./reactionSystem";
import { getTechniqueProfile, SWF_GRID_CELL_SIZE, swfLogicTicksToMs } from "./techniqueCombatProfiles";

export const SWF_RANGED_TARGET_K_TICKS = 10;
export const SWF_RANGED_TARGET_IMPULSE_UNITS = 10;

function isRawRangedCandidate(attacker: Soldier, candidate: Soldier | null | undefined): candidate is Soldier {
  return Boolean(isValidCombatTarget(attacker, candidate) && candidate?.state !== "REJOINING");
}

/**
 * Direct scd(): an existing l is not replaced just because it is outside tk.
 * Only l == -1 enters the local f[][] scan.
 */
export function findRawAiRangedTarget(
  attacker: Soldier,
  soldiers: readonly Soldier[],
  rangeWorld: number,
  allowUnlatchedScan = true,
): Soldier | null {
  if (attacker.targetId !== null) {
    const latched = soldiers.find((candidate) => candidate.id === attacker.targetId) ?? null;
    if (!isRawRangedCandidate(attacker, latched)) return null;
    return Math.hypot(latched.x - attacker.x, latched.y - attacker.y) < rangeWorld ? latched : null;
  }
  if (!allowUnlatchedScan) return null;

  const rangeCells = getTechniqueProfile(attacker.technique).rangeCells;
  if (rangeCells === null) return null;

  // Raw scd() centers its no-l scan on the predicted next position:
  // round((_x + x) / 36), round((_y + y) / 36).
  const origin = battlefieldWorldPointToSwf({
    x: attacker.x + attacker.velocityX,
    y: attacker.y + attacker.velocityY,
  });
  const startCellX = Math.round(origin.x / SWF_GRID_CELL_SIZE) - Math.floor(rangeCells / 2);
  const startCellY = Math.round(origin.y / SWF_GRID_CELL_SIZE) - Math.floor(rangeCells / 2);

  for (let xOffset = 0; xOffset <= rangeCells; xOffset += 1) {
    for (let yOffset = 0; yOffset <= rangeCells; yOffset += 1) {
      const cellX = startCellX + xOffset;
      const cellY = startCellY + yOffset;
      const candidate = soldiers.find((value) => {
        if (!isRawRangedCandidate(attacker, value)) return false;
        const source = battlefieldWorldPointToSwf(value);
        return Math.round(source.x / SWF_GRID_CELL_SIZE) === cellX
          && Math.round(source.y / SWF_GRID_CELL_SIZE) === cellY;
      });
      if (candidate) return candidate;
    }
  }
  return null;
}

/** Raw ac16/ac17: predicted primary cell followed by the 3x3 f[][] neighborhood. */
export function getRawExplosionGridVictims(
  attacker: Soldier,
  primary: Soldier,
  soldiers: readonly Soldier[],
): Soldier[] {
  const predicted = battlefieldWorldPointToSwf({
    x: primary.x + primary.velocityX,
    y: primary.y + primary.velocityY,
  });
  const startCellX = Math.round(predicted.x / SWF_GRID_CELL_SIZE) - 1;
  const startCellY = Math.round(predicted.y / SWF_GRID_CELL_SIZE) - 1;
  const victims: Soldier[] = [];
  const used = new Set<string>();

  for (let xOffset = 0; xOffset <= 2; xOffset += 1) {
    for (let yOffset = 0; yOffset <= 2; yOffset += 1) {
      const cellX = startCellX + xOffset;
      const cellY = startCellY + yOffset;
      const candidate = soldiers.find((value) => {
        if (used.has(value.id) || value === attacker || value.team === attacker.team || value.isDead || value.hp <= 0
          || value.state === "REJOINING") return false;
        const source = battlefieldWorldPointToSwf(value);
        return Math.round(source.x / SWF_GRID_CELL_SIZE) === cellX
          && Math.round(source.y / SWF_GRID_CELL_SIZE) === cellY;
      });
      if (candidate) {
        used.add(candidate.id);
        victims.push(candidate);
      }
    }
  }
  return victims;
}

/**
 * Safe b191 port: raw ranged atck() gives the defender k=10 on both hit and guard.
 * This probe reproduces that action lock / hit-stun ordering without importing the
 * old f5 rawCombatImpulse movement layer. The confirmed 10-unit fx/fy displacement
 * is deliberately deferred to a separate visual-regression probe.
 */
export function startRawRangedTargetResponse(
  target: Soldier,
  attacker: Soldier,
  currentTime: number,
  random: RandomSource,
  attackKind: AttackKind,
): void {
  const dx = attacker.x - target.x;
  const dy = attacker.y - target.y;
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    target.facingX = dx / length;
    target.facingY = dy / length;
  }
  target.abilityActionLockUntil = Math.max(
    target.abilityActionLockUntil,
    currentTime + swfLogicTicksToMs(SWF_RANGED_TARGET_K_TICKS),
  );
  startHitReaction(target, attacker, currentTime, 0, random, attackKind);
}
