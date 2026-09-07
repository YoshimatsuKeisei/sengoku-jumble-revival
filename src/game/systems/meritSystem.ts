import { battlefieldSourcePointToWorld } from "../battlefieldLayout";
import type { RecoveryTargetKind, Soldier } from "../types";

export const SWF_PLAYER_DEFENSE_BOUNDARY_X = 680;
export const PLAYER_DEFENSE_BOUNDARY_WORLD_X = battlefieldSourcePointToWorld({ x: SWF_PLAYER_DEFENSE_BOUNDARY_X, y: 0 }).x;

export function recordNormalCombatResult(winner: Soldier, loser: Soldier): void {
  winner.merits.battleWins += 1;
  loser.merits.battleLosses += 1;
  for (const participant of [winner, loser]) {
    if (participant.team === "player" && participant.x < PLAYER_DEFENSE_BOUNDARY_WORLD_X) {
      participant.merits.defense += 1;
    }
  }
}

export function recordSoldierDamage(attacker: Soldier | undefined, target: Soldier, appliedDamage: number): void {
  if (!attacker || attacker.team === target.team || appliedDamage <= 0) return;
  attacker.merits.soldierDamage += appliedDamage;
  target.lastDamageSourceId = attacker.id;
}

export function recordBattleOut(attacker: Soldier | undefined, target: Soldier): void {
  if (!attacker || attacker.team === target.team) return;
  attacker.merits.kills += 1;
}

export function recordRetreatTransition(
  retreater: Soldier,
  soldiers: readonly Soldier[],
  targetKind: RecoveryTargetKind,
): void {
  const sourceId = retreater.lastDamageSourceId;
  retreater.lastDamageSourceId = null;
  if (!sourceId || targetKind !== "BASE_GATE") return;
  const attacker = soldiers.find((candidate) => candidate.id === sourceId);
  if (attacker && attacker.team !== retreater.team) attacker.merits.repels += 1;
}

export function recordBaseAttack(attacker: Soldier, baseWasCaptured: boolean): void {
  attacker.merits.baseDamage += 1;
  if (baseWasCaptured) attacker.merits.baseDamage += 2;
}

export function recordRecovery(source: Soldier, target: Soldier, appliedHealing: number): void {
  if (source.team !== target.team || appliedHealing <= 0) return;
  source.merits.recovery += appliedHealing;
}

/** sz(5/6)-style small recovery awards one rsk event even when s20 heals two HP. */
export function recordSmallRecoveryPulse(source: Soldier, target: Soldier, appliedHealing: number): void {
  if (source.team !== target.team || appliedHealing <= 0) return;
  source.merits.recovery += 1;
}
