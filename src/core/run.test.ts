import { describe, it, expect } from "vitest";
import { createUnit, type Unit } from "./units";
import {
  createRun,
  currentEncounter,
  activeRoster,
  removeFromRoster,
  isRunOver,
  snapshotRun,
  type RunState,
} from "./run";
import { RunLoop } from "./runloop";

/** A small fightable roster (Soldiers so they have battle skills too). */
function roster(): Unit[] {
  return [
    createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, jobId: "soldier", speed: 12, maxHp: 30, attack: 9, defense: 3, moveRange: 4, sightRadius: 5, awareness: 4, intelligence: 4 }),
    createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, jobId: "survivalist", speed: 10, maxHp: 24, attack: 11, defense: 2, moveRange: 4, sightRadius: 5, awareness: 2 }),
  ];
}

function newRun(seed: string): RunState {
  return createRun(seed, { party: roster(), difficultyId: "normal", gold: 200 });
}

describe("run — state & permadeath", () => {
  it("active roster excludes captured/fallen; permadeath removes a unit", () => {
    const run = newRun("perma");
    expect(activeRoster(run).length).toBe(2);

    const vale = run.party.find((u) => u.id === "Vale")!;
    vale.alive = false; // fell in combat
    expect(activeRoster(run).length).toBe(1);

    removeFromRoster(run, vale);
    expect(run.party.length).toBe(1);
  });

  it("isRunOver fires only on a full wipe", () => {
    const run = newRun("wipe");
    expect(isRunOver(run)).toBe(false);
    for (const u of run.party) u.alive = false;
    expect(isRunOver(run)).toBe(true);
  });

  it("currentEncounter is deterministic for a seed + index", () => {
    const a = currentEncounter(newRun("det"));
    const b = currentEncounter(newRun("det"));
    expect(a).toEqual(b);
  });
});

describe("run — the full loop plays to a wipe (integration)", () => {
  it("auto-plays seeded encounters until the party is wiped", () => {
    const run = newRun("full-loop");
    const loop = new RunLoop(run);
    let guard = 0;
    while (!loop.isOver() && guard++ < 50) {
      loop.camp();
      if (loop.isOver()) break;
      loop.startEncounter();
      loop.beginBattle();
      loop.autoBattle();
      const res = loop.resolve();
      if (res.over) break;
    }
    expect(loop.isOver()).toBe(true);
    expect(run.history.length).toBeGreaterThan(0);
    // The run ramped to a loss the party couldn't survive.
    expect(run.history.some((h) => h.winner === "player")).toBe(true);
  });
});

describe("run — replay reproduces the run", () => {
  it("two runs with the same seed produce an identical encounter sequence", () => {
    function playHistory(seed: string) {
      const run = createRun(seed, { party: roster(), difficultyId: "normal", gold: 200 });
      const loop = new RunLoop(run);
      let guard = 0;
      while (!loop.isOver() && guard++ < 50) {
        loop.camp();
        if (loop.isOver()) break;
        loop.startEncounter();
        loop.beginBattle();
        loop.autoBattle();
        if (loop.resolve().over) break;
      }
      return run.history;
    }
    const a = playHistory("replay-seed");
    const b = playHistory("replay-seed");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("a serialized snapshot reproduces the upcoming encounter", () => {
    const run = newRun("snap");
    run.encounterIndex = 3;
    const snap = snapshotRun(run);
    const expected = currentEncounter(run);

    // Rebuild a run at the snapshot's cursor and regenerate.
    const restored = createRun(snap.seed, { party: roster() });
    restored.encounterIndex = snap.encounterIndex;
    expect(currentEncounter(restored)).toEqual(expected);
  });
});

describe("run — permadeath through the loop (Hardest)", () => {
  it("a downed unit is removed from the roster on Hardest", () => {
    const run = createRun("hardest-perma", { party: roster(), difficultyId: "hardest", gold: 200 });
    const loop = new RunLoop(run);
    loop.startEncounter();
    // Force a player unit down before resolution.
    const victim = loop.combatants[0];
    victim.alive = false;
    victim.hp = 0;
    // Knock out enemies so the player "wins" the field but still lost a unit.
    for (const u of loop.battle!.units) if (u.side === "enemy") u.alive = false;
    const res = loop.resolve();
    expect(res.permadeaths).toContain(victim.id);
    expect(run.party.find((u) => u.id === victim.id)).toBeUndefined();
  });
});
