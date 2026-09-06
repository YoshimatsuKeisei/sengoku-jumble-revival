import type { BattleBase, Soldier } from "../types";
import { getTeamForwardSign } from "./battlefieldGeometry";
import { applyForcedMovement } from "./movementSystem";
import { BASE_CONTACT_CONFIG } from "../config";
import { battlefieldSourceDistanceToWorldX } from "../battlefieldLayout";
import { countRosterSlotAbility } from "./specialAbilitySystem";

export const BASE_ATTACK_BOUNCE_DISTANCE = battlefieldSourceDistanceToWorldX(BASE_CONTACT_CONFIG.baseBounceSourceDistance);

export function getBaseAttackBounceDistance(defendingSoldiers: readonly Soldier[]): number {
  const fortifyHolders = countRosterSlotAbility(defendingSoldiers, defendingSoldiers[0]?.team ?? "player", "FORTIFY");
  return battlefieldSourceDistanceToWorldX(
    BASE_CONTACT_CONFIG.baseBounceSourceDistance
      + fortifyHolders * BASE_CONTACT_CONFIG.fortifyBounceSourceDistance,
  );
}

export function applyBaseAttackBounce(
  attacker: Soldier,
  attackedBase: BattleBase,
  defendingSoldiers: readonly Soldier[] = [],
): void {
  const outwardX = getTeamForwardSign(attackedBase.team);
  applyForcedMovement(attacker, outwardX, 0,
    defendingSoldiers.length > 0 ? getBaseAttackBounceDistance(defendingSoldiers) : BASE_ATTACK_BOUNCE_DISTANCE);
  attacker.facingX = -outwardX;
  attacker.facingY = 0;
}
