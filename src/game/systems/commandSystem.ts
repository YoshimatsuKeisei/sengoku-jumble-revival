import { BATTLEFIELD_CONFIG, COMMAND_CONFIG, NINJA_CONFIG } from "../config";
import type { Soldier, TemporaryOrderType } from "../types";
import { clearEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";
import { clearConfusion } from "./confusionSystem";

function canReceiveOrder(soldier: Soldier, player: Soldier): boolean {
  return soldier.team === player.team
    && soldier.controller === "ai"
    && !soldier.isDead
    && soldier.state === "NORMAL";
}

export function findCommandTargets(player: Soldier, soldiers: Soldier[], radius: number): Soldier[] {
  return soldiers.filter((soldier) => canReceiveOrder(soldier, player)
    && Math.hypot(soldier.x - player.x, soldier.y - player.y) <= radius);
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
  const targets = findCommandTargets(player, soldiers, COMMAND_CONFIG.advanceRadius);
  for (const soldier of targets) applyOrder(soldier, "ADVANCE", player, currentTime, COMMAND_CONFIG.commandDurationMs);
  return targets;
}

export function issueDefendCommand(player: Soldier, soldiers: Soldier[], currentTime: number): Soldier[] {
  const targets = findCommandTargets(player, soldiers, COMMAND_CONFIG.defendRadius);
  for (const soldier of targets) applyOrder(soldier, "DEFEND_ORDER", player, currentTime, COMMAND_CONFIG.commandDurationMs);
  return targets;
}

export function issueRallyCommand(player: Soldier, soldiers: Soldier[], currentTime: number): Soldier[] {
  const targets = soldiers.filter((soldier) => canReceiveOrder(soldier, player));
  for (const soldier of targets) applyOrder(soldier, "RALLY", player, currentTime, COMMAND_CONFIG.rallyMaxDurationMs);
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

  clearEngagement(soldier);
  if (order.type === "ADVANCE" || order.type === "NINJA_BARRIER_CHARGE" || order.type === "JINTO_CHARGE") {
    soldier.moveTargetX = soldier.team === "player" ? BATTLEFIELD_CONFIG.enemyHomeX : BATTLEFIELD_CONFIG.playerHomeX;
    soldier.moveTargetY = soldier.y;
    return;
  }
  if (player.isDead || player.state !== "NORMAL") {
    clearTemporaryOrder(soldier);
    return;
  }
  const distanceToPlayer = Math.hypot(soldier.x - player.x, soldier.y - player.y);
  if (distanceToPlayer >= COMMAND_CONFIG.rallyInnerRadius && distanceToPlayer <= COMMAND_CONFIG.rallyOuterRadius) {
    clearTemporaryOrder(soldier);
    return;
  }
  const offset = rallyOffset(soldier);
  soldier.moveTargetX = player.x + offset.x;
  soldier.moveTargetY = player.y + offset.y;
}

export function updateTemporaryOrders(soldiers: Soldier[], player: Soldier, currentTime: number): void {
  for (const soldier of soldiers) updateTemporaryOrder(soldier, player, currentTime);
}
