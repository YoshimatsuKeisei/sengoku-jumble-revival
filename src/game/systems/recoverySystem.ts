import { SPECIAL_ABILITY_CONFIG } from "../config";
import { battlefieldSourceDistanceToWorldX, battlefieldSourcePointToWorld, battlefieldWorldPointToSource } from "../battlefieldLayout";
import type { BattleBase, Soldier, Team } from "../types";
import type { RandomSource } from "../stats/soldierStats";
import { clearEngagement } from "./aiSystem";
import { cancelAttack } from "./attackRuntime";
import { createBattleBase, getBaseForTeam } from "./baseSystem";
import { getPreferredRejoinPoint } from "./battlefieldGeometry";
import {
  applyFieldHospitalArrival,
  applySupportHealingPulse,
  handleRetreatStateEntered,
  hasSpecialAbility,
  isSwfPreRetreatFieldState,
} from "./specialAbilitySystem";
import { invalidateCombatTargetForAll } from "./combatTargetSystem";
import { clearConfusion } from "./confusionSystem";
import { recordRecovery, recordRetreatTransition } from "./meritSystem";
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

// Direct AVM1 field-hospital placement. Player p97 uses 68 + floor(i/5)*25,
// enemy p98 uses 1647 + floor((i-30)/5)*25, and both use rows spaced by 60.
// The original swaps m200 into effective slot 27 and m27 into effective slot 0.
export const SWF_PLAYER_HEALING_GRID_X = 68;
export const SWF_ENEMY_HEALING_GRID_X = 1647;
export const SWF_HEALING_GRID_Y = 480;
export const SWF_HEALING_COLUMN_STEP = 25;
export const SWF_HEALING_ROW_STEP = 60;
export const SWF_HEALING_ROWS = 5;
export const SWF_PLAYER_CONTROLLER_HEALING_INDEX = 27;

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

function parseRuntimeRosterIndex(soldier: Pick<Soldier, "id">): number {
  const match = soldier.id.match(/-(\d+)$/);
  const parsed = match ? Number(match[1]) : 0;
  return Number.isInteger(parsed) && parsed >= 0 && parsed < 30 ? parsed : 0;
}

export function getSwfHealingRosterIndex(
  soldier: Pick<Soldier, "id" | "team" | "controller">,
): number {
  const index = parseRuntimeRosterIndex(soldier as Pick<Soldier, "id">);
  if (soldier.team !== "player") return index;
  if (soldier.controller === "player") return SWF_PLAYER_CONTROLLER_HEALING_INDEX;
  if (index === SWF_PLAYER_CONTROLLER_HEALING_INDEX) return 0;
  return index;
}

/** Exact deterministic p97/p98 healing position recovered from the raw AVM1. */
export function getSwfHealingSlotPosition(
  soldier: Pick<Soldier, "id" | "team" | "controller">,
): Point {
  const index = getSwfHealingRosterIndex(soldier);
  const column = Math.floor(index / SWF_HEALING_ROWS);
  const row = index % SWF_HEALING_ROWS;
  return battlefieldSourcePointToWorld({
    x: (soldier.team === "player" ? SWF_PLAYER_HEALING_GRID_X : SWF_ENEMY_HEALING_GRID_X)
      + column * SWF_HEALING_COLUMN_STEP,
    y: SWF_HEALING_GRID_Y + row * SWF_HEALING_ROW_STEP,
  });
}

export const SWF_TREATMENT_SEARCH_MANHATTAN_UNITS = 760;
export const SWF_TREATMENT_FORWARD_TOLERANCE_UNITS = 30;
export const TREATMENT_RECOVERY_LOCK_TICKS = 12;

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

/** Raw s14 scan requires healer p < 88; available runtime states map p7 rejoin as eligible. */
export function isSwfTreatmentHolderRuntimeEligible(candidate: Soldier): boolean {
  return isSwfPreRetreatFieldState(candidate) && hasSpecialAbility(candidate, "TREATMENT");
}

/**
 * Raw player scan requires healerX - 30 < patientX; enemy is mirrored as
 * healerX + 30 > patientX. Because world X is an affine transform of raw SWF X,
 * compare in world space so an exact 30-unit boundary is not perturbed by a
 * world -> SWF floating-point round trip.
 */
