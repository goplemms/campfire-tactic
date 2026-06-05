import { describe, it, expect } from "vitest";
import { CTClock, ACT_COST, MOVE_COST, sideSeed } from "./clock";
import { EventBus } from "./events";
import { createUnit, type Unit } from "./units";

function unit(id: string, speed: number, side: "player" | "enemy" = "player"): Unit {
  return createUnit({
    id,
    side,
    pos: { col: 0, row: 0 },
    speed,
    maxHp: 10,
    attack: 5,
    defense: 0,
    moveRange: 3,
    sightRadius: 4,
  });
}

describe("CTClock", () => {
  it("orders turns by Speed — the faster unit acts first and more often", () => {
    const fast = unit("fast", 20);
    const slow = unit("slow", 10);
    const clock = new CTClock([fast, slow]);

    // Fast reaches the threshold first.
    expect(clock.advanceToNextActor()).toBe(fast);
    clock.spend(fast, { acted: true });

    // Over a longer run, the fast unit takes roughly twice as many turns.
    let fastTurns = 0;
    let slowTurns = 0;
    for (let i = 0; i < 30; i++) {
      const actor = clock.advanceToNextActor();
      if (actor === fast) fastTurns++;
      else slowTurns++;
      clock.spend(actor!, { acted: true });
    }
    expect(fastTurns).toBeGreaterThan(slowTurns);
  });

  it("spends more CT for Act than for Move (movers come back up sooner)", () => {
    const u = unit("u", 10);
    u.ct = 100;
    const clock = new CTClock([u]);

    clock.spend(u, { acted: true });
    expect(u.ct).toBe(100 - ACT_COST);

    u.ct = 100;
    clock.spend(u, { moved: true });
    expect(u.ct).toBe(100 - MOVE_COST);
    expect(MOVE_COST).toBeLessThan(ACT_COST);
  });

  it("seeds initiative from each side's average Speed (D11)", () => {
    const p1 = unit("p1", 12, "player");
    const p2 = unit("p2", 8, "player");
    const e1 = unit("e1", 20, "enemy");
    const units = [p1, p2, e1];

    expect(sideSeed(units, "player")).toBe(10);
    expect(sideSeed(units, "enemy")).toBe(20);

    const clock = new CTClock(units);
    clock.seedInitiative();
    expect(p1.ct).toBe(10);
    expect(p2.ct).toBe(10);
    expect(e1.ct).toBe(20);

    // The higher-seeded (faster) side reaches its turn first.
    expect(clock.advanceToNextActor()).toBe(e1);
  });

  it("resolves a scheduled effect at the correct CT and emits chargeResolved", () => {
    const u = unit("u", 10);
    const bus = new EventBus();
    const clock = new CTClock([u], bus);

    let resolvedAt = -1;
    const resolvedIds: string[] = [];
    bus.on("chargeResolved", ({ id }) => resolvedIds.push(id));

    // A charge of speed 25 fills 100 over exactly 4 ticks.
    clock.schedule({
      id: "frost",
      speed: 25,
      run: () => {
        resolvedAt = clock.time;
      },
    });
    expect(clock.pendingEffects()).toBe(1);

    clock.tick(); // gauge 25
    clock.tick(); // gauge 50
    clock.tick(); // gauge 75
    expect(resolvedAt).toBe(-1);
    clock.tick(); // gauge 100 → resolves
    expect(resolvedAt).toBe(4);
    expect(resolvedIds).toEqual(["frost"]);
    expect(clock.pendingEffects()).toBe(0);
  });
});
