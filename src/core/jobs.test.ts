import { describe, it, expect } from "vitest";
import { JOBS, getJob, unitSkills, registerParty, SOLDIER } from "./jobs";
import { PhaseSkillRegistry } from "./phases";
import { createUnit, type Unit } from "./units";

function soldier(id: string): Unit {
  return createUnit({
    id,
    side: "player",
    pos: { col: 0, row: 0 },
    jobId: "soldier",
    speed: 10,
    maxHp: 30,
    attack: 8,
    defense: 2,
    moveRange: 3,
    sightRadius: 5,
  });
}

describe("jobs (data-driven loading)", () => {
  it("loads the Soldier from the registry by id", () => {
    expect(getJob("soldier")).toBe(SOLDIER);
    expect(JOBS["soldier"].name).toBe("Soldier");
    expect(getJob(undefined)).toBeUndefined();
    expect(getJob("nope")).toBeUndefined();
  });

  it("defines the Soldier's skills purely as data hooking the Battle phase", () => {
    const ids = SOLDIER.skills.map((s) => s.id);
    expect(ids).toContain("power-strike");
    expect(ids).toContain("hamstring");
    expect(ids).toContain("second-wind");
    for (const skill of SOLDIER.skills) {
      expect(skill.phase).toBe("battle");
      expect(["damage", "status", "heal"]).toContain(skill.effect.kind);
    }
  });

  it("reads a unit's skills back via its jobId, filtered by phase", () => {
    const u = soldier("Rook");
    expect(unitSkills(u).length).toBe(3);
    expect(unitSkills(u, "battle").length).toBe(3);
    expect(unitSkills(u, "meta").length).toBe(0);

    const jobless = createUnit({
      id: "x",
      side: "player",
      pos: { col: 0, row: 0 },
      speed: 10,
      maxHp: 10,
      attack: 5,
      defense: 0,
      moveRange: 3,
      sightRadius: 4,
    });
    expect(unitSkills(jobless)).toEqual([]);
  });

  it("registers a party's skills into the phase registry (D3)", () => {
    const a = soldier("Rook");
    const b = soldier("Vale");
    const registry = new PhaseSkillRegistry();
    registerParty([a, b], registry);

    expect(registry.forPhase("battle").length).toBe(6); // 2 units × 3 skills
    expect(registry.forPhase("meta").length).toBe(0);
    expect(registry.skillsFor(a, "battle").map((s) => s.id)).toEqual([
      "power-strike",
      "hamstring",
      "second-wind",
    ]);
  });
});
