import { describe, it, expect } from "vitest";
import { createUnit, type Unit } from "./units";
import { createRun, currentNode, type RunState } from "./run";
import { RunLoop, REST } from "./runloop";
import { getNode } from "./overworld";

function roster(): Unit[] {
  return [
    createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, jobId: "soldier", speed: 12, maxHp: 30, attack: 9, defense: 3, moveRange: 4, sightRadius: 5, awareness: 4, intelligence: 4 }),
    createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, jobId: "survivalist", speed: 10, maxHp: 24, attack: 11, defense: 2, moveRange: 4, sightRadius: 5, awareness: 2 }),
    // A Chef banks Rest Points (so a rest node has RP to triage with).
    createUnit({ id: "Pip", side: "player", pos: { col: -1, row: -1 }, jobId: "chef", speed: 8, maxHp: 18, attack: 3, defense: 1, moveRange: 3, sightRadius: 4 }),
  ];
}

function newRun(seed: string): RunState {
  return createRun(seed, { party: roster(), difficultyId: "normal", gold: 500 });
}

/** Last element of an array (ES2020-friendly, no Array.prototype.at). */
function last<T>(arr: readonly T[]): T | undefined {
  return arr[arr.length - 1];
}

describe("runloop — rest node recovery (D23)", () => {
  it("a rest node recovers without a battle", () => {
    const run = newRun("rest-recover");
    // Find a rest node anywhere on the map and position the run on it directly.
    const restNode = run.map.order.map((id) => getNode(run.map, id)).find((n) => n.kind === "rest" && n.layer > 0)!;
    expect(restNode).toBeDefined();
    run.mapNodeId = restNode.id;
    run.path.push(restNode.id);

    // Wound a fighter so triage has something to heal.
    const rook = run.party.find((u) => u.id === "Rook")!;
    rook.hp = 4;

    const loop = new RunLoop(run);
    expect(loop.battle).toBeUndefined();
    const before = run.night;
    const res = loop.restNode();

    // No battle was staged…
    expect(loop.battle).toBeUndefined();
    // …a night passed, RP banked (incl. the rest bonus), morale rose, Rook healed.
    expect(run.night).toBe(before + 1);
    expect(res.rpAdded).toBeGreaterThan(0);
    expect(res.moraleGained).toBe(REST.moraleGain);
    expect(res.healed.some((h) => h.unitId === "Rook" && h.hp > 0)).toBe(true);
    expect(rook.hp).toBeGreaterThan(4);
    // The night is recorded as a rest node.
    expect(last(run.history)).toMatchObject({ nodeId: restNode.id, kind: "rest", goldEarned: 0 });
  });

  it("a rest node never stages or resolves a fight", () => {
    const run = newRun("rest-nofight");
    const restNode = run.map.order.map((id) => getNode(run.map, id)).find((n) => n.kind === "rest" && n.layer > 0)!;
    run.mapNodeId = restNode.id;
    run.path.push(restNode.id);
    const loop = new RunLoop(run);
    loop.playCurrentNode();
    expect(currentNode(run).kind).toBe("rest");
    expect(last(run.history)?.winner).toBeUndefined();
  });
});

describe("runloop — autoTraverse determinism (D22)", () => {
  it("same seed + same choices ⇒ identical history and route", () => {
    function play(seed: string) {
      const run = newRun(seed);
      const loop = new RunLoop(run);
      const route = loop.autoTraverse();
      return { route, history: run.history, complete: run.complete, over: run.over, night: run.night };
    }
    const a = play("auto-det");
    const b = play("auto-det");
    expect(a).toEqual(b);
  });

  it("plays to a terminal state and the route is a valid forward walk", () => {
    const run = newRun("auto-walk");
    const loop = new RunLoop(run);
    const route = loop.autoTraverse();
    expect(loop.isTerminal()).toBe(true);
    expect(route[0]).toBe(run.map.startId);
    for (let i = 2; i < route.length; i++) {
      expect(getNode(run.map, route[i - 1]).edges).toContain(route[i]);
    }
    // A clear ends on the final node; a wipe ends wherever the party fell.
    if (loop.isComplete()) expect(run.map.finalIds).toContain(last(route));
  });
});
