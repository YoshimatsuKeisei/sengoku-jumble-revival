import { BATTLEFIELD_CONFIG, COMMAND_CONFIG, NINJA_CONFIG } from "../config";
import type { Soldier, TemporaryOrderType } from "../types";
import { clearEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";
import { clearConfusion } from "./confusionSystem";
import { isInsideSupportRectangle } from "./specialAbilitySystem";
import { battlefieldWorldPointToSource } from "../battlefieldLayout";

export const SWF_GATHER_TARGET_MAX_X = 1286;
export const SWF_GATHER_ARRIVAL_MANHATTAN = 50;

function canReceiveOrder(soldier: Soldier, player: Soldier): boolean {
  return soldier.team === player.team
    && soldier.controller === "ai"
    && !soldier.isDead
    && soldier.state === "NORMAL";
}

export function findCommandTargets(player: Soldier, soldiers: readonly Soldier[]): Soldier[] {
  return soldiers.filter((soldier) => canReceiveOrder(soldier, player)
    && isInsideSupportRectangle(player, soldier));
}

function applyOrder(soldier: Soldier, type: TemporaryOrderType, player: Soldier, currentTime: number, duration: number): void {
  clearConfusion(soldier, type === "NINJA_BARRIER_CHARGE" ? "BARRIER_CHARGE_ORDER" : "PLAYER_COMMAND");
  cancelAttack(soldier);
  soldier.temporaryOrder = {
    type,
    issuedAt: currentTime,
    expiresAt: currentTime + duration,
    sourceX: player.x,
    sourceY: player.y,
  };
  // Movement orders take priority over the previous combat destination.
  clearEngagement(soldier);
}

export function issueNinjaBarrierCharge(soldier: Soldier, source: Soldier, currentTime: number): void {
  applyOrder(soldier, "NINJA_BARRIER_CHARGE", source, currentTime, NINJA_CONFIG.barrierChargeDurationMs);
}

export function issueAdvanceCommand(player: Soldier, soldiers: Soldier[], currentTime: number): Soldier[] {
  const targets = findCommandTargets(player, soldiers);
  for (const soldier of targets) applyOrder(soldier, "ADVANCE", player, currentTime, Number.POSITIVE_INFINITY);
  return targets;
}

export function issueDefendCommand(player: Soldier, soldiers: Soldier[], currentTime: number): Soldier[] {
  const targets = findCommandTargets(player, soldiers);
  for (const soldier of targets) applyOrder(soldier, "DEFEND_ORDER", player, currentTime, Number.POSITIVE_INFINITY);
  return targets;
}

export function issueRetreatCommand(player: Soldier, soldiers: Soldier[], currentTime: number): Soldier[] {
  const targets = findCommandTargets(player, soldiers);
  for (const soldier of targets) applyOrder(soldier, "RETREAT", player, currentTime, COMMAND_CONFIG.commandDurationMs);
  return targets;
}

export function issueRallyCommand(player: Soldier, soldiers: Soldier[], currentTime: number): Soldier[] {
  const targets = findCommandTargets(player, soldiers).filter((soldier) => {
    const source = battlefieldWorldPointToSource(soldier);
    return source.x < SWF_GATHER_TARGET_MAX_X && !soldier.isConfused;
  });
  for (const soldier of targets) applyOrder(soldier, "RALLY", player, currentTime, Number.POSITIVE_INFINITY);
  return targets;
}

export function clearTemporaryOrder(soldier: Soldier): void {
  soldier.temporaryOrder = null;
  clearEngagement(soldier);
  soldier.moveTargetX = null;
  soldier.moveTargetY = null;
}

function rallyOffset(soldier: Soldier): { x: number; y: number } {
  let hash = 0;
  for (const character of soldier.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const angle = (hash % 360) * Math.PI / 180;
  const radius = (COMMAND_CONFIG.rallyInnerRadius + COMMAND_CONFIG.rallyOuterRadius) / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function updateTemporaryOrder(soldier: Soldier, player: Soldier, currentTime: number): void {
  const order = soldier.temporaryOrder;
  if (!order) return;
  if (soldier.isDead || soldier.state !== "NORMAL" || currentTime >= order.expiresAt) {
    clearTemporaryOrder(soldier);
    return;
  }

  if (order.type === "DEFEND_ORDER") {
    if (soldier.targetId) return;
    const offset = rallyOffset(soldier);
    soldier.moveTargetX = player.x + offset.x;
    soldier.moveTargetY = player.y + offset.y;
    return;
  }

  if (order.type === "ADVANCE" && (soldier.targetId !== null || soldier.combatActionState !== "IDLE")) {
    clearTemporaryOrder(soldier);
    return;
  }
  clearEngagement(soldier);
  if (order.type === "RETREAT") {
    soldier.moveTargetX = soldier.team === "player" ? BATTLEFIELD_CONFIG.playerHomeX : BATTLEFIELD_CONFIG.enemyHomeX;
    soldier.moveTargetY = soldier.y;
    return;
  }
  if (order.type === "ADVANCE" || order.type === "NINJA_BARRIER_CHARGE" || order.type === "JINTO_CHARGE") {
    soldier.moveTargetX = soldier.team === "player" ? BATTLEFIELD_CONFIG.enemyHomeX : BATTLEFIELD_CONFIG.playerHomeX;
    soldier.moveTargetY = soldier.y;
    return;
  }
  if (player.isDead || player.state !== "NORMAL") {
    clearTemporaryOrder(soldier);
    return;
  }
  const soldierSource = battlefieldWorldPointToSource(soldier);
  const gatherSource = battlefieldWorldPointToSource({ x: order.sourceX, y: order.sourceY });
  const distanceToGatherPoint = Math.abs(soldierSource.x - gatherSource.x) + Math.abs(soldierSource.y - gatherSource.y);
  if (distanceToGatherPoint < SWF_GATHER_ARRIVAL_MANHATTAN) {
    clearTemporaryOrder(soldier);
    return;
  }
  soldier.moveTargetX = order.sourceX;
  soldier.moveTargetY = order.sourceY;
}

export function updateTemporaryOrders(soldiers: Soldier[], player: Soldier, currentTime: number): void {
  for (const soldier of soldiers) updateTemporaryOrder(soldier, player, currentTime);
}
