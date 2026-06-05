import { describe, it, expect } from "vitest";
import {
  gridToScreen,
  screenToGrid,
  TILE_WIDTH,
  TILE_HEIGHT,
  type GridCoord,
} from "./iso";

describe("iso projection", () => {
  it("places the origin tile at the screen origin", () => {
    expect(gridToScreen({ col: 0, row: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("projects a 2:1 diamond (col pushes right+down, row pushes left+down)", () => {
    expect(gridToScreen({ col: 1, row: 0 })).toEqual({
      x: TILE_WIDTH / 2,
      y: TILE_HEIGHT / 2,
    });
    expect(gridToScreen({ col: 0, row: 1 })).toEqual({
      x: -TILE_WIDTH / 2,
      y: TILE_HEIGHT / 2,
    });
  });

  it("round-trips grid -> screen -> grid", () => {
    const coords: GridCoord[] = [
      { col: 0, row: 0 },
      { col: 3, row: 2 },
      { col: 5, row: 7 },
    ];
    for (const c of coords) {
      const back = screenToGrid(gridToScreen(c));
      expect(back.col).toBeCloseTo(c.col);
      expect(back.row).toBeCloseTo(c.row);
    }
  });
});
