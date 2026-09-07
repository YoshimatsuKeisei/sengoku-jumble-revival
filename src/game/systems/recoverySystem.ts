import { BASE_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import { battlefieldWorldPointToSource } from "../battlefieldLayout";
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
import {
  applyFieldHospitalArrival,
  handleRetreatStateEntered,
  hasSpecialAbility,
  isAbilityActionCapable,
} from "./specialAbilitySystem";
import { invalidateCombatTargetForAll } from "./combatTargetSystem";
import { clearConfusion } from "./confusionSystem";
import { SWF_COMBAT_FPS, swfLogicTicksToMs } from "./techniqueCombatProfiles";
import { recordRecovery, recordRetreatTransition } from "./meritSystem";

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

export const SWF_TREATMENT_SEARCH_MANHATTAN_UNITS = 760;
export const TREATMENT_RECOVERY_LOCK_TICKS = 1;

export function shouldEmergencyRetreat(soldier: Soldier, currentTime = 0): boolean {
  const hpPercent = soldier.maxHp > 0 ? Math.floor(soldier.hp / soldier.maxHp * 100) : 0;
  return soldier.reactionState === "NONE" && soldier.state === "NORMAL"
    && currentTime >= soldier.abilityActionLockUntil
    && soldier.hp > 0 && (hpPercent < 20 || soldier.hp < 6);
}

function setMoveTarget(soldier: Soldier, point: Point): void {
  soldier.moveTargetX = point.x;
  soldier.moveTargetY = point.y;
}

function clearCombat(soldier: Soldier): void { clearEngagement(soldier); }

function treatmentDistanceInSwfUnits(a: Pick<Soldier, "x" | "y">, b: Pick<Soldier, "x" | "y">): number {
  const sourceA = battlefieldWorldPointToSource(a);
  const sourceB = battlefieldWorldPointToSource(b);
  return Math.abs(sourceA.x - sourceB.x) + Math.abs(sourceA.y - sourceB.y);
}

export function findNearestTreatmentHealer(patient: Soldier, soldiers: readonly Soldier[], currentTime = 0): Soldier | null {
  return soldiers.filter((candidate) => candidate !== patient && candidate.team === patient.team
    && hasSpecialAbility(candidate, "TREATMENT") && isAbilityActionCapable(candidate, currentTime)
    && (patient.controller !== "player"
      || treatmentDistanceInSwfUnits(candidate, patient) < SWF_TREATMENT_SEARCH_MANHATTAN_UNITS))
    .sort((a, b) => treatmentDistanceInSwfUnits(a, patient) - treatmentDistanceInSwfUnits(b, patient))[0] ?? null;
}

export function calculateTreatmentHealAmount(patient: Pick<Soldier, "maxHp">): number {
  return Math.floor(patient.maxHp * 0.2) + 2;
}

function completeTreatment(patient: Soldier, healer: Soldier, currentTime: number): void {
  const amount = calculateTreatmentHealAmount(patient);
  const boost = hasSpecialAbility(patient, "RECOVERY_BOOST");
  const beforeHp = patient.hp;
  patient.hp = Math.min(patient.maxHp, patient.hp + amount * (boost ? 2 : 1));
  // tat() is the confirmed exception that immediately refreshes h after recovery.
  patient.hpBarHp = patient.hp;
  recordRecovery(healer, patient, patient.hp - beforeHp);
  patient.treatmentUsedSinceLastBaseVisit = true;
  patient.recoveryTargetKind = "BASE_GATE";
  patient.recoveryHealerId = null;
  patient.state = "NORMAL";
  patient.moveTargetX = null;
  patient.moveTargetY = null;
  patient.recoveryGate = null;
  patient.moutaiTriggeredForRetreat = false;
  patient.abilityActionLockUntil = Math.max(patient.abilityActionLockUntil,
    currentTime + swfLogicTicksToMs(TREATMENT_RECOVERY_LOCK_TICKS));
  clearCombat(patient);
}

export function startEmergencyRetreat(
  soldier: Soldier, bases?: readonly BattleBase[], soldiers: readonly Soldier[] = [], currentTime = 0,
): void {
  if (soldier.state !== "EMERGENCY_RETREAT") soldier.temporaryRetreatCount += 1;
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
  if (!soldier.treatmentUsedSinceLastBaseVisit) {
    const healer = findNearestTreatmentHealer(soldier, soldiers, currentTime);
    if (healer) { soldier.recoveryTargetKind = "HEALER"; soldier.recoveryHealerId = healer.id; }
  }
  recordRetreatTransition(soldier, soldiers, soldier.recoveryTargetKind);
  if (soldiers.length) handleRetreatStateEntered(soldier, soldiers, currentTime);
  if (soldier.recoveryGate) setMoveTarget(soldier, getBaseGatePoint(base, soldier.recoveryGate, false));
  else { soldier.moveTargetX = null; soldier.moveTargetY = null; }
}

function applyTreatmentContact(soldier: Soldier, soldiers: readonly Soldier[], currentTime: number): boolean {
  if (soldier.treatmentUsedSinceLastBaseVisit) return false;
  const healer = soldiers.find((candidate) => candidate !== soldier && candidate.team === soldier.team
    && hasSpecialAbility(candidate, "TREATMENT") && isAbilityActionCapable(candidate, currentTime)
    && Math.hypot(candidate.x - soldier.x, candidate.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius);
  if (!healer) return false;
  completeTreatment(soldier, healer, currentTime);
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
  soldier.facingX = soldier.team === "player" ? 1 : -1;
  soldier.facingY = 0;
  soldier.aimX = null;
  soldier.aimY = null;
  invalidateCombatTargetForAll(soldier.id, soldiers);
  soldier.moveTargetX = null;
  soldier.moveTargetY = null;
  applyFieldHospitalArrival(soldier, soldiers, random);
}

export function updateEmergencyRetreat(
  soldier: Soldier,
  bases?: readonly BattleBase[],
  random: RandomSource = Math.random,
  soldiers: readonly Soldier[] = [],
  currentTime = 0,
): void {
  const base = ownBase(soldier.team, bases);
  clearCombat(soldier);
  if (soldier.controller === "player") {
    if (applyTreatmentContact(soldier, soldiers, currentTime)) return;
    const preferredGate = getPreferredBaseGate(soldier, base);
    const gate = hasClearedBaseGateBoundary(soldier, base, preferredGate, "ENTER") ? preferredGate : null;
    if (!gate) { soldier.moveTargetX = null; soldier.moveTargetY = null; return; }
    enterHealing(soldier, base, gate, soldiers, random);
    return;
  }
  if (soldier.recoveryTargetKind === "HEALER") {
    const healer = soldiers.find((candidate) => candidate.id === soldier.recoveryHealerId
      && candidate.team === soldier.team && hasSpecialAbility(candidate, "TREATMENT") && isAbilityActionCapable(candidate, currentTime));
    if (healer) {
      setMoveTarget(soldier, healer);
      if (Math.hypot(healer.x - soldier.x, healer.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius) {
        completeTreatment(soldier, healer, currentTime);
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
  soldier.facingX = soldier.team === "player" ? 1 : -1;
  soldier.facingY = 0;
  soldier.aimX = null;
  soldier.aimY = null;
  const multiplier = hasSpecialAbility(soldier, "RECOVERY_BOOST") ? SPECIAL_ABILITY_CONFIG.recoveryBoostMultiplier : 1;
  const swfHealingPerUpdate = soldier.maxHp / 400;
  soldier.hp = Math.min(soldier.maxHp, soldier.hp + swfHealingPerUpdate * SWF_COMBAT_FPS * multiplier * deltaSeconds);
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
    soldier.moutaiTriggeredForRetreat = false;
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
  currentTime = 0,
): void {
  for (const soldier of soldiers) {
    if (soldier.isDead || soldier.reactionState !== "NONE") continue;
    switch (soldier.state) {
      case "EMERGENCY_RETREAT": updateEmergencyRetreat(soldier, bases, random, soldiers, currentTime); break;
      case "HEALING": updateHealing(soldier, deltaSeconds, bases); break;
      case "REJOINING": updateRejoining(soldier, bases); break;
      case "NORMAL":
        if (!shouldEmergencyRetreat(soldier, currentTime)) break;
        if (soldier.rareSpecialAbilities.includes("MOUTAI")
          && (Math.floor(soldier.hp / soldier.maxHp * 100) < 20 || soldier.hp < 6)) {
          if (!soldier.moutaiTriggeredForRetreat) {
            if (soldier.activeSpecialTechnique !== null || currentTime < soldier.specialLockUntil) break;
            cancelAttack(soldier);
            soldier.moutaiTriggeredForRetreat = true;
            soldier.facingX = soldier.team === "player" ? 1 : -1;
            soldier.facingY = 0;
            soldier.pendingMoutaiSpecials += 1;
            break;
          }
          if (soldier.pendingMoutaiSpecials > 0 || soldier.activeSpecialTechnique !== null
            || currentTime < soldier.specialLockUntil) break;
        }
        startEmergencyRetreat(soldier, bases, soldiers, currentTime);
        break;
    }
  }
}
