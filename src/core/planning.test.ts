import { describe, it, expect } from "vitest";
import { TileGrid } from "./grid";
import { planMove, planAttack } from "./planning";
import { createUnit, type Side, type Unit } from "./units";

function at(id: string, side: Side, col: number, row: number, moveRange = 3, attackRange = 1): Unit {
  return createUnit({ id, side, pos: { col, row }, speed: 10, maxHp: 10, attack: 5, defense: 0, moveRange, sightRadius: 6, attackRange });
}

describe("planMove", () => {
  it("returns the path clamped to the unit's effective move", () => {
    const actor = at("a", "player", 0, 0, 3);
    const path = planMove(actor, { col: 5, row: 0 }, [actor], new TileGrid(8, 1));
    expect(path).toEqual([{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }]);
  });

  it("returns null when the destination is the unit's own tile (no move)", () => {
    const actor = at("a", "player", 2, 0);
    expect(planMove(actor, { col: 2, row: 0 }, [actor], new TileGrid(8, 1))).toBeNull();
  });
});

describe("planAttack", () => {
  it("attacks in place when already in range", () => {
    const actor = at("a", "player", 0, 0);
    const foe = at("f", "enemy", 1, 0);
    expect(planAttack(actor, foe, [actor, foe], new TileGrid(8, 1))).toEqual({ path: [], attackTarget: foe });
  });

  it("attacks from range without closing for a ranged unit", () => {
    const actor = at("a", "player", 0, 0, 3, 2);
    const foe = at("f", "enemy", 2, 0);
    expect(planAttack(actor, foe, [actor, foe], new TileGrid(8, 1))).toEqual({ path: [], attackTarget: foe });
  });

  it("closes to one tile short and strikes when it lands in range", () => {
    const actor = at("a", "player", 0, 0, 3, 1);
    const foe = at("f", "enemy", 4, 0);
    const plan = planAttack(actor, foe, [actor, foe], new TileGrid(8, 1));
    expect(plan).toEqual({ path: [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }], attackTarget: foe });
  });

  it("moves but does not strike when the foe stays out of reach", () => {
    const actor = at("a", "player", 0, 0, 1, 1);
    const foe = at("f", "enemy", 5, 0);
    const plan = planAttack(actor, foe, [actor, foe], new TileGrid(8, 1));
    expect(plan).toEqual({ path: [{ col: 1, row: 0 }], attackTarget: null });
  });
});
