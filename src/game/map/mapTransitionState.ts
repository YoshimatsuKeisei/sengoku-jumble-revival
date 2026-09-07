export const MAP_UI_FPS = 24;

export interface SelectedMapCell {
  cellId: string;
  gridX: number;
  gridY: number;
  type: string;
}

export interface BattleEconomyState {
  money: number;
  totalRank: number;
}

export interface BattleIntroSceneData {
  selectedMapCell: SelectedMapCell;
  economy?: BattleEconomyState;
}

export interface BattleSceneData {
  selectedMapCell: SelectedMapCell;
  economy?: BattleEconomyState;
  playIntro?: boolean;
}

export function frameAtElapsed(elapsedMs: number, firstFrame = 1): number {
  return firstFrame + Math.floor(Math.max(0, elapsedMs) * MAP_UI_FPS / 1_000 + 1e-9);
}

export class OnceTransitionGuard {
  private fired = false;

  run(action: () => void): boolean {
    if (this.fired) return false;
    this.fired = true;
    action();
    return true;
  }
}

export function createBattleIntroData(
  selectedMapCell: SelectedMapCell,
  economy?: BattleEconomyState,
): BattleIntroSceneData {
  return {
    selectedMapCell: { ...selectedMapCell },
    ...(economy ? { economy: { ...economy } } : {}),
  };
}

export function createBattleSceneData(data: BattleIntroSceneData): BattleSceneData {
  return {
    selectedMapCell: { ...data.selectedMapCell },
    ...(data.economy ? { economy: { ...data.economy } } : {}),
    playIntro: true,
  };
}
