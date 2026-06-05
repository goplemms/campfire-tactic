import { describe, it, expect } from "vitest";
import { TileGrid } from "./grid";
import { findPath } from "./pathfinding";
import type { GridCoord } from "./iso";

/** Sum of step distances along a path; 1 per orthogonal step if contiguous. */
function isContiguous(path: GridCoord[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const dist =
      Math.abs(path[i].col - path[i - 1].col) +
      Math.abs(path[i].row - path[i - 1].row);
    if (dist !== 1) return false;
  }
  return true;
}

describe("findPath (A*)", () => {
  it("finds a straight shortest path on an open grid", () => {
    const grid = new TileGrid(5, 1);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 });
    expect(path).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
      { col: 4, row: 0 },
    ]);
  });

  it("returns a single-tile path when start === goal", () => {
    const grid = new TileGrid(3, 3);
    const path = findPath(grid, { col: 1, row: 1 }, { col: 1, row: 1 });
    expect(path).toEqual([{ col: 1, row: 1 }]);
  });

  it("routes around a blocked tile", () => {
    // A wall down the middle column with one gap at the bottom forces a detour.
    //   col: 0 1 2
    // row0:  . X .
    // row1:  . X .
    // row2:  . . .   <- gap at (1,2)
    const grid = new TileGrid(3, 3, [
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ]);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 });
    expect(path).not.toBeNull();
    const p = path!;
    expect(p[0]).toEqual({ col: 0, row: 0 });
    expect(p[p.length - 1]).toEqual({ col: 2, row: 0 });
    expect(isContiguous(p)).toBe(true);
    // It must detour through the gap, never stepping on a blocked tile.
    expect(p.some((c) => c.col === 1 && c.row === 2)).toBe(true);
    expect(p.some((c) => grid.isWalkable(c) === false)).toBe(false);
  });

  it("returns null when the goal is walled off", () => {
    // Fully enclose the goal tile (2,2) on a 3x3 grid.
    const grid = new TileGrid(3, 3, [
      { col: 1, row: 2 },
      { col: 2, row: 1 },
    ]);
    const path = findPath(grid, { col: 0, row: 0 }, { col: 2, row: 2 });
    expect(path).toBeNull();
  });

  it("returns null when start or goal is itself blocked", () => {
    const grid = new TileGrid(3, 3, [{ col: 1, row: 1 }]);
    expect(findPath(grid, { col: 1, row: 1 }, { col: 0, row: 0 })).toBeNull();
    expect(findPath(grid, { col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull();
  });

  it("returns null when the goal is out of bounds", () => {
    const grid = new TileGrid(3, 3);
    expect(findPath(grid, { col: 0, row: 0 }, { col: 9, row: 9 })).toBeNull();
  });
});
