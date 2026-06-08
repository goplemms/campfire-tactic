import { describe, it, expect } from "vitest";
import {
  buildAuthoredGrid,
  buildAuthoredEnemies,
  armObjective,
  placeParty,
} from "./authored";
import {
  THE_HOLLOW_MILL,
  DemoRunner,
  E1_SKIRMISH,
  E3_HOLDOUT,
} from "./demo-quest";
import { createUnit } from "./units";
import { Battle } from "./turn";
import { isImmobilized, immobilized, applyStatus } from "./status";

describe("authored encounters build deterministically (D44)", () => {
  it("the same encounter builds identical grids + enemies twice", () => {
    const g1 = buildAuthoredGrid(E1_SKIRMISH);
    const g2 = buildAuthoredGrid(E1_SKIRMISH);
    expect(g1.cols).toBe(g2.cols);
    expect(g1.isWalkable({ col: 4, row: 1 })).toBe(false); // a blocked tile
    const a = buildAuthoredEnemies(E1_SKIRMISH);
    const b = buildAuthoredEnemies(E1_SKIRMISH);
    expect(a.map((u) => [u.id, u.pos.col, u.pos.row, u.maxHp])).toEqual(
      b.map((u) => [u.id, u.pos.col, u.pos.row, u.maxHp]),
    );
    // The bowman is ranged; the cutthroat is placed apart (the isolation moment).
    expect(a.find((u) => u.id.includes("bowman"))?.attackRange).toBe(3);
  });

  it("places the party at the encounter's spawns", () => {
    const party = [createUnit({ id: "a", side: "player", pos: { col: 9, row: 9 }, speed: 10, maxHp: 10, attack: 5, defense: 1, moveRange: 3, sightRadius: 4 })];
    placeParty(party, E1_SKIRMISH.playerSpawns);
    expect(party[0].pos).toEqual(E1_SKIRMISH.playerSpawns[0]);
  });
});

describe("the bridge-cut objective (D43)", () => {
  it("completes on its timer when the Sapper is left alone (objective lost)", () => {
    const grid = buildAuthoredGrid(E3_HOLDOUT);
    const enemies = buildAuthoredEnemies(E3_HOLDOUT);
    const victim = createUnit({ id: "v", side: "player", pos: { col: 4, row: 2 }, speed: 10, maxHp: 20, attack: 5, defense: 1, moveRange: 3, sightRadius: 4 });
    const battle = new Battle(grid, [victim, ...enemies]);
    const objective = armObjective(battle.clock, E3_HOLDOUT, battle.units);
    expect(objective.failed).toBe(false);
    // Tick the clock until the cut completes (~3 turns left unchecked).
    for (let i = 0; i < 40 && !objective.failed; i++) battle.clock.tick();
    expect(objective.failed).toBe(true);
    // The unit standing on the span was swept (downed).
    expect(victim.alive).toBe(false);
  });

  it("fizzles when the Sapper dies — the cut never completes", () => {
    const grid = buildAuthoredGrid(E3_HOLDOUT);
    const enemies = buildAuthoredEnemies(E3_HOLDOUT);
    const battle = new Battle(grid, enemies);
    const objective = armObjective(battle.clock, E3_HOLDOUT, battle.units);
    let fizzled = "";
    battle.bus.on("chargeFizzled", ({ id }) => (fizzled = id));
    objective.sapper!.alive = false; // killed before the cut lands
    for (let i = 0; i < 40; i++) battle.clock.tick();
    expect(objective.failed).toBe(false);
    expect(fizzled).toContain("bridge-cut");
  });

  it("also fizzles when the Sapper is Immobilized (snared, not killed)", () => {
    const grid = buildAuthoredGrid(E3_HOLDOUT);
    const enemies = buildAuthoredEnemies(E3_HOLDOUT);
    const battle = new Battle(grid, enemies);
    const objective = armObjective(battle.clock, E3_HOLDOUT, battle.units);
    applyStatus(objective.sapper!, immobilized(99));
    expect(isImmobilized(objective.sapper!)).toBe(true);
    for (let i = 0; i < 40; i++) battle.clock.tick();
    expect(objective.failed).toBe(false);
  });
});

describe("the DemoRunner walks the Hollow Mill beats (D44)", () => {
  it("provisions herbs under the storage cap", () => {
    const runner = new DemoRunner();
    runner.provision([{ id: "salve", count: 3 }, { id: "antidote", count: 3 }, { id: "stimulant", count: 3 }]);
    // Cap is 8 slots; the loads can't all fit → a real provisioning choice.
    expect(runner.inventory.storageCap).toBe(8);
    expect(runner.gold).toBe(120);
  });

  it("the rest beat levels the party and unlocks each 2nd active", () => {
    const runner = new DemoRunner();
    runner.beatIndex = 2; // the rest beat
    const before = runner.party.map((u) => u.jobLevels[u.primaryJob!]?.level ?? 1);
    runner.rest("spare");
    const after = runner.party.map((u) => u.jobLevels[u.primaryJob!]?.level ?? 1);
    expect(after.every((lv, i) => lv > before[i])).toBe(true);
    expect(runner.ambushRevealed).toBe(true); // sparing the deserter pre-reveals the ambush
  });

  it("plays end-to-end to a terminal outcome (proof the beats walk)", () => {
    const runner = new DemoRunner();
    const outcome = runner.autoPlay("spare");
    expect(["complete", "failed", "wipe"]).toContain(outcome);
    expect(runner.beatIndex).toBeGreaterThanOrEqual(THE_HOLLOW_MILL.beats.length);
    // The quest log captured every beat.
    expect(runner.log.length).toBeGreaterThan(0);
  });

  it("objective-failure is survivable — distinct from a wipe (D43)", () => {
    const runner = new DemoRunner();
    const beat = THE_HOLLOW_MILL.beats.find((b) => b.kind === "encounter" && b.encounter.id === E3_HOLDOUT.id);
    const staged = runner.stageEncounter(beat as never);
    // Force the cut to complete (objective lost) without a wipe.
    staged.objective.failed = true;
    runner.resolveEncounter(staged, "objective-failure");
    expect(runner.outcome).toBe("failed"); // the holdout failed
    expect(runner.party.every((u) => u.alive)).toBe(true); // but the party retreats ALIVE
  });
});
