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
  createAlert,
  deployNoise,
  addNoise,
  rollAlerted,
  captureChance,
  settleAlert,
  NOISE_PER_DEPTH,
  CAPTURE_CHANCE_MAX,
  resolveDeployAction,
} from "./deployment";
import { CTClock, sideSeed } from "./clock";
import { Rng } from "./rng";
import { TileGrid } from "./grid";
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

describe("deployment stealth-alert layer (D11)", () => {
  // awareness 2 → safe depth 3 (2 + floor(2/2)).
  const scout = () => unit("scout", "player", 2);

  it("noise is silent within the safe zone and scales past it", () => {
    const u = scout();
    expect(safeDepth(u)).toBe(3);
    expect(deployNoise(u, 3)).toBe(0); // at the safe edge
    expect(deployNoise(u, 4)).toBe(NOISE_PER_DEPTH); // one tile past
    expect(deployNoise(u, 6)).toBe(3 * NOISE_PER_DEPTH);
  });

  it("the shared meter accumulates across units and clamps at the cap", () => {
    const alert = createAlert();
    addNoise(alert, scout(), 5); // +24
    addNoise(alert, scout(), 5); // +24 → 48
    expect(alert.meter).toBe(48);
    for (let i = 0; i < 20; i++) addNoise(alert, scout(), 7);
    expect(alert.meter).toBe(100); // clamped to ALERT_CAP
  });

  it("capture chance rises with depth and is capped", () => {
    const u = scout();
    expect(captureChance(u, 3)).toBe(0); // safe
    expect(captureChance(u, 4)).toBeCloseTo(0.15, 5);
    expect(captureChance(u, 99)).toBe(CAPTURE_CHANCE_MAX); // capped, never a sure loss
  });

  it("alert rolls are deterministic for a given seed", () => {
    const seq = (seed: number) => {
      const alert = createAlert();
      alert.meter = 50;
      const rng = new Rng(seed);
      return Array.from({ length: 8 }, () => rollAlerted(alert, rng));
    };
    expect(seq(42)).toEqual(seq(42)); // same seed → same outcomes
    // a 50% meter over 8 rolls should produce a mix (not all one way)
    const rolls = seq(42);
    expect(rolls.some(Boolean) && rolls.some((b) => !b)).toBe(true);
  });

  it("settling halves the meter after a survived spotting", () => {
    const alert = createAlert();
    alert.meter = 80;
    settleAlert(alert);
    expect(alert.meter).toBe(40);
  });
});

describe("resolveDeployAction — the shared stealth resolver (D11)", () => {
  // 6-wide board; awareness 2 → safe depth 3.
  const grid = () => new TileGrid(6, 4);
  const deep = (col: number) => {
    const u = unit("scout", "player", 2);
    u.pos = { col, row: 1 };
    return u;
  };

  it("a move inside the safe zone is silent (never spotted)", () => {
    const u = deep(2); // within safe depth 3
    const alert = createAlert();
    const out = resolveDeployAction(alert, u, grid(), [u], new Rng(1));
    expect(out.spotted).toBe(false);
    expect(alert.meter).toBe(0);
  });

  it("a forward action with a hot meter is spotted and retreats toward cover", () => {
    const u = deep(5); // 2 past safe
    const ally = unit("ally", "player", 2); // a second body so the last-unit shield doesn't apply
    const alert = createAlert();
    alert.meter = 100; // guarantee a spot
    const out = resolveDeployAction(alert, u, grid(), [u, ally], new Rng(7));
    expect(out.spotted).toBe(true);
    expect(out.retreatPath.length).toBeGreaterThan(0);
    // the retreat ends inside the safe zone
    expect(out.retreatPath[out.retreatPath.length - 1].col).toBeLessThanOrEqual(safeDepth(u));
  });

  it("the party's last un-captured unit is spotted but never netted", () => {
    const u = deep(5);
    const alert = createAlert();
    alert.meter = 100;
    const out = resolveDeployAction(alert, u, grid(), [u], new Rng(7)); // u is the only unit
    expect(out.spotted).toBe(true);
    expect(out.capturedAt).toBe(-1); // protected
  });

  it("is deterministic for a given seed", () => {
    const run = (seed: number) => {
      const u = deep(5);
      const ally = unit("ally", "player", 2);
      const alert = createAlert();
      alert.meter = 80;
      return resolveDeployAction(alert, u, grid(), [u, ally], new Rng(seed));
    };
    expect(run(123)).toEqual(run(123));
  });
});
