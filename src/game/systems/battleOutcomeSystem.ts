import type { BattleBase, BattleResult, Soldier } from "../types";

export const SWF_BATTLE_FPS = 24;
export const BATTLE_DURATION_SECONDS = 180;
export const SWF_CLOCK_INITIAL_COUNTER = 19;
export const SWF_CLOCK_TICK_LIMIT = 22;
export const ADVANTAGE_MINIMUM_POINT_LEAD = 30;
export const ADVANTAGE_EARLIEST_REMAINING_SECONDS = 120;
// Sprite2531's result label `maku` is root frames 97..160 (64 frames),
// not a replay of the complete 160-frame clip.
export const BATTLE_END_SEQUENCE_FRAMES = 64;
export const BATTLE_END_SEQUENCE_MS = BATTLE_END_SEQUENCE_FRAMES / SWF_BATTLE_FPS * 1_000;

export const BALANCE_GAUGE_INITIAL_FRAME = 300;
export const BALANCE_GAUGE_MIN_FRAME = 1;
export const BALANCE_GAUGE_MAX_FRAME = 600;

export type BattleEndReason = "BASE" | "ELIMINATION" | "TIME" | "ADVANTAGE" | "EXIT";

export interface BattleSituationScore {
  player: number;
  enemy: number;
  playerBaseHp: number;
  enemyBaseHp: number;
  playerRemaining: number;
  enemyRemaining: number;
  playerRetreats: number;
  enemyRetreats: number;
}

export interface BattleClockState {
  remainingSeconds: number;
  tickCounter: number;
  frameRemainderMs: number;
  advantageTriggered: boolean;
}

export interface BattleClockUpdate {
  expired: boolean;
  advantageTriggered: boolean;
}

export function createBattleClockState(): BattleClockState {
  return {
    remainingSeconds: BATTLE_DURATION_SECONDS,
    tickCounter: SWF_CLOCK_INITIAL_COUNTER,
    frameRemainderMs: 0,
    advantageTriggered: false,
  };
}

export function formatBattleTime(remainingSeconds: number): string {
  const seconds = Math.max(0, Math.floor(remainingSeconds));
  const minute = Math.floor(seconds / 60);
  const second = seconds - minute * 60;
  return `${minute}:${second < 10 ? "0" : ""}${second}`;
}

function baseHp(bases: readonly BattleBase[], team: "player" | "enemy"): number {
  return bases.find((base) => base.team === team)?.hp ?? 0;
}

export function calculateBattleSituation(
  soldiers: readonly Soldier[],
  bases: readonly BattleBase[],
): BattleSituationScore {
  const playerRemaining = soldiers.filter((soldier) => soldier.team === "player" && !soldier.isDead).length;
  const enemyRemaining = soldiers.filter((soldier) => soldier.team === "enemy" && !soldier.isDead).length;
  const playerRetreats = soldiers
    .filter((soldier) => soldier.team === "player")
    .reduce((sum, soldier) => sum + soldier.temporaryRetreatCount, 0);
  const enemyRetreats = soldiers
    .filter((soldier) => soldier.team === "enemy")
    .reduce((sum, soldier) => sum + soldier.temporaryRetreatCount, 0);
  const playerBaseHp = baseHp(bases, "player");
  const enemyBaseHp = baseHp(bases, "enemy");
  return {
    player: playerBaseHp * 5 + playerRemaining * 3 + enemyRetreats,
    enemy: enemyBaseHp * 5 + enemyRemaining * 3 + playerRetreats,
    playerBaseHp,
    enemyBaseHp,
    playerRemaining,
    enemyRemaining,
    playerRetreats,
    enemyRetreats,
  };
}

export function battleResultFromSituation(score: BattleSituationScore): Exclude<BattleResult, null> {
  return score.player > score.enemy ? "VICTORY" : "DEFEAT";
}

export function calculateLocalVictoryReward(level: number, score: BattleSituationScore): number {
  return Math.floor(level * (score.player - score.enemy + 10) * 1.2 + level * 20) + 150;
}

export function getBattleBalanceTargetFrame(score: Pick<BattleSituationScore, "player" | "enemy">): number {
  return Math.max(
    BALANCE_GAUGE_MIN_FRAME,
    Math.min(BALANCE_GAUGE_MAX_FRAME, (score.player - score.enemy + 30) * 10),
  );
}

export function smoothBattleBalanceFrame(current: number, target: number): number {
  return current + (target - current) / 8;
}

export function advanceBattleClock(
  state: BattleClockState,
  deltaMs: number,
  score: Pick<BattleSituationScore, "player" | "enemy">,
  allowAdvantageVictory = true,
): BattleClockUpdate {
  const frameMs = 1_000 / SWF_BATTLE_FPS;
  state.frameRemainderMs += Math.max(0, deltaMs);
  let triggeredNow = false;
  while (state.frameRemainderMs + 1e-9 >= frameMs && state.remainingSeconds > 0) {
    state.frameRemainderMs -= frameMs;
    state.tickCounter += 1;
    if (state.tickCounter <= SWF_CLOCK_TICK_LIMIT) continue;
    state.tickCounter = 0;
    state.remainingSeconds -= 1;
    if (state.remainingSeconds <= 0) break;
    if (
      allowAdvantageVictory
      && !state.advantageTriggered
      && state.remainingSeconds <= ADVANTAGE_EARLIEST_REMAINING_SECONDS
      && score.player >= score.enemy + ADVANTAGE_MINIMUM_POINT_LEAD
    ) {
      state.remainingSeconds = 1;
      state.advantageTriggered = true;
      triggeredNow = true;
      // Keep the SWF's visible one-tick advantage notice even after a large
      // browser delta; the 1 -> 0 transition belongs to the next update call.
      break;
    }
  }
  return { expired: state.remainingSeconds === 0, advantageTriggered: triggeredNow };
}
