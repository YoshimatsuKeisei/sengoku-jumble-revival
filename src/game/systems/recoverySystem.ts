import { BASE_CONFIG, RECOVERY_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import type { BattleBase, Soldier, Team } from "../types";
import type { RandomSource } from "../stats/soldierStats";
import { clearEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";
import { createBattleBase, getBaseForTeam } from "./baseSystem";
import {
  getBaseGatePoint,
  getBaseHealingInteriorRect,
  getPreferredBaseGate,
  getPreferredRejoinPoint,
  hasClearedBaseGateBoundary,
  hasReachedBaseGateApproach,
} from "./battlefieldGeometry";
import { aggregateProcChance, countTeamAbility, handleRetreatStarted, hasSpecialAbility, pulseFriendlyHealing } from "./specialAbilitySystem";
import { invalidateCombatTargetForAll } from "./combatTargetSystem";
import { clearConfusion } from "./confusionSystem";

type Point = { x: number; y: number };

function ownBase(team: Team, bases?: readonly BattleBase[]): BattleBase {
  return bases ? getBaseForTeam(bases, team) : createBattleBase(team);
}

export function recoveryDestinationFor(team: Team, bases?: readonly BattleBase[]): Point {
  const base = ownBase(team, bases);
  return { x: base.x, y: base.y };
}

export function rejoinPointFor(team: Team, y?: number, bases?: readonly BattleBase[]): Point {
  const base = ownBase(team, bases);
  return getPreferredRejoinPoint({ id: team, y: y ?? base.y, recoveryGate: y !== undefined && y < base.y ? "TOP" : "BOTTOM" }, base);
}

export function chooseHealingSlotPosition(
  base: BattleBase,
  healingSoldiers: readonly Soldier[],
  random: RandomSource = Math.random,
): Point {
  const rect = getBaseHealingInteriorRect(base);
  const spacing = BASE_CONFIG.healingMinSpacing;
  const columns = Math.floor(rect.width / spacing) + 1;
  const rows = Math.floor(rect.height / spacing) + 1;
  const startColumn = Math.min(columns - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * columns));
  const startRow = Math.min(rows - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * rows));
  const startIndex = startRow * columns + startColumn;
  let fallback = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  let fallbackClearance = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < columns * rows; offset += 1) {
    const index = (startIndex + offset) % (columns * rows);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const candidate = {
      x: Math.min(rect.x + rect.width, rect.x + column * spacing),
      y: Math.min(rect.y + rect.height, rect.y + row * spacing),
    };
    const clearance = healingSoldiers.length
      ? Math.min(...healingSoldiers.map((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y)))
      : Number.POSITIVE_INFINITY;
    if (clearance >= spacing) return candidate;
    if (clearance > fallbackClearance) {
      fallback = candidate;
      fallbackClearance = clearance;
    }
  }
  return fallback;
}

export function shouldEmergencyRetreat(soldier: Soldier): boolean {
  return soldier.reactionState === "NONE" && soldier.state === "NORMAL"
    && soldier.hp > 0 && soldier.hp / soldier.maxHp <= RECOVERY_CONFIG.dangerHpRatio;
}

function setMoveTarget(soldier: Soldier, point: Point): void {
  soldier.moveTargetX = point.x;
  soldier.moveTargetY = point.y;
}

function clearCombat(soldier: Soldier): void { clearEngagement(soldier); }

