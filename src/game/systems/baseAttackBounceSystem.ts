import type { BattleBase, Soldier } from "../types";
import { getTeamForwardSign } from "./battlefieldGeometry";
import { CAVALRY_CHARGE_KNOCKBACK } from "./cavalryChargeSystem";
import { applyForcedMovement } from "./movementSystem";

export const BASE_ATTACK_BOUNCE_DISTANCE = CAVALRY_CHARGE_KNOCKBACK;

export function applyBaseAttackBounce(attacker: Soldier, attackedBase: BattleBase): void {
  const outwardX = getTeamForwardSign(attackedBase.team);
  applyForcedMovement(attacker, outwardX, 0, BASE_ATTACK_BOUNCE_DISTANCE);
  attacker.facingX = -outwardX;
  attacker.facingY = 0;
}
