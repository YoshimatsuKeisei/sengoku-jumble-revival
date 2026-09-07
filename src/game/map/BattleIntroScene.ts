import Phaser from "phaser";
import { DEFAULT_MAP_CELL_ID, getMapCell, toSelectedMapCell } from "./mapUiModel";
import {
  createBattleSceneData,
  type BattleIntroSceneData,
} from "./mapTransitionState";

/** Compatibility route. BattleScene now owns the intro overlay and camera. */
export class BattleIntroScene extends Phaser.Scene {
  private introData!: BattleIntroSceneData;

  constructor() {
    super("BattleIntro");
  }

  init(data?: BattleIntroSceneData): void {
    const fallback = getMapCell(DEFAULT_MAP_CELL_ID)!;
    this.introData = data?.selectedMapCell
      ? {
          selectedMapCell: { ...data.selectedMapCell },
          ...(data.economy ? { economy: { ...data.economy } } : {}),
        }
      : { selectedMapCell: toSelectedMapCell(fallback) };
  }

  create(): void {
    this.scene.start("Battle", createBattleSceneData(this.introData));
  }
}
