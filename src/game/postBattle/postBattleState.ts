import type {
  BattleBase,
  BattleResult,
  CommonSpecialAbilityId,
  RareSpecialAbilityId,
  Soldier,
  SoldierMeritCounters,
  Strategy,
  UnitTechnique,
  UnitType,
} from "../types";
import type { SelectedMapCell } from "../map/mapTransitionState";
import type { BattleSituationScore } from "../systems/battleOutcomeSystem";

export interface PostBattleSoldierSnapshot {
  readonly id: string;
  readonly name: string;
  readonly team: "player" | "enemy";
  readonly unitType: UnitType;
  readonly technique: UnitTechnique;
  readonly strategy: Strategy;
  readonly hp: number;
  readonly maxHp: number;
  readonly skill: number;
  readonly attack: number;
  readonly defense: number;
  readonly speed: number;
  readonly isWithdrawn: boolean;
  readonly specialAbilities: readonly CommonSpecialAbilityId[];
  readonly rareSpecialAbilities: readonly RareSpecialAbilityId[];
  readonly merits: Readonly<SoldierMeritCounters>;
  readonly stipend: number;
  readonly recruitCost: number;
}

export interface PostBattleResultMetrics {
  readonly playerRetreats: number | null;
  readonly enemyRetreats: number | null;
  readonly playerTotal: number | null;
  readonly enemyTotal: number | null;
  readonly acquiredMoney: number | null;
}

export interface PostBattleSnapshot {
  readonly battleResult: Exclude<BattleResult, null>;
  readonly playerRemaining: number;
  readonly enemyRemaining: number;
  readonly playerBaseHp: number | null;
  readonly enemyBaseHp: number | null;
  readonly playerRoster: readonly PostBattleSoldierSnapshot[];
  readonly enemyRoster: readonly PostBattleSoldierSnapshot[];
  readonly selectedAreaId: string | null;
  readonly selectedMapCell: Readonly<SelectedMapCell> | null;
  readonly resultMetrics: PostBattleResultMetrics;
  readonly economy: Readonly<{
    moneyBefore: number | null;
    moneyAfter: number | null;
    totalRank: number | null;
  }>;
  readonly meritCounters: Readonly<Record<string, Readonly<SoldierMeritCounters>>>;
  readonly recruitmentCandidates: null;
}

export interface PostBattleSceneData {
  snapshot: PostBattleSnapshot;
}

export interface PostBattleResolvedOutcome {
  readonly situation: BattleSituationScore;
  readonly acquiredMoney: number | null;
  readonly moneyBefore: number | null;
  readonly totalRank: number | null;
}

export function resolvePostBattleSoldierDisplayName(soldier: Pick<Soldier, "id" | "name">): string {
  return soldier.name || soldier.id;
}

function copySoldier(soldier: Soldier): PostBattleSoldierSnapshot {
  return Object.freeze({
    id: soldier.id,
    name: resolvePostBattleSoldierDisplayName(soldier),
    team: soldier.team,
    unitType: soldier.unitType,
    technique: soldier.technique,
    strategy: soldier.strategy,
    hp: soldier.hp,
    maxHp: soldier.maxHp,
    skill: soldier.stats.skill,
    attack: soldier.stats.combat,
    defense: soldier.stats.defense,
    speed: soldier.stats.foot,
    isWithdrawn: soldier.isDead,
    specialAbilities: Object.freeze([...soldier.specialAbilities]),
    rareSpecialAbilities: Object.freeze([...soldier.rareSpecialAbilities]),
    merits: Object.freeze({ ...soldier.merits }),
    stipend: soldier.stipend,
    recruitCost: soldier.stipend,
  });
}

export function createPostBattleSnapshot(
  result: Exclude<BattleResult, null>,
  soldiers: readonly Soldier[],
  bases: readonly BattleBase[],
  selectedMapCell: SelectedMapCell | null,
  outcome?: PostBattleResolvedOutcome,
): PostBattleSnapshot {
  const playerRoster = Object.freeze(soldiers.filter((soldier) => soldier.team === "player").map(copySoldier));
  const enemyRoster = Object.freeze(soldiers.filter((soldier) => soldier.team === "enemy").map(copySoldier));
  const playerBase = bases.find((base) => base.team === "player");
  const enemyBase = bases.find((base) => base.team === "enemy");
  return Object.freeze({
    battleResult: result,
    playerRemaining: playerRoster.filter((soldier) => !soldier.isWithdrawn).length,
    enemyRemaining: enemyRoster.filter((soldier) => !soldier.isWithdrawn).length,
    playerBaseHp: playerBase?.hp ?? null,
    enemyBaseHp: enemyBase?.hp ?? null,
    playerRoster,
    enemyRoster,
    selectedAreaId: selectedMapCell?.cellId ?? null,
    selectedMapCell: selectedMapCell ? Object.freeze({ ...selectedMapCell }) : null,
    resultMetrics: Object.freeze({
      playerRetreats: outcome?.situation.playerRetreats ?? null,
      enemyRetreats: outcome?.situation.enemyRetreats ?? null,
      playerTotal: outcome?.situation.player ?? null,
      enemyTotal: outcome?.situation.enemy ?? null,
      acquiredMoney: outcome?.acquiredMoney ?? null,
    }),
    economy: Object.freeze({
      moneyBefore: outcome?.moneyBefore ?? null,
      moneyAfter: outcome?.moneyBefore === null || outcome?.moneyBefore === undefined
        ? null
        : outcome.moneyBefore + (outcome.acquiredMoney ?? 0),
      totalRank: outcome?.totalRank ?? null,
    }),
    meritCounters: Object.freeze(Object.fromEntries(playerRoster.map((soldier) => [soldier.id, soldier.merits]))),
    recruitmentCandidates: null,
  });
}

export function displayPostBattleValue(value: number | string | null): string {
  return value === null ? "--" : String(value);
}