export function startEmergencyRetreat(soldier: Soldier, bases?: readonly BattleBase[], soldiers: readonly Soldier[] = []): void {
  clearConfusion(soldier, "EMERGENCY_RETREAT");
  soldier.state = "EMERGENCY_RETREAT";
  cancelAttack(soldier);
  soldier.temporaryOrder = null;
  clearCombat(soldier);
  const base = ownBase(soldier.team, bases);
  soldier.recoveryGate = soldier.controller === "player" ? null : getPreferredBaseGate(soldier, base);
  soldier.recoveryGateEntered = false;
  soldier.recoveryTargetKind = "BASE_GATE";
  soldier.recoveryHealerId = null;
  if (soldier.controller !== "player" && soldier.unitType !== "CAVALRY" && !soldier.treatmentUsedSinceLastBaseVisit) {
    const healer = soldiers.filter((candidate) => candidate !== soldier && candidate.team === soldier.team && !candidate.isDead
      && hasSpecialAbility(candidate, "TREATMENT") && Math.hypot(candidate.x - soldier.x, candidate.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentSearchRadius)
      .sort((a, b) => Math.hypot(a.x - soldier.x, a.y - soldier.y) - Math.hypot(b.x - soldier.x, b.y - soldier.y))[0];
    if (healer) { soldier.recoveryTargetKind = "HEALER"; soldier.recoveryHealerId = healer.id; }
  }
  if (soldiers.length) handleRetreatStarted(soldier, soldiers);
  if (soldier.recoveryGate) setMoveTarget(soldier, getBaseGatePoint(base, soldier.recoveryGate, false));
  else { soldier.moveTargetX = null; soldier.moveTargetY = null; }
}

function applyTreatmentContact(soldier: Soldier, soldiers: readonly Soldier[]): boolean {
  if (soldier.unitType === "CAVALRY") return false;
  if (soldier.treatmentUsedSinceLastBaseVisit) return false;
  const healer = soldiers.find((candidate) => candidate !== soldier && candidate.team === soldier.team && !candidate.isDead
    && hasSpecialAbility(candidate, "TREATMENT")
    && Math.hypot(candidate.x - soldier.x, candidate.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius);
  if (!healer) return false;
  const multiplier = hasSpecialAbility(soldier, "RECOVERY_BOOST") ? SPECIAL_ABILITY_CONFIG.recoveryBoostMultiplier : 1;
  soldier.hp = Math.min(soldier.maxHp, soldier.hp + SPECIAL_ABILITY_CONFIG.treatmentHealAmount * multiplier);
  soldier.treatmentUsedSinceLastBaseVisit = true;
  if (hasSpecialAbility(soldier, "RECOVERY_BOOST")) pulseFriendlyHealing(soldier, soldiers);
  if (soldier.hp / soldier.maxHp > RECOVERY_CONFIG.dangerHpRatio) {
    soldier.state = "NORMAL"; soldier.moveTargetX = null; soldier.moveTargetY = null; soldier.recoveryGate = null;
  }
  return true;
}

function enterHealing(
  soldier: Soldier,
  base: BattleBase,
  gate: "TOP" | "BOTTOM",
  soldiers: readonly Soldier[],
  random: RandomSource,
): void {
  soldier.recoveryGate = gate;
  const occupied = soldiers.filter((other) => other !== soldier && other.team === soldier.team && other.state === "HEALING");
  const slot = chooseHealingSlotPosition(base, occupied, random);
  Object.assign(soldier, slot);
  soldier.recoveryGateEntered = true;
  soldier.treatmentUsedSinceLastBaseVisit = false;
  soldier.state = "HEALING";
  invalidateCombatTargetForAll(soldier.id, soldiers);
  soldier.moveTargetX = null;
  soldier.moveTargetY = null;
  const count = countTeamAbility(soldiers, soldier.team, "FIELD_HOSPITAL");
  if (random() < aggregateProcChance(count, SPECIAL_ABILITY_CONFIG.fieldHospitalPerHolderChance,
    SPECIAL_ABILITY_CONFIG.fieldHospitalMaxChance)) soldier.hp = soldier.maxHp;
}

export function updateEmergencyRetreat(
  soldier: Soldier,
  bases?: readonly BattleBase[],
  random: RandomSource = Math.random,
  soldiers: readonly Soldier[] = [],
): void {
  const base = ownBase(soldier.team, bases);
  clearCombat(soldier);
  if (soldier.controller === "player") {
    if (applyTreatmentContact(soldier, soldiers)) return;
    const preferredGate = getPreferredBaseGate(soldier, base);
    const gate = hasClearedBaseGateBoundary(soldier, base, preferredGate, "ENTER") ? preferredGate : null;
    if (!gate) { soldier.moveTargetX = null; soldier.moveTargetY = null; return; }
    enterHealing(soldier, base, gate, soldiers, random);
    return;
  }
  if (soldier.recoveryTargetKind === "HEALER") {
    const healer = soldiers.find((candidate) => candidate.id === soldier.recoveryHealerId && !candidate.isDead
      && candidate.team === soldier.team && hasSpecialAbility(candidate, "TREATMENT"));
    if (healer && Math.hypot(healer.x - soldier.x, healer.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentSearchRadius * 1.5) {
      setMoveTarget(soldier, healer);
      if (Math.hypot(healer.x - soldier.x, healer.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius) {
        const multiplier = hasSpecialAbility(soldier, "RECOVERY_BOOST") ? SPECIAL_ABILITY_CONFIG.recoveryBoostMultiplier : 1;
        soldier.hp = Math.min(soldier.maxHp, soldier.hp + SPECIAL_ABILITY_CONFIG.treatmentHealAmount * multiplier);
        soldier.treatmentUsedSinceLastBaseVisit = true;
        soldier.recoveryTargetKind = "BASE_GATE";
        soldier.recoveryHealerId = null;
        if (hasSpecialAbility(soldier, "RECOVERY_BOOST")) pulseFriendlyHealing(soldier, soldiers);
        if (soldier.hp / soldier.maxHp > RECOVERY_CONFIG.dangerHpRatio) {
          soldier.state = "NORMAL"; soldier.moveTargetX = null; soldier.moveTargetY = null; soldier.recoveryGate = null;
        }
      }
      return;
    }
    soldier.recoveryTargetKind = "BASE_GATE"; soldier.recoveryHealerId = null;
  }
  const gate = soldier.recoveryGate ?? getPreferredBaseGate(soldier, base);
  soldier.recoveryGate = gate;
  if (hasClearedBaseGateBoundary(soldier, base, gate, "ENTER")) {
    enterHealing(soldier, base, gate, soldiers, random);
    return;
  }
  const exterior = getBaseGatePoint(base, gate, false);
  setMoveTarget(soldier, hasReachedBaseGateApproach(soldier, base, gate)
    ? getBaseGatePoint(base, gate, true)
    : exterior);
}

export function updateHealing(soldier: Soldier, deltaSeconds: number, bases?: readonly BattleBase[]): void {
  clearCombat(soldier);
  soldier.moveTargetX = null;
  soldier.moveTargetY = null;
  const base = ownBase(soldier.team, bases);
  if (soldier.unitType === "TEPPOU" || soldier.unitType === "CAVALRY") {
    soldier.facingX = soldier.team === "player" ? 1 : -1; soldier.facingY = 0; soldier.aimX = null; soldier.aimY = null;
  }
  const multiplier = hasSpecialAbility(soldier, "RECOVERY_BOOST") ? SPECIAL_ABILITY_CONFIG.recoveryBoostMultiplier : 1;
  soldier.hp = Math.min(soldier.maxHp, soldier.hp + RECOVERY_CONFIG.healingHpPerSecond * multiplier * deltaSeconds);
  if (soldier.hp >= soldier.maxHp) {
    soldier.hp = soldier.maxHp;
    const gate = soldier.recoveryGate ?? getPreferredBaseGate(soldier, base);
    const exit = getBaseGatePoint(base, gate, false);
    soldier.x = exit.x;
    soldier.y = exit.y;
    soldier.state = "NORMAL";
    soldier.moveTargetX = null;
    soldier.moveTargetY = null;
    soldier.recoveryGate = null;
    soldier.recoveryGateEntered = false;
  }
}

export function updateRejoining(soldier: Soldier, bases?: readonly BattleBase[]): void {
  const base = ownBase(soldier.team, bases);
  const rejoinPoint = getPreferredRejoinPoint(soldier, base);
  clearCombat(soldier);
  setMoveTarget(soldier, rejoinPoint);
  const gate = soldier.recoveryGate ?? getPreferredBaseGate(soldier, base);
  soldier.recoveryGate = gate;
  if (hasClearedBaseGateBoundary(soldier, base, gate, "EXIT")) {
    soldier.state = "NORMAL";
    soldier.moveTargetX = null;
    soldier.moveTargetY = null;
    soldier.recoveryGate = null;
    soldier.recoveryGateEntered = false;
  }
}

export function updateRecoveryStates(
  soldiers: Soldier[],
  deltaSeconds: number,
  bases?: readonly BattleBase[],
  random: RandomSource = Math.random,
): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.reactionState !== "NONE") continue;
    switch (soldier.state) {
      case "EMERGENCY_RETREAT": updateEmergencyRetreat(soldier, bases, random, soldiers); break;
      case "HEALING": updateHealing(soldier, deltaSeconds, bases); break;
      case "REJOINING": updateRejoining(soldier, bases); break;
      case "NORMAL": if (shouldEmergencyRetreat(soldier)) startEmergencyRetreat(soldier, bases, soldiers); break;
    }
  }
}
