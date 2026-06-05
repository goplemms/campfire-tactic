import { describe, it, expect } from "vitest";
import { EventBus } from "./events";
import { EntityRegistry, type FieldEntity } from "./entities";
import { createUnit, type Unit } from "./units";

function unit(id: string): Unit {
  return createUnit({
    id,
    side: "player",
    pos: { col: 0, row: 0 },
    speed: 10,
    maxHp: 10,
    attack: 5,
    defense: 0,
    moveRange: 3,
    sightRadius: 4,
  });
}

describe("EventBus", () => {
  it("delivers emitted events to subscribers", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("turnStart", ({ unit }) => seen.push(unit.id));

    bus.emit("turnStart", { unit: unit("rook") });
    bus.emit("turnStart", { unit: unit("vale") });
    expect(seen).toEqual(["rook", "vale"]);
  });

  it("unsubscribes via the returned function", () => {
    const bus = new EventBus();
    let calls = 0;
    const off = bus.on("turnEnd", () => calls++);
    bus.emit("turnEnd", { unit: unit("a") });
    off();
    bus.emit("turnEnd", { unit: unit("a") });
    expect(calls).toBe(1);
  });

  it("isolates a throwing handler from the others", () => {
    const bus = new EventBus();
    let reached = false;
    bus.on("turnStart", () => {
      throw new Error("boom");
    });
    bus.on("turnStart", () => (reached = true));
    expect(() => bus.emit("turnStart", { unit: unit("a") })).not.toThrow();
    expect(reached).toBe(true);
  });
});

describe("EntityRegistry (the trivial trap seam)", () => {
  it("fires a registered entity when a unit enters its tile", () => {
    const bus = new EventBus();
    const registry = new EntityRegistry(bus);

    let sprung = 0;
    let forcedSeen: boolean | undefined;
    const trap: FieldEntity = {
      id: "trap-1",
      pos: { col: 2, row: 3 },
      onUnitEnterTile: ({ forced }) => {
        sprung++;
        forcedSeen = forced;
      },
    };
    registry.register(trap);

    const mover = unit("mover");
    // Enter a different tile — trap stays quiet.
    bus.emit("unitEnterTile", { unit: mover, tile: { col: 0, row: 0 } });
    expect(sprung).toBe(0);

    // Enter the trap's tile — it reacts.
    bus.emit("unitEnterTile", { unit: mover, tile: { col: 2, row: 3 } });
    expect(sprung).toBe(1);
    expect(forcedSeen).toBe(false);

    // Forced entry (D19) is flagged through to the entity.
    bus.emit("unitEnterTile", {
      unit: mover,
      tile: { col: 2, row: 3 },
      forced: true,
    });
    expect(sprung).toBe(2);
    expect(forcedSeen).toBe(true);

    expect(registry.at({ col: 2, row: 3 })).toEqual([trap]);
  });
});
