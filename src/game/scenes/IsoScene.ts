import Phaser from "phaser";
import { gridToScreen, TILE_WIDTH, TILE_HEIGHT } from "../../core";

/**
 * M1 walking-skeleton scene: draw a small isometric grid so we can see the
 * core/render split working end to end. The scene owns *no* game logic — it asks
 * `core` where each tile goes and only paints the result.
 */
export class IsoScene extends Phaser.Scene {
  private static readonly COLS = 6;
  private static readonly ROWS = 6;

  constructor() {
    super("IsoScene");
  }

  create(): void {
    const g = this.add.graphics();
    const originX = this.scale.width / 2;
    const originY = this.scale.height / 2 - (IsoScene.ROWS * TILE_HEIGHT) / 2;

    for (let row = 0; row < IsoScene.ROWS; row++) {
      for (let col = 0; col < IsoScene.COLS; col++) {
        const { x, y } = gridToScreen({ col, row });
        // Subtle checker so the diamonds read as a grid.
        const fill = (col + row) % 2 === 0 ? 0x2a3550 : 0x222b40;
        this.drawTile(g, originX + x, originY + y, fill);
      }
    }
  }

  /** Draw a single iso diamond centered on (cx, cy). */
  private drawTile(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    fill: number,
  ): void {
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    g.fillStyle(fill, 1);
    g.lineStyle(1, 0x3d4b6e, 1);
    g.beginPath();
    g.moveTo(cx, cy - halfH);
    g.lineTo(cx + halfW, cy);
    g.lineTo(cx, cy + halfH);
    g.lineTo(cx - halfW, cy);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
