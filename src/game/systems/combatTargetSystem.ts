import type { Soldier } from "../types";
import { clearApproachRuntime } from "./engagementPositioningSystem";

/** New attacks/acquisitions require a live HP-positive target. */
export function isValidCombatTarget(attacker: Soldier, target: Soldier | null | undefined): target is Soldier {
  return Boolean(target && target !== attacker && target.team !== attacker.team && !target.isDead && target.hp > 0
    && target.state !== "HEALING");
}

/**
 * Existing raw l references survive a newly fatal hit until tiky()/led(). During
 * that k reaction window HP may already be 0 while isDead is still false.
 */
export function isTrackableCombatTarget(attacker: Soldier, target: Soldier | null | undefined): target is Soldier {
  return Boolean(target && target !== attacker && target.team !== attacker.team && !target.isDead
    && target.state !== "HEALING");
}

export function clearStaleCombatTarget(pursuer: Soldier): void {
  pursuer.targetId = null; pursuer.engagementStartedAt = null; pursuer.engagementOriginX = null; pursuer.engagementOriginY = null;
  pursuer.moveTargetX = null; pursuer.moveTargetY = null; clearApproachRuntime(pursuer);
}
export function invalidateCombatTargetForAll(targetId: string, soldiers: readonly Soldier[]): void {
  for (const pursuer of soldiers) if (pursuer.targetId === targetId || pursuer.preferredApproachTargetId === targetId) clearStaleCombatTarget(pursuer);
}
