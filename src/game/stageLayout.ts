import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";

export const SWF_STAGE_WIDTH = 380;
export const SWF_STAGE_HEIGHT = 380;

export type GameStageMode = "swf" | "battle";

function setStageMode(mode: GameStageMode): void {
  if (typeof document === "undefined") return;
  const root = document.querySelector<HTMLElement>("#game");
  if (!root) return;
  root.classList.toggle("game-stage--square", mode === "swf");
  root.classList.toggle("game-stage--wide", mode === "battle");
}

function resizeLogicalCanvas(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.scale.width !== width || scene.scale.height !== height) {
    scene.scale.resize(width, height);
  }
}

/** Configure a screen that belongs to the original fixed 380x380 SWF Stage. */
export function configureSwfGameStage(scene: Phaser.Scene): void {
  setStageMode("swf");
  resizeLogicalCanvas(scene, SWF_STAGE_WIDTH, SWF_STAGE_HEIGHT);
  scene.cameras.main
    .setViewport(0, 0, SWF_STAGE_WIDTH, SWF_STAGE_HEIGHT)
    .setScroll(0, 0)
    .setZoom(1)
    .setRoundPixels(true)
    .setBackgroundColor(0x000000);
}

/** Restore the widescreen runtime canvas before entering the battle world. */
export function configureBattleGameStage(scene: Phaser.Scene): void {
  setStageMode("battle");
  resizeLogicalCanvas(scene, GAME_WIDTH, GAME_HEIGHT);
  scene.cameras.main
    .setViewport(0, 0, GAME_WIDTH, GAME_HEIGHT)
    .setScroll(0, 0)
    .setZoom(1)
    .setRoundPixels(true)
    .setBackgroundColor(0xa9c978);
}
