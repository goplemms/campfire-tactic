import { describe, it, expect } from "vitest";
import {
  FATIGUE,
  fatigueTier,
  spendFatigue,
  restoreFatigue,
  fatiguePenalty,
  fatigueRisk,
} from "./fatigue";
import { createUnit, type Unit } from "./units";
import { createRun, type RunState } from "./run";
import { RunLoop } from "./runloop";
import { currentNode, reachableNodes, chooseNode } from "./run";

function roster(): Unit[] {
  return [
    createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, jobId: "soldier", speed: 12, maxHp: 30, attack: 9, defense: 3, moveRange: 4, sightRadius: 5, awareness: 4, intelligence: 4 }),
    createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, jobId: "survivalist", speed: 10, maxHp: 24, attack: 11, defense: 2, moveRange: 4, sightRadius: 5, awareness: 2 }),
  ];
}

function newRun(seed: string): RunState {
  return createRun(seed, { party: roster(), difficultyId: "normal", gold: 200 });
}

describe("fatigue — defaults & banding (D35)", () => {
  it("a fresh unit starts Rested at 0", () => {
    const u = roster()[0];
    expect(u.fatigue).toBe(0);
    expect(fatigueTier(0)).toBe("Rested");
  });

  it("the floor is a wide, invisible allowance — normal play never bites", () => {
    // Every level within the allowance bands as Rested/Worn with no penalty.
    for (let level = 0; level <= FATIGUE.floor; level++) {
      const p = fatiguePenalty(level);
      expect(p.surcharge).toBe(0);
      expect(p.lockAtOrAbove).toBe(Infinity);
      expect(["Rested", "Worn"]).toContain(fatigueTier(level));
    }
  });
});

describe("fatigue — the asymmetric floor bites only past the threshold", () => {
  it("sustained over-extension (repeated spends, no rest) eventually bites", () => {
    let level = 0;
    // A handful of spends stays within the allowance — no bite.
    for (let i = 0; i < 3; i++) level = spendFatigue(level, 2);
    expect(level).toBeLessThanOrEqual(FATIGUE.floor);
    expect(fatiguePenalty(level).surcharge).toBe(0);

    // Keep greedily spending without resting — now it bites.
    for (let i = 0; i < 4; i++) level = spendFatigue(level, 2);
    expect(level).toBeGreaterThan(FATIGUE.floor);
    expect(fatiguePenalty(level).surcharge).toBeGreaterThan(0);
    expect(fatigueTier(level)).not.toBe("Rested");
  });

  it("the bite is bounded and gentle (surcharge never runs away)", () => {
    // Even at the hard ceiling the surcharge is capped — never a wall.
    for (let level = 0; level <= FATIGUE.ceiling; level++) {
      expect(fatiguePenalty(level).surcharge).toBeLessThanOrEqual(FATIGUE.maxSurcharge);
    }
    expect(fatiguePenalty(FATIGUE.ceiling).surcharge).toBe(FATIGUE.maxSurcharge);
  });

  it("only deep exhaustion locks the most-demanding actions; cheap ones never lock", () => {
    // Over the floor but not yet exhausted: a surcharge, but nothing locks.
    const weary = fatiguePenalty(FATIGUE.floor + 1);
    expect(weary.surcharge).toBeGreaterThan(0);
    expect(weary.lockAtOrAbove).toBe(Infinity);

    // Exhausted: demanding actions lock, but the threshold leaves cheap ones open.
    const spent = fatiguePenalty(FATIGUE.exhausted);
    expect(spent.lockAtOrAbove).toBe(FATIGUE.demandingCost);
    expect(FATIGUE.demandingCost).toBeGreaterThan(1); // a 1-cost action is never locked
  });

  it("spend clamps at the hard ceiling (no unbounded runaway)", () => {
    let level = 0;
    for (let i = 0; i < 100; i++) level = spendFatigue(level, 5);
    expect(level).toBe(FATIGUE.ceiling);
  });

  it("fatigueRisk is a clamped 0..1 meter", () => {
    expect(fatigueRisk(0)).toBe(0);
    expect(fatigueRisk(FATIGUE.exhausted)).toBe(1);
    expect(fatigueRisk(FATIGUE.ceiling)).toBe(1); // clamped
  });
});

describe("fatigue — rest restores (rest's second job, D35)", () => {
  it("restoreFatigue wipes any level back to Rested", () => {
    expect(restoreFatigue(FATIGUE.exhausted)).toBe(FATIGUE.rested);
    expect(restoreFatigue(3)).toBe(0);
  });

  it("a rest node restores every member's fatigue to Rested", () => {
    const run = newRun("fatigue-rest");
    const restNode = run.map.order
      .map((id) => currentNodeOf(run, id))
      .find((n) => n.kind === "rest" && n.layer > 0)!;
    run.mapNodeId = restNode.id;
    run.path.push(restNode.id);
    // Over-extend the whole party first.
    for (const u of run.party) u.fatigue = FATIGUE.exhausted;

    const loop = new RunLoop(run);
    const res = loop.restNode();

    expect(res.fatigueRestored.sort()).toEqual(run.party.map((u) => u.id).sort());
    for (const u of run.party) expect(u.fatigue).toBe(0);
  });
});

describe("fatigue — never a combat stat (D29 two-economies separation)", () => {
  it("a full battle leaves the actors' fatigue untouched", () => {
    const run = newRun("fatigue-combat");
    // Pre-load fatigue, then play a combat node to a decision.
    for (const u of run.party) u.fatigue = 4;
    const before = run.party.map((u) => u.fatigue);

    const loop = new RunLoop(run);
    // Walk to the first combat node and run the whole encounter.
    while (true) {
      const next = reachableNodes(run);
      const combat = next.find((n) => n.kind === "combat") ?? next[0];
      chooseNode(run, combat.id);
      if (currentNode(run).kind === "combat") break;
    }
    loop.camp();
    loop.startEncounter();
    loop.beginBattle();
    loop.autoBattle();
    loop.resolve();

    // Combat touched HP/CT/etc. but never the overworld fatigue meter.
    expect(run.party.map((u) => u.fatigue)).toEqual(before);
  });
});

/** Helper: resolve a node by id (avoids importing getNode just for the test). */
function currentNodeOf(run: RunState, id: string) {
  return run.map.nodes[id];
}
