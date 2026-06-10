import Phaser from "phaser";
import { gridToScreen, screenToGrid, TILE_WIDTH, TILE_HEIGHT, type TileGrid, type GridCoord } from "../core";
import { COLOR } from "./theme";

/**
 * The shared **combat presentation** layer — the board geometry, the isometric
 * grid, and the tile-overlay primitives that both {@link "./scenes/DemoScene"}
 * (the standalone demo) and {@link "./scenes/BattleScene"} (the real mission loop)
 * render identically.
 *
 * Both scenes drive the *same* core `Battle`, but each grew its own copy of this
 * drawing code; the demo (a polish spike) pulled ahead and the mission scene fell
 * behind. This is the seam that re-unites them: a scene owns its `Battle`,
 * orchestration and display-list lifecycle, and *delegates* the pixel work here so
 * a board tweak — or a future feel/telegraphing pass — is written once and shows
 * up in both. It deliberately holds no game state and no scene-owned objects: the
 * caller passes in the `Graphics` to paint on and keeps ownership of teardown.
 */
export class CombatView {
  /** Board origin in screen space — the world offset added to every tile. */
  originX = 0;
  originY = 0;

  /** Re-anchor the board (call whenever the scene recomputes its layout). */
  setOrigin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
  }

  /** Tile coordinate → board-world pixel (the diamond's centre). */
  tileToWorld(coord: GridCoord): { x: number; y: number } {
    const { x, y } = gridToScreen(coord);
    return { x: this.originX + x, y: this.originY + y };
  }

  /** Board-world pixel → nearest tile coordinate. */
  worldToTile(px: number, py: number): GridCoord {
    const frac = screenToGrid({ x: px - this.originX, y: py - this.originY });
    return { col: Math.round(frac.col), row: Math.round(frac.row) };
  }

  /** Paint the whole grid onto `g`: a checkered diamond per tile, blocked tiles flagged. */
  drawGrid(g: Phaser.GameObjects.Graphics, grid: TileGrid): void {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const { x, y } = this.tileToWorld({ col, row });
        const walkable = grid.isWalkable({ col, row });
        const fill = !walkable ? COLOR.tileBlocked : (col + row) % 2 === 0 ? COLOR.tileLight : COLOR.tileDark;
        this.drawDiamond(g, x, y, fill);
      }
    }
  }

  /** A translucent wash over one tile (reach / threat / safe-zone), with an optional outline. */
  fillTile(g: Phaser.GameObjects.Graphics, coord: GridCoord, fill: number, alpha: number, line?: number): void {
    const { x, y } = this.tileToWorld(coord);
    this.diamondPath(g, x, y);
    g.fillStyle(fill, alpha);
    g.fillPath();
    if (line !== undefined) {
      g.lineStyle(2, line, 0.9);
      g.strokePath();
    }
  }

  /** A tile outline only — e.g. an enemy's attack-range marker. */
  outlineTile(g: Phaser.GameObjects.Graphics, coord: GridCoord, color: number): void {
    const { x, y } = this.tileToWorld(coord);
    this.diamondPath(g, x, y);
    g.lineStyle(2.5, color, 0.95);
    g.strokePath();
  }

  /** A solid, bordered tile diamond centred at world `(cx, cy)`. */
  private drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fill: number): void {
    g.fillStyle(fill, 1);
    g.lineStyle(1, COLOR.border, 1);
    this.diamondPath(g, cx, cy);
    g.fillPath();
    g.strokePath();
  }

  /** Trace a tile-sized diamond path centred at `(cx, cy)` (caller fills/strokes it). */
  private diamondPath(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
  }
}
