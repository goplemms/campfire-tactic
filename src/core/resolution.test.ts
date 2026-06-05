import { describe, it, expect } from "vitest";
import { recoverMaterials } from "./resolution";
import { makeTrap } from "./entities";
import { createInventory, countOf } from "./inventory";

describe("Resolution material recovery (D13)", () => {
  it("on a win, recovers unsprung recoverable entities (incl. enemy salvage)", () => {
    const inv = createInventory(8);
    const unsprung = makeTrap("t1", { col: 2, row: 2 }, "player", 12);
    const sprung = makeTrap("t2", { col: 3, row: 3 }, "player", 12);
    sprung.sprung = true;
    const enemySnare = makeTrap("e1", { col: 5, row: 5 }, "enemy", 8); // salvage

    const result = recoverMaterials([unsprung, sprung, enemySnare], "player", inv);

    // Two unsprung kits recovered (yours + the enemy's salvage); the sprung one isn't.
    expect(result.recovered.sort()).toEqual(["trap-kit", "trap-kit"]);
    expect(countOf(inv, "trap-kit")).toBe(2);
  });

  it("recovers nothing on a loss or flee", () => {
    const inv = createInventory(8);
    const unsprung = makeTrap("t1", { col: 2, row: 2 }, "player", 12);
    expect(recoverMaterials([unsprung], "enemy", inv).recovered).toEqual([]);
    expect(recoverMaterials([unsprung], undefined, inv).recovered).toEqual([]);
    expect(countOf(inv, "trap-kit")).toBe(0);
  });

  it("never recovers a consumed (non-recoverable) material even unsprung", () => {
    const inv = createInventory(8);
    const rune = makeTrap("r1", { col: 1, row: 1 }, "player", 20, {
      materialId: "rune-reagent",
      recoverable: false,
    });
    expect(recoverMaterials([rune], "player", inv).recovered).toEqual([]);
    expect(countOf(inv, "rune-reagent")).toBe(0);
  });
});
