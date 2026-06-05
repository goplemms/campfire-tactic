import { describe, it, expect } from "vitest";
import { PHASES, PhasePipeline, PhaseSkillRegistry } from "./phases";
import type { SkillDef } from "./skills";
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

function skill(id: string, phase: SkillDef["phase"]): SkillDef {
  return {
    id,
    name: id,
    description: "",
    phase,
    target: "self",
    range: 0,
    spend: "act",
    effect: { kind: "heal", amount: 1 },
  };
}

describe("PhasePipeline", () => {
  it("orders the phases Meta → Deployment → Battle → Resolution", () => {
    expect(PHASES).toEqual(["meta", "deployment", "battle", "resolution"]);
  });

  it("advances forward and clamps at Resolution, then resets to Meta", () => {
    const p = new PhasePipeline();
    expect(p.current()).toBe("meta");
    expect(p.advance()).toBe("deployment");
    expect(p.advance()).toBe("battle");
    expect(p.advance()).toBe("resolution");
    expect(p.isLast()).toBe(true);
    expect(p.advance()).toBe("resolution"); // clamped
    expect(p.reset()).toBe("meta");
  });
});

describe("PhaseSkillRegistry", () => {
  it("buckets skills under the phase each one hooks", () => {
    const chef = unit("chef");
    const soldier = unit("soldier");
    const registry = new PhaseSkillRegistry();

    registry.register(chef, skill("cook", "meta"));
    registry.register(soldier, skill("power-strike", "battle"));
    registry.register(soldier, skill("second-wind", "battle"));

    expect(registry.forPhase("meta").map((h) => h.skill.id)).toEqual(["cook"]);
    expect(registry.forPhase("battle").length).toBe(2);
    expect(registry.forPhase("deployment")).toEqual([]);
    expect(registry.skillsFor(soldier, "battle").map((s) => s.id)).toEqual([
      "power-strike",
      "second-wind",
    ]);
    expect(registry.skillsFor(chef, "battle")).toEqual([]);
  });
});
