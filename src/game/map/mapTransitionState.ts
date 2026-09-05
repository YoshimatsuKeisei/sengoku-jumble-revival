export const MAP_UI_FPS = 24;

export interface SelectedMapCell {
  cellId: string;
  gridX: number;
  gridY: number;
  type: string;
}

export interface BattleIntroSceneData {
  selectedMapCell: SelectedMapCell;
}

export interface BattleSceneData {
  selectedMapCell: SelectedMapCell;
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

export function createBattleIntroData(selectedMapCell: SelectedMapCell): BattleIntroSceneData {
  return { selectedMapCell: { ...selectedMapCell } };
}

export function createBattleSceneData(data: BattleIntroSceneData): BattleSceneData {
  return { selectedMapCell: { ...data.selectedMapCell } };
}

export class BattleIntroTransition {
  private readonly guard = new OnceTransitionGuard();

  frame(elapsedMs: number): number {
    return Math.min(96, frameAtElapsed(elapsedMs));
  }

  update(elapsedMs: number, startBattle: () => void): boolean {
    if (elapsedMs < 96 / MAP_UI_FPS * 1_000) return false;
    return this.guard.run(startBattle);
  }
}
