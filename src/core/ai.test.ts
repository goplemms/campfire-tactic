import { describe, it, expect } from "vitest";
import { planEnemyTurn } from "./ai";
import { TileGrid } from "./grid";
import { isAdjacent } from "./combat";
import { applyStatus, immobilized } from "./status";
import { createUnit, type Side, type Unit } from "./units";

function at(id: string, side: Side, col: number, row: number, moveRange = 3): Unit {
  return createUnit({
    id,
    side,
    pos: { col, row },
    speed: 10,
    maxHp: 10,
    attack: 5,
    defense: 0,
    moveRange,
    sightRadius: 6,
  });
}

describe("planEnemyTurn", () => {
  it("moves toward the nearest enemy and attacks when it reaches adjacency", () => {
    const grid = new TileGrid(8, 1);
    const enemy = at("e", "enemy", 0, 0);
    const player = at("p", "player", 4, 0);
    const plan = planEnemyTurn(enemy, [enemy, player], grid);

    // From col 0 toward col 4: closes to col 3 (moveRange 3), adjacent to player.
    expect(plan.destination).toEqual({ col: 3, row: 0 });
    expect(plan.target).toBe(player);
    expect(isAdjacent(plan.destination, player.pos)).toBe(true);
    // Every step is a legal walkable tile.
    for (const step of plan.path) expect(grid.isWalkable(step)).toBe(true);
  });

  it("attacks without moving when already adjacent", () => {
    const grid = new TileGrid(8, 1);
    const enemy = at("e", "enemy", 3, 0);
    const player = at("p", "player", 4, 0);
    const plan = planEnemyTurn(enemy, [enemy, player], grid);
    expect(plan.path).toEqual([]);
    expect(plan.target).toBe(player);
  });

  it("picks the nearer of two enemies", () => {
    const grid = new TileGrid(10, 1);
    const enemy = at("e", "enemy", 5, 0);
    const near = at("near", "player", 7, 0);
    const far = at("far", "player", 0, 0);
    const plan = planEnemyTurn(enemy, [enemy, near, far], grid);
    expect(plan.target ?? near).toBe(near);
    expect(plan.destination).toEqual({ col: 6, row: 0 });
  });

  it("does not move while immobilized but still attacks an adjacent foe", () => {
    const grid = new TileGrid(8, 1);
    const enemy = at("e", "enemy", 0, 0);
    const player = at("p", "player", 4, 0);
    applyStatus(enemy, immobilized(2));
    const plan = planEnemyTurn(enemy, [enemy, player], grid);
    expect(plan.path).toEqual([]);
    expect(plan.destination).toEqual({ col: 0, row: 0 });
    expect(plan.target).toBeNull();
  });

  it("stays put when there are no enemies left", () => {
    const grid = new TileGrid(8, 1);
    const enemy = at("e", "enemy", 2, 0);
    const plan = planEnemyTurn(enemy, [enemy], grid);
    expect(plan.path).toEqual([]);
    expect(plan.target).toBeNull();
  });
});
