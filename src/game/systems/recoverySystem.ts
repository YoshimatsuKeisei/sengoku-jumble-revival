import { BASE_CONFIG, RECOVERY_CONFIG, SPECIAL_ABILITY_CONFIG } from "../config";
import { battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { BattleBase, Soldier, Team } from "../types";
import type { RandomSource } from "../stats/soldierStats";
import { clearEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";
import { createBattleBase, getBaseForTeam } from "./baseSystem";
import {
  getBaseHealingInteriorRect,
  getPreferredRejoinPoint,
} from "./battlefieldGeometry";
import {
  applyFieldHospitalArrival,
  applySupportHealingPulse,
  handleRetreatStateEntered,
  hasSpecialAbility,
  isAbilityActionCapable,
} from "./specialAbilitySystem";
import { invalidateCombatTargetForAll } from "./combatTargetSystem";
import { clearConfusion } from "./confusionSystem";
import { SWF_COMBAT_FPS, swfLogicTicksToMs } from "./techniqueCombatProfiles";
import {
  getSwfBaseCollisionCodeAtWorld,
  SWF_ENEMY_RECOVERY_TILE,
  SWF_PLAYER_RECOVERY_TILE,
} from "./swfBaseCollisionGrid";

type Point = { x: number; y: number };
type RecoveryEntryRuntime = Soldier & { recoveryEntryCommitted?: boolean };

const SWF_RECOVERY_ROUTE_SPLIT_Y = 576;
const SWF_PLAYER_OUTER_X = 140;
const SWF_ENEMY_OUTER_X = 1735;
const SWF_RECOVERY_TOP_Y = 249;
const SWF_RECOVERY_BOTTOM_Y = 946;
const SWF_PLAYER_ENTRY_COMMIT_X = 232;
const SWF_ENEMY_ENTRY_COMMIT_X = 1612;
const SWF_PLAYER_INNER_POINT = { x: 70, y: 580 } as const;
const SWF_ENEMY_INNER_POINT = { x: 1825, y: 580 } as const;
const SWF_PLAYER_REJOIN_X = 346;
const SWF_ENEMY_REJOIN_X = 1545;
const SWF_REJOIN_TOP_INTERIOR_Y = 397;
const SWF_REJOIN_BOTTOM_INTERIOR_Y = 782;
const SWF_REJOIN_COMPLETION_MANHATTAN = 50;

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
  return soldier.reactionState === "NONE" && soldier.state === "NORMAL"
    && currentTime >= soldier.abilityActionLockUntil
    && soldier.hp > 0 && soldier.hp / soldier.maxHp <= RECOVERY_CONFIG.dangerHpRatio;
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

function isRecoveryEntryCommitted(soldier: Soldier): boolean {
  return Boolean((soldier as RecoveryEntryRuntime).recoveryEntryCommitted);
}

function setRecoveryEntryCommitted(soldier: Soldier, committed: boolean): void {
  (soldier as RecoveryEntryRuntime).recoveryEntryCommitted = committed;
}

function swfRecoveryRouteForSourceY(sourceY: number): { gate: "TOP" | "BOTTOM"; y: number } {
  return sourceY > SWF_RECOVERY_ROUTE_SPLIT_Y
    ? { gate: "BOTTOM", y: SWF_RECOVERY_BOTTOM_Y }
    : { gate: "TOP", y: SWF_RECOVERY_TOP_Y };
}

function swfRejoinRouteForSourceY(sourceY: number): { gate: "TOP" | "BOTTOM"; interiorY: number; targetY: number } {
  return sourceY < SWF_RECOVERY_ROUTE_SPLIT_Y
    ? { gate: "TOP", interiorY: SWF_REJOIN_TOP_INTERIOR_Y, targetY: SWF_RECOVERY_TOP_Y }
    : { gate: "BOTTOM", interiorY: SWF_REJOIN_BOTTOM_INTERIOR_Y, targetY: SWF_RECOVERY_BOTTOM_Y };
}

function setSwfSourceMoveTarget(soldier: Soldier, sourceX: number, sourceY: number): void {
  setMoveTarget(soldier, battlefieldSourcePointToWorld({ x: sourceX, y: sourceY }));
}

function setSwfOuterRecoveryTarget(soldier: Soldier): void {
  const source = battlefieldWorldPointToSource(soldier);
  const route = swfRecoveryRouteForSourceY(source.y);
  soldier.recoveryGate = route.gate;
  setSwfSourceMoveTarget(
    soldier,
    soldier.team === "player" ? SWF_PLAYER_OUTER_X : SWF_ENEMY_OUTER_X,
    route.y,
  );
}

function shouldCommitSwfRecoveryEntry(soldier: Soldier): boolean {
  const sourceX = battlefieldWorldPointToSource(soldier).x;
  return soldier.team === "player"
    ? sourceX < SWF_PLAYER_ENTRY_COMMIT_X
    : sourceX > SWF_ENEMY_ENTRY_COMMIT_X;
}

function setSwfInnerRecoveryTarget(soldier: Soldier): void {
  const point = soldier.team === "player" ? SWF_PLAYER_INNER_POINT : SWF_ENEMY_INNER_POINT;
  setSwfSourceMoveTarget(soldier, point.x, point.y);
}

function isOnOwnSwfRecoveryTile(soldier: Soldier): boolean {
  const code = getSwfBaseCollisionCodeAtWorld(soldier);
  return soldier.team === "player"
    ? code === SWF_PLAYER_RECOVERY_TILE
    : code === SWF_ENEMY_RECOVERY_TILE;
}

function beginSwfRejoin(soldier: Soldier): void {
  const source = battlefieldWorldPointToSource(soldier);
  const route = swfRejoinRouteForSourceY(source.y);
  const repositioned = battlefieldSourcePointToWorld({ x: source.x, y: route.interiorY });
  soldier.x = repositioned.x;
  soldier.y = repositioned.y;
  soldier.state = "REJOINING";
  soldier.recoveryGate = route.gate;
  soldier.recoveryGateEntered = false;
  setRecoveryEntryCommitted(soldier, false);
  soldier.recoveryTargetKind = "BASE_GATE";
  soldier.recoveryHealerId = null;
  soldier.moutaiTriggeredForRetreat = false;
  setSwfSourceMoveTarget(
    soldier,
    soldier.team === "player" ? SWF_PLAYER_REJOIN_X : SWF_ENEMY_REJOIN_X,
    route.targetY,
  );
}

export function findNearestTreatmentHealer(patient: Soldier, soldiers: readonly Soldier[], currentTime = 0): Soldier | null {
  return soldiers.filter((candidate) => candidate !== patient && candidate.team === patient.team
    && hasSpecialAbility(candidate, "TREATMENT") && isAbilityActionCapable(candidate, currentTime)
    && treatmentDistanceInSwfUnits(candidate, patient) < SWF_TREATMENT_SEARCH_MANHATTAN_UNITS)
    .sort((a, b) => treatmentDistanceInSwfUnits(a, patient) - treatmentDistanceInSwfUnits(b, patient))[0] ?? null;
}

export function calculateTreatmentHealAmount(patient: Pick<Soldier, "maxHp">): number {
  return Math.floor(patient.maxHp * 0.2) + 2;
}

function completeTreatment(patient: Soldier, soldiers: readonly Soldier[], currentTime: number): void {
  const amount = calculateTreatmentHealAmount(patient);
  const boost = hasSpecialAbility(patient, "RECOVERY_BOOST");
  patient.hp = Math.min(patient.maxHp, patient.hp + amount * (boost ? 2 : 1));
  patient.treatmentUsedSinceLastBaseVisit = true;
  patient.recoveryTargetKind = "BASE_GATE";
  patient.recoveryHealerId = null;
  patient.state = "NORMAL";
  patient.moveTargetX = null;
  patient.moveTargetY = null;
  patient.recoveryGate = null;
  patient.recoveryGateEntered = false;
  setRecoveryEntryCommitted(patient, false);
  patient.moutaiTriggeredForRetreat = false;
  patient.abilityActionLockUntil = Math.max(patient.abilityActionLockUntil,
    currentTime + swfLogicTicksToMs(TREATMENT_RECOVERY_LOCK_TICKS));
  clearCombat(patient);
  if (boost) applySupportHealingPulse(patient, soldiers, false);
}

export function startEmergencyRetreat(
  soldier: Soldier, bases?: readonly BattleBase[], soldiers: readonly Soldier[] = [], currentTime = 0,
): void {
  clearConfusion(soldier, "EMERGENCY_RETREAT");
  soldier.state = "EMERGENCY_RETREAT";
  cancelAttack(soldier);
  soldier.temporaryOrder = null;
  clearCombat(soldier);
  soldier.recoveryGate = null;
  soldier.recoveryGateEntered = false;
  setRecoveryEntryCommitted(soldier, false);
  soldier.recoveryTargetKind = "BASE_GATE";
  soldier.recoveryHealerId = null;
  if (!soldier.treatmentUsedSinceLastBaseVisit) {
    const healer = findNearestTreatmentHealer(soldier, soldiers, currentTime);
    if (healer) { soldier.recoveryTargetKind = "HEALER"; soldier.recoveryHealerId = healer.id; }
  }
  if (soldiers.length) handleRetreatStateEntered(soldier, soldiers, currentTime);
  if (soldier.recoveryTargetKind === "BASE_GATE") setSwfOuterRecoveryTarget(soldier);
  else { soldier.moveTargetX = null; soldier.moveTargetY = null; }
}

function applyTreatmentContact(soldier: Soldier, soldiers: readonly Soldier[], currentTime: number): boolean {
  if (soldier.treatmentUsedSinceLastBaseVisit) return false;
  const healer = soldiers.find((candidate) => candidate !== soldier && candidate.team === soldier.team
    && hasSpecialAbility(candidate, "TREATMENT") && isAbilityActionCapable(candidate, currentTime)
    && Math.hypot(candidate.x - soldier.x, candidate.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius);
  if (!healer) return false;
  completeTreatment(soldier, soldiers, currentTime);
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
  setRecoveryEntryCommitted(soldier, false);
  soldier.treatmentUsedSinceLastBaseVisit = false;
  soldier.state = "HEALING";
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

  if (applyTreatmentContact(soldier, soldiers, currentTime)) return;
  if (soldier.recoveryTargetKind === "HEALER") {
    const healer = soldiers.find((candidate) => candidate.id === soldier.recoveryHealerId
      && candidate.team === soldier.team && hasSpecialAbility(candidate, "TREATMENT") && isAbilityActionCapable(candidate, currentTime));
    if (healer) {
      setMoveTarget(soldier, healer);
      if (Math.hypot(healer.x - soldier.x, healer.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius) {
        completeTreatment(soldier, soldiers, currentTime);
      }
      return;
    }
    soldier.recoveryTargetKind = "BASE_GATE";
    soldier.recoveryHealerId = null;
    setRecoveryEntryCommitted(soldier, false);
  }

  if (isOnOwnSwfRecoveryTile(soldier)) {
    const source = battlefieldWorldPointToSource(soldier);
    const gate = soldier.recoveryGate ?? swfRecoveryRouteForSourceY(source.y).gate;
    enterHealing(soldier, base, gate, soldiers, random);
    return;
  }

  if (!isRecoveryEntryCommitted(soldier) && shouldCommitSwfRecoveryEntry(soldier)) {
    setRecoveryEntryCommitted(soldier, true);
    setSwfInnerRecoveryTarget(soldier);
    return;
  }

  if (isRecoveryEntryCommitted(soldier)) {
    setSwfInnerRecoveryTarget(soldier);
    return;
  }

  setSwfOuterRecoveryTarget(soldier);
}

export function updateHealing(soldier: Soldier, deltaSeconds: number, _bases?: readonly BattleBase[]): void {
  clearCombat(soldier);
  soldier.moveTargetX = null;
  soldier.moveTargetY = null;
  if (soldier.unitType === "TEPPOU" || soldier.unitType === "CAVALRY") {
    soldier.facingX = soldier.team === "player" ? 1 : -1;
    soldier.facingY = 0;
    soldier.aimX = null;
    soldier.aimY = null;
  }
  const multiplier = hasSpecialAbility(soldier, "RECOVERY_BOOST") ? SPECIAL_ABILITY_CONFIG.recoveryBoostMultiplier : 1;
  const swfHealingPerUpdate = soldier.maxHp / 400;
  soldier.hp += swfHealingPerUpdate * SWF_COMBAT_FPS * multiplier * deltaSeconds;
  if (soldier.hp <= soldier.maxHp) return;

  soldier.hp = soldier.maxHp;
  beginSwfRejoin(soldier);
}

export function updateRejoining(soldier: Soldier, _bases?: readonly BattleBase[]): void {
  clearCombat(soldier);
  const source = battlefieldWorldPointToSource(soldier);
  const gate = soldier.recoveryGate ?? (source.y < SWF_RECOVERY_ROUTE_SPLIT_Y ? "TOP" : "BOTTOM");
  soldier.recoveryGate = gate;
  const targetSource = {
    x: soldier.team === "player" ? SWF_PLAYER_REJOIN_X : SWF_ENEMY_REJOIN_X,
    y: gate === "TOP" ? SWF_RECOVERY_TOP_Y : SWF_RECOVERY_BOTTOM_Y,
  };
  setSwfSourceMoveTarget(soldier, targetSource.x, targetSource.y);
  const manhattan = Math.abs(targetSource.x - source.x) + Math.abs(targetSource.y - source.y);
  if (manhattan >= SWF_REJOIN_COMPLETION_MANHATTAN) return;

  soldier.state = "NORMAL";
  soldier.moveTargetX = null;
  soldier.moveTargetY = null;
  soldier.recoveryGate = null;
  soldier.recoveryGateEntered = false;
  setRecoveryEntryCommitted(soldier, false);
  soldier.recoveryTargetKind = "BASE_GATE";
  soldier.recoveryHealerId = null;
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