export function isSwfTreatmentDirectionEligible(patient: Soldier, candidate: Soldier): boolean {
  const toleranceWorld = battlefieldSourceDistanceToWorldX(SWF_TREATMENT_FORWARD_TOLERANCE_UNITS);
  return patient.team === "player"
    ? candidate.x - toleranceWorld < patient.x
    : candidate.x + toleranceWorld > patient.x;
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

export function findNearestTreatmentHealer(patient: Soldier, soldiers: readonly Soldier[], _currentTime = 0): Soldier | null {
  return soldiers.filter((candidate) => candidate !== patient && candidate.team === patient.team
    && isSwfTreatmentHolderRuntimeEligible(candidate) && isSwfTreatmentDirectionEligible(patient, candidate)
    && treatmentDistanceInSwfUnits(candidate, patient) < SWF_TREATMENT_SEARCH_MANHATTAN_UNITS)
    .sort((a, b) => treatmentDistanceInSwfUnits(a, patient) - treatmentDistanceInSwfUnits(b, patient))[0] ?? null;
}

export function calculateTreatmentHealAmount(patient: Pick<Soldier, "maxHp">): number {
  return Math.floor(patient.maxHp * 0.2) + 2;
}

function completeTreatment(patient: Soldier, healer: Soldier, soldiers: readonly Soldier[], currentTime: number): void {
  const amount = calculateTreatmentHealAmount(patient);
  const boost = hasSpecialAbility(patient, "RECOVERY_BOOST");
  const beforeHp = patient.hp;
  // Raw tat() invokes the source-excluding sz(5) pulse before the doubled
  // treatment additions when the patient owns s20.
  if (boost) applySupportHealingPulse(patient, soldiers, false);
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
  patient.recoveryGateEntered = false;
  setRecoveryEntryCommitted(patient, false);
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
  soldier.recoveryGate = null;
  soldier.recoveryGateEntered = false;
  setRecoveryEntryCommitted(soldier, false);
  soldier.recoveryTargetKind = "BASE_GATE";
  soldier.recoveryHealerId = null;
  if (!soldier.treatmentUsedSinceLastBaseVisit) {
    const healer = findNearestTreatmentHealer(soldier, soldiers, currentTime);
    if (healer) { soldier.recoveryTargetKind = "HEALER"; soldier.recoveryHealerId = healer.id; }
  }
  recordRetreatTransition(soldier, soldiers, soldier.recoveryTargetKind);
  if (soldiers.length) handleRetreatStateEntered(soldier, soldiers, currentTime);
  if (soldier.recoveryTargetKind === "BASE_GATE") setSwfOuterRecoveryTarget(soldier);
  else { soldier.moveTargetX = null; soldier.moveTargetY = null; }
}

function applyTreatmentContact(soldier: Soldier, soldiers: readonly Soldier[], currentTime: number): boolean {
  if (soldier.treatmentUsedSinceLastBaseVisit) return false;
  const healer = soldier.recoveryHealerId
    ? soldiers.find((candidate) => candidate.id === soldier.recoveryHealerId && candidate !== soldier
      && candidate.team === soldier.team && isSwfTreatmentHolderRuntimeEligible(candidate))
    : findNearestTreatmentHealer(soldier, soldiers, currentTime);
  if (!healer || Math.hypot(healer.x - soldier.x, healer.y - soldier.y) > SPECIAL_ABILITY_CONFIG.treatmentContactRadius) return false;
  completeTreatment(soldier, healer, soldiers, currentTime);
  return true;
}

function enterHealing(
  soldier: Soldier,
  _base: BattleBase,
  gate: "TOP" | "BOTTOM",
  soldiers: readonly Soldier[],
  random: RandomSource,
): void {
  soldier.recoveryGate = gate;
  Object.assign(soldier, getSwfHealingSlotPosition(soldier));
  soldier.recoveryGateEntered = true;
  setRecoveryEntryCommitted(soldier, false);
  soldier.treatmentUsedSinceLastBaseVisit = false;
  soldier.state = "HEALING";
  soldier.facingX = soldier.team === "player" ? 1 : -1;
  soldier.facingY = 0;
  soldier.aimX = null;
  soldier.aimY = null;
  // Retained as a defensive fallback for directly injected/debug healing states.
  // Normal SWF routing releases pursuers earlier at the p93/p94 entry commit.
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
      && candidate.team === soldier.team && isSwfTreatmentHolderRuntimeEligible(candidate));
    if (healer) {
      setMoveTarget(soldier, healer);
      if (Math.hypot(healer.x - soldier.x, healer.y - soldier.y) <= SPECIAL_ABILITY_CONFIG.treatmentContactRadius) {
        completeTreatment(soldier, healer, soldiers, currentTime);
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
    // Raw p91/p92 -> p93/p94 transition calls led(self) here, not when the
    // soldier later reaches healing p97/p98. Pursuit therefore survives the
    // initial retreat but is released exactly when base entry is committed.
    invalidateCombatTargetForAll(soldier.id, soldiers);
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
  soldier.facingX = soldier.team === "player" ? 1 : -1;
  soldier.facingY = 0;
  soldier.aimX = null;
  soldier.aimY = null;
  const multiplier = hasSpecialAbility(soldier, "RECOVERY_BOOST") ? SPECIAL_ABILITY_CONFIG.recoveryBoostMultiplier : 1;
  const swfHealingPerUpdate = soldier.maxHp / 400;
  soldier.hp += swfHealingPerUpdate * SWF_COMBAT_FPS * multiplier * deltaSeconds;
  // Raw p97/p98 recalculates h.gotoAndStop(101-floor(hp/mp*100)) on every
  // healing logic update. Keep the displayed HP snapshot synchronized here;
  // other recovery effects retain their own raw-SWF refresh semantics.
  soldier.hpBarHp = Math.min(soldier.maxHp, soldier.hp);
  if (soldier.hp <= soldier.maxHp) return;

  soldier.hp = soldier.maxHp;
  soldier.hpBarHp = soldier.maxHp;
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
