import {
  battlefieldSourcePointToWorld,
  battlefieldWorldPointToSource,
} from "../battlefieldLayout";
import { getEffectiveFoot } from "../stats/soldierStats";
import type { Soldier } from "../types";
import { getSwfStaticCollisionCodeAtWorld } from "./swfBaseCollisionGrid";
import { SWF_COMBAT_FPS } from "./techniqueCombatProfiles";

export const SWF_GENERIC_CONTACT_K_TICKS = 3;
export const SWF_GENERIC_CONTACT_IMPULSE_DECAY = 0.7;

// Direct _root.fx/_root.fy direction table. Index 0 is unused; raw fi is 1..8.
export const SWF_CONTACT_DIRECTION_FX = [0, -1, -0.6, 0, 0.6, 1, 0.6, 0, -0.6] as const;
export const SWF_CONTACT_DIRECTION_FY = [0, 0, -0.6, -1, -0.6, 0, 0.6, 1, 0.6] as const;

interface RawGenericContactImpulseRuntime {
  fi: number;
  startedAt: number;
  nextStepAt: number;
  resumeAt: number;
  appliedTicks: number;
}

const rawGenericContactImpulses = new WeakMap<Soldier, RawGenericContactImpulseRuntime>();
const RAW_CONTACT_TICK_MS = 1000 / SWF_COMBAT_FPS;

export function getRawContactFiToward(source: Pick<Soldier, "x" | "y">, target: Pick<Soldier, "x" | "y">): number {
  const from = battlefieldWorldPointToSource(source);
  const to = battlefieldWorldPointToSource(target);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  let fi = Math.round(angle / 0.75) + 5;
  if (fi > 8) fi -= 8;
  if (fi < 1) fi += 8;
  return fi;
}

export function getRawOppositeContactFi(fi: number): number {
  const opposite = fi + 4;
  return opposite > 8 ? opposite - 8 : opposite;
}

function startRawGenericContactImpulse(soldier: Soldier, fi: number, currentTime: number): void {
  const resumeAt = currentTime + RAW_CONTACT_TICK_MS * (SWF_GENERIC_CONTACT_K_TICKS + 1);
  rawGenericContactImpulses.set(soldier, {
    fi,
    startedAt: currentTime,
    nextStepAt: currentTime + RAW_CONTACT_TICK_MS,
    resumeAt,
    appliedTicks: 0,
  });
  // BattleScene currently moves units before the contact scheduler. Hold the
  // ordinary movement path through the following three d-equivalent ticks so
  // the raw fx/fy response replaces, rather than stacks on top of, normal motion.
  soldier.abilityActionLockUntil = Math.max(soldier.abilityActionLockUntil, resumeAt);
}

export function startRawGenericContactImpulsePair(first: Soldier, second: Soldier, currentTime: number): void {
  const towardSecond = getRawContactFiToward(first, second);
  startRawGenericContactImpulse(first, getRawOppositeContactFi(towardSecond), currentTime);
  startRawGenericContactImpulse(second, towardSecond, currentTime);
}

export function isRawGenericContactImpulseActive(soldier: Soldier): boolean {
  return rawGenericContactImpulses.has(soldier);
}

function applyRawGenericContactImpulseStep(soldier: Soldier, runtime: RawGenericContactImpulseRuntime): void {
  const decay = SWF_GENERIC_CONTACT_IMPULSE_DECAY ** runtime.appliedTicks;
  const speedUnits = Math.max(0, getEffectiveFoot(soldier));
  const source = battlefieldWorldPointToSource(soldier);
  const candidate = battlefieldSourcePointToWorld({
    x: source.x + SWF_CONTACT_DIRECTION_FX[runtime.fi] * speedUnits * decay,
    y: source.y + SWF_CONTACT_DIRECTION_FY[runtime.fi] * speedUnits * decay,
  });

  const previousX = soldier.x;
  const previousY = soldier.y;
  if (getSwfStaticCollisionCodeAtWorld(candidate) === null) {
    soldier.x = candidate.x;
    soldier.y = candidate.y;
  }
  soldier.velocityX = soldier.x - previousX;
  soldier.velocityY = soldier.y - previousY;
}

export function updateRawGenericContactImpulses(soldiers: readonly Soldier[], currentTime: number): void {
  for (const soldier of soldiers) {
    const runtime = rawGenericContactImpulses.get(soldier);
    if (!runtime) continue;
    if (soldier.isDead || soldier.hp <= 0 || soldier.state === "HEALING") {
      rawGenericContactImpulses.delete(soldier);
      continue;
    }

    if (runtime.appliedTicks < SWF_GENERIC_CONTACT_K_TICKS
      && currentTime + 1e-6 >= runtime.nextStepAt) {
      applyRawGenericContactImpulseStep(soldier, runtime);
      runtime.appliedTicks += 1;
      runtime.nextStepAt += RAW_CONTACT_TICK_MS;
    }

    // Keep the runtime alive through the third k tick. It is removed only on
    // the following logic tick, when ordinary movement is allowed to resume.
    if (runtime.appliedTicks >= SWF_GENERIC_CONTACT_K_TICKS
      && currentTime + 1e-6 >= runtime.resumeAt) {
      rawGenericContactImpulses.delete(soldier);
    }
  }
}

export function resetRawGenericContactImpulses(soldiers: readonly Soldier[]): void {
  for (const soldier of soldiers) rawGenericContactImpulses.delete(soldier);
}
