import { describe, it, expect } from "vitest";
import {
  createExposure,
  safeDepth,
  placementCost,
  recordPlacement,
  exposureRisk,
  freeCaptive,
  isCaptured,
  CAPTURE_THRESHOLD,
} from "./deployment";
import { CTClock, sideSeed } from "./clock";
import { createUnit, type Side, type Unit } from "./units";

function unit(id: string, side: Side, awareness: number, speed = 10): Unit {
  return createUnit({
    id,
    side,
    pos: { col: 0, row: 0 },
    awareness,
    speed,
    maxHp: 20,
    attack: 5,
    defense: 1,
    moveRange: 3,
    sightRadius: 4,
  });
}

describe("deployment exposure gamble (D7/D11)", () => {
  it("ranges deeper for free at higher Awareness (banded safe depth)", () => {
    const cautious = unit("Bram", "player", 6); // 2 + 3 = 5
    const reckless = unit("Vale", "player", 2); // 2 + 1 = 3
    expect(safeDepth(cautious)).toBe(5);
    expect(safeDepth(reckless)).toBe(3);
  });

  it("charges exposure per tile of depth beyond the safe zone", () => {
    const vale = unit("Vale", "player", 2); // safe depth 3, 25 per tile deeper
    expect(placementCost(vale, 3)).toBe(0); // within safe depth
    expect(placementCost(vale, 4)).toBe(25);
    expect(placementCost(vale, 6)).toBe(75);
  });

  it("accrues exposure only on deep placements and captures at the threshold", () => {
    const vale = unit("Vale", "player", 2); // safe depth 3
    const st = createExposure();

    // A placement inside the safe depth → free.
    expect(recordPlacement(st, vale, 2)).toEqual({ exposureAdded: 0, captured: false });
    expect(st.exposure).toBe(0);

    // Depth 5 → +50, risk 50%.
    expect(recordPlacement(st, vale, 5)).toEqual({ exposureAdded: 50, captured: false });
    expect(exposureRisk(st)).toBeCloseTo(0.5);
    expect(isCaptured(vale)).toBe(false);

    // Another depth-5 placement → +50 ⇒ 100 ⇒ captured.
    const r = recordPlacement(st, vale, 5);
    expect(r.exposureAdded).toBe(50);
    expect(r.captured).toBe(true);
    expect(st.exposure).toBeGreaterThanOrEqual(CAPTURE_THRESHOLD);
    expect(isCaptured(vale)).toBe(true);
    expect(vale.ct).toBe(0);
  });

  it("high Awareness preps deep before any risk", () => {
    const bram = unit("Bram", "player", 6); // safe depth 5
    const st = createExposure();
    recordPlacement(st, bram, 4);
    recordPlacement(st, bram, 5);
    expect(st.exposure).toBe(0);
    expect(isCaptured(bram)).toBe(false);
  });
});

describe("initiative seed excludes captured units (D7 → D11)", () => {
  it("a captured unit drops from its side's seed and never takes a turn", () => {
    const rook = unit("Rook", "player", 4, 12);
    const vale = unit("Vale", "player", 2, 10);
    const foe = unit("Grunt", "enemy", 3, 9);
    const units = [rook, vale, foe];

    // Before capture, the player seed sums Rook+Vale = 22.
    expect(sideSeed(units, "player")).toBe(22);

    // Capture Vale → the seed DROPS to just Rook (12): losing a unit cost tempo.
    vale.captured = true;
    expect(sideSeed(units, "player")).toBe(12);

    // ...but with Rook also gone the seed would collapse. Here, verify the clock
    // never hands a captured unit a turn.
    const clock = new CTClock(units);
    clock.seedInitiative();
    expect(vale.ct).toBe(0);
    let sawVale = false;
    for (let i = 0; i < 20; i++) {
      const actor = clock.advanceToNextActor();
      if (actor === vale) sawVale = true;
      if (actor) clock.spend(actor, { acted: true });
    }
    expect(sawVale).toBe(false);

    // Freed mid-battle, Vale rejoins the clock and can act.
    freeCaptive(vale);
    let sawValeNow = false;
    for (let i = 0; i < 20; i++) {
      const actor = clock.advanceToNextActor();
      if (actor === vale) sawValeNow = true;
      if (actor) clock.spend(actor, { acted: true });
    }
    expect(sawValeNow).toBe(true);
  });
});
