import type { BattleBase, Soldier, Team } from "../types";

export const BATTLE_PANEL_LOW_ALLY_COUNT = 2;

export interface CharacterStatusView {
  id: string;
  team: Team;
  name: string;
  hp: string;
  hpRatio: number;
  power: number;
  defense: number;
  skill: number;
  foot: number;
}

export interface BattlePanelViewModel {
  playerAlive: number;
  enemyAlive: number;
  playerBaseHp: number;
  enemyBaseHp: number;
  leftStatus: CharacterStatusView | null;
  rightStatus: CharacterStatusView | null;
}

export interface BattleUiSnapshot {
  soldiers: Record<string, {
    id: string;
    name: string;
    team: Team;
    controller: Soldier["controller"];
    hp: number;
    state: Soldier["state"];
    isDead: boolean;
    attackTargetId: string | null;
    attackHitApplied: boolean;
    specialAbilities: Soldier["specialAbilities"];
  }>;
  bases: Record<Team, { id: string; hp: number }>;
  playerAlive: number;
}

export type BattleUiNotification =
  | { kind: "event"; side: Team; message: string }
  | { kind: "temporary"; state: 2 | 3 | 4 };

function status(soldier: Soldier | null | undefined): CharacterStatusView | null {
  if (!soldier) return null;
  return {
    id: soldier.id,
    team: soldier.team,
    name: displaySoldierName(soldier),
    hp: `${Math.ceil(soldier.hp)}/${soldier.maxHp}`,
    hpRatio: soldier.maxHp > 0 ? Math.max(0, soldier.hp / soldier.maxHp) : 0,
    power: soldier.stats.combat,
    defense: soldier.stats.defense,
    skill: soldier.stats.skill,
    foot: soldier.stats.foot,
  };
}

function displaySoldierName(soldier: Pick<Soldier, "id" | "name">): string {
  return soldier.name && soldier.name !== soldier.id ? soldier.name : soldier.id.toUpperCase();
}

function baseFor(bases: readonly BattleBase[], team: Team): BattleBase {
  const base = bases.find((candidate) => candidate.team === team);
  if (!base) throw new Error(`Missing ${team} base for battle panel`);
  return base;
}

export function buildBattlePanelViewModel(
  soldiers: readonly Soldier[],
  bases: readonly BattleBase[],
  left: Soldier | null | undefined,
  right: Soldier | null | undefined,
): BattlePanelViewModel {
  const playerAlive = soldiers.filter((soldier) => soldier.team === "player" && !soldier.isDead).length;
  const enemyAlive = soldiers.filter((soldier) => soldier.team === "enemy" && !soldier.isDead).length;
  const playerBase = baseFor(bases, "player");
  const enemyBase = baseFor(bases, "enemy");
  return {
    playerAlive,
    enemyAlive,
    playerBaseHp: playerBase.hp,
    enemyBaseHp: enemyBase.hp,
    leftStatus: status(left),
    rightStatus: status(right),
  };
}

export function collectBattleUiSnapshot(soldiers: readonly Soldier[], bases: readonly BattleBase[]): BattleUiSnapshot {
  return {
    soldiers: Object.fromEntries(soldiers.map((soldier) => [soldier.id, {
      id: soldier.id,
      name: soldier.name,
      team: soldier.team,
      controller: soldier.controller,
      hp: soldier.hp,
      state: soldier.state,
      isDead: soldier.isDead,
      attackTargetId: soldier.attackTargetId,
      attackHitApplied: soldier.attackHitApplied,
      specialAbilities: [...soldier.specialAbilities],
    }])),
    bases: {
      player: { id: baseFor(bases, "player").id, hp: baseFor(bases, "player").hp },
      enemy: { id: baseFor(bases, "enemy").id, hp: baseFor(bases, "enemy").hp },
    },
    playerAlive: soldiers.filter((soldier) => soldier.team === "player" && !soldier.isDead).length,
  };
}

export function diffBattleUiSnapshots(previous: BattleUiSnapshot, current: BattleUiSnapshot): BattleUiNotification[] {
  const notifications: BattleUiNotification[] = [];
  for (const soldier of Object.values(current.soldiers)) {
    const before = previous.soldiers[soldier.id];
    if (!before) continue;
    if (!before.isDead && soldier.isDead) {
      notifications.push({ kind: "event", side: soldier.team, message: soldier.team === "enemy"
        ? `${displaySoldierName(soldier)} 討ち取ったり！`
        : `${displaySoldierName(soldier)} が戦線離脱！` });
    } else if (before.state !== "EMERGENCY_RETREAT" && soldier.state === "EMERGENCY_RETREAT" && soldier.controller === "player") {
      notifications.push({ kind: "event", side: "player", message: `${displaySoldierName(soldier)} 一時退避！` });
      notifications.push({ kind: "temporary", state: 4 });
    }
    if (soldier.team === "player" && soldier.hp > before.hp && (before.state === "HEALING" || soldier.state === "HEALING")) {
      notifications.push({ kind: "event", side: "player", message: `${displaySoldierName(soldier)}の療所効果！` });
    }
  }
  if (previous.playerAlive > BATTLE_PANEL_LOW_ALLY_COUNT && current.playerAlive <= BATTLE_PANEL_LOW_ALLY_COUNT) {
    notifications.push({ kind: "temporary", state: 3 });
  }
  for (const team of ["player", "enemy"] as const) {
    const before = previous.bases[team];
    const after = current.bases[team];
    if (after.hp === before.hp) {
      const guardedBaseHit = Object.values(current.soldiers).some((soldier) => {
        const previousSoldier = previous.soldiers[soldier.id];
        return soldier.team !== team && soldier.attackTargetId === after.id && soldier.attackHitApplied
          && previousSoldier && !previousSoldier.attackHitApplied;
      });
      const fortifier = Object.values(current.soldiers).find((soldier) => soldier.team === team && !soldier.isDead
        && soldier.specialAbilities.includes("FORTIFY"));
      if (guardedBaseHit && fortifier) notifications.push({
        kind: "event",
        side: team,
        message: `★${fortifier.id.toUpperCase()}の堅陣発動！`,
      });
    }
    if (after.hp >= before.hp) continue;
    if (team === "player") {
      notifications.push({ kind: "event", side: "player", message: after.hp <= 0
        ? "★自陣が攻略されています！" : "★自陣が攻撃されています！" });
      continue;
    }
    const attacker = Object.values(current.soldiers).find((soldier) => soldier.team === "player"
      && soldier.attackTargetId === after.id && soldier.attackHitApplied);
    notifications.push({ kind: "event", side: "enemy", message: attacker
      ? `${attacker.id.toUpperCase()} が敵陣を${after.hp <= 0 ? "攻略" : "攻撃"}！`
      : `敵陣を${after.hp <= 0 ? "攻略" : "攻撃"}！` });
  }
  return notifications;
}
