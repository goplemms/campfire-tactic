import { describe, it, expect } from "vitest";
import { createUnit, type Unit } from "./units";
import { Rng, streamFor } from "./rng";
import { generateEncounter } from "./generation";
import {
  intelFloor,
  scout,
  seerDivine,
  readEncounter,
  clampTier,
  MAX_TIER,
} from "./intel";

function member(id: string, intelligence = 0): Unit {
  return createUnit({
    id,
    side: "player",
    pos: { col: 0, row: 0 },
    intelligence,
    speed: 10,
    maxHp: 20,
    attack: 5,
    defense: 1,
    moveRange: 4,
    sightRadius: 5,
  });
}

const def = generateEncounter(streamFor("intel", "enc:0"), 0);

describe("intel — lanes up the ladder (D10)", () => {
  it("Lane 1: the Intelligence stat sets a banded passive floor", () => {
    expect(intelFloor([member("a", 0)])).toBe(0);
    expect(intelFloor([member("a", 3)])).toBe(1);
    expect(intelFloor([member("a", 6)])).toBe(2);
    expect(intelFloor([member("a", 9)])).toBe(3);
    // The party reads from its highest-Intelligence member.
    expect(intelFloor([member("a", 1), member("seer", 9)])).toBe(3);
  });

  it("Lane 2: scouting raises the read one tier (clamped at 3)", () => {
    expect(scout(0)).toBe(1);
    expect(scout(3)).toBe(3);
  });

  it("Lane 3: the Seer jumps a breakpoint (reagent +1; master may double)", () => {
    expect(seerDivine(0, new Rng("s"))).toBe(1); // low rank, reliable +1
    // A master read is free and may jump multiple — deterministic per stream.
    const masterJumps = new Set<number>();
    for (let i = 0; i < 30; i++) masterJumps.add(seerDivine(0, new Rng(`m${i}`), true));
    expect([...masterJumps].some((t) => t >= 2)).toBe(true);
  });
});

describe("intel — banded reveals (D10)", () => {
  it("reveals types → numbers → positions as the tier rises", () => {
    expect(readEncounter(def, 0).types).toBeUndefined();

    const t1 = readEncounter(def, 1);
    expect(t1.types && t1.types.length).toBeGreaterThan(0);
    expect(t1.count).toBeUndefined();

    const t2 = readEncounter(def, 2);
    expect(t2.count).toBe(def.enemies.length);
    expect(t2.positions).toBeUndefined();

    const t3 = readEncounter(def, 3);
    expect(t3.positions && t3.positions.length).toBe(def.enemies.length);
  });

  it("Tier 3 grants starting vision (the D18 bridge); lower tiers do not", () => {
    expect(readEncounter(def, 3).grantsVision).toBe(true);
    expect(readEncounter(def, 2).grantsVision).toBe(false);
    expect(clampTier(99)).toBe(MAX_TIER);
  });
});
