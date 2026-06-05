import { describe, it, expect } from "vitest";
import {
  applyStatus,
  tickStatuses,
  hasStatus,
  immobilized,
  isImmobilized,
  incrementCounter,
  getCounter,
  setCounter,
} from "./status";
import { createUnit, type Unit } from "./units";

function unit(id = "u"): Unit {
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

describe("statuses", () => {
  it("applies, ticks down, and expires a status", () => {
    const u = unit();
    applyStatus(u, immobilized(2));
    expect(isImmobilized(u)).toBe(true);

    expect(tickStatuses(u)).toEqual([]); // 2 → 1
    expect(isImmobilized(u)).toBe(true);

    const expired = tickStatuses(u); // 1 → 0, expires
    expect(expired.map((s) => s.id)).toEqual(["immobilized"]);
    expect(isImmobilized(u)).toBe(false);
    expect(hasStatus(u, "immobilized")).toBe(false);
  });

  it("replaces a same-id status rather than stacking it", () => {
    const u = unit();
    applyStatus(u, immobilized(1));
    applyStatus(u, immobilized(3));
    expect(u.statuses.length).toBe(1);
    expect(u.statuses[0].duration).toBe(3);
  });
});

describe("per-unit counters (the capture-meter shape)", () => {
  it("increments a counter across turns", () => {
    const u = unit();
    expect(getCounter(u, "capture")).toBe(0);
    expect(incrementCounter(u, "capture")).toBe(1);
    incrementCounter(u, "capture", 2);
    expect(getCounter(u, "capture")).toBe(3);
    setCounter(u, "capture", 0);
    expect(getCounter(u, "capture")).toBe(0);
  });

  it("ticks a capture meter on each of a unit's turns via the bus shape", () => {
    // Mirrors how the snare's meter would tick on onTurnStart: a listener bumps
    // a per-unit counter every turn the unit takes.
    const u = unit();
    const takeTurn = () => incrementCounter(u, "captureMeter");
    takeTurn();
    takeTurn();
    takeTurn();
    expect(getCounter(u, "captureMeter")).toBe(3);
  });
});
