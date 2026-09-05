import type Phaser from "phaser";
import type { Rect } from "../systems/battlefieldGeometry";

export function drawCrossFence(graphics: Phaser.GameObjects.Graphics, rect: Rect, alpha = 1): void {
  graphics.fillStyle(0x8a5a32, 0.32 * alpha).fillRect(rect.x, rect.y, rect.width, rect.height);
  graphics.lineStyle(3, 0x69401f, 0.95 * alpha);
  const moduleHeight = Math.max(rect.width * 1.4, 18);
  for (let y = rect.y; y < rect.y + rect.height; y += moduleHeight) {
    const bottom = Math.min(rect.y + rect.height, y + moduleHeight);
    graphics.lineBetween(rect.x, y, rect.x + rect.width, bottom);
    graphics.lineBetween(rect.x + rect.width, y, rect.x, bottom);
  }
  graphics.lineStyle(1, 0xd0a064, 0.9 * alpha).strokeRect(rect.x, rect.y, rect.width, rect.height);
}
