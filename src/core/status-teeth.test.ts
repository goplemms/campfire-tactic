import { describe, it, expect } from "vitest";
import {
  applyStatus,
  slowed,
  exposed,
  hastened,
  guarded,
  immobilized,
  isDebuffed,
  debuffs,
  cleanseOne,
  statusAmount,
  STATUS_TUNING,
  SLOWED,
  EXPOSED,
} from "./status";
import { effectiveSpeed } from "./clock";
import { computeDamage, PASSIVE } from "./combat";
import { createUnit, type Side, type Unit } from "./units";

function unit(id = "u", side: Side = "player", o: Partial<Unit> = {}): Unit {
  return {
    ...createUnit({
      id,
      side,
      pos: { col: 0, row: 0 },
      speed: 12,
      maxHp: 30,
      attack: 10,
      defense: 2,
      moveRange: 4,
      sightRadius: 5,
    }),
    ...o,
  };
}

describe("status teeth — clock reads Slowed/Hastened (D41)", () => {
  it("Slowed caps effective speed (the tarpit drives it to 1)", () => {
    const u = unit("u", "enemy", { speed: 12 });
    expect(effectiveSpeed(u)).toBe(12);
    applyStatus(u, slowed(2)); // default = tarpit floor
    expect(effectiveSpeed(u)).toBe(STATUS_TUNING.tarpitSpeed);
    expect(statusAmount(u, SLOWED)).toBe(1);
  });

  it("Hastened adds effective speed", () => {
    const u = unit("u", "player", { speed: 9 });
    applyStatus(u, hastened(1));
    expect(effectiveSpeed(u)).toBe(9 + STATUS_TUNING.hastenBonus);
  });
});

describe("status teeth — computeDamage reads Exposed/Guarded (D41)", () => {
  it("Exposed makes the target take extra damage", () => {
    const att = unit("a", "player");
    const def = unit("d", "enemy", { defense: 2 });
    const base = computeDamage(att, def); // 10 - 2
    applyStatus(def, exposed(2));
    expect(computeDamage(att, def)).toBe(base + STATUS_TUNING.exposedDamage);
  });

  it("Guarded reduces incoming damage (the Defend brace)", () => {
    const att = unit("a", "player");
    const def = unit("d", "enemy", { defense: 2 });
    const base = computeDamage(att, def);
    applyStatus(def, guarded());
    expect(computeDamage(att, def)).toBe(base - STATUS_TUNING.guardedReduction);
  });
});

describe("cross-cutting consumers read the kind classifier (D41)", () => {
  it("isDebuffed/debuffs see debuffs but not buffs", () => {
    const u = unit();
    applyStatus(u, hastened(1)); // buff
    expect(isDebuffed(u)).toBe(false);
    applyStatus(u, exposed(1)); // debuff
    applyStatus(u, slowed(1)); // debuff
    expect(isDebuffed(u)).toBe(true);
    expect(debuffs(u).map((s) => s.id).sort()).toEqual([EXPOSED, SLOWED]);
  });

  it("cleanse removes one debuff and leaves buffs alone", () => {
    const u = unit();
    applyStatus(u, hastened(2)); // buff — survives
    applyStatus(u, immobilized(2)); // debuff — cleansed
    const removed = cleanseOne(u);
    expect(removed?.kind).toBe("debuff");
    expect(isDebuffed(u)).toBe(false);
    expect(u.statuses.map((s) => s.id)).toEqual(["hastened"]);
    expect(cleanseOne(u)).toBeUndefined(); // nothing left to cleanse
  });

  it("the Deadeye passive punishes a debuffed target (computeDamage read)", () => {
    const hunter = unit("h", "player", { passives: { [PASSIVE.deadeye]: 5 } });
    const prey = unit("p", "enemy", { defense: 0 });
    const clean = computeDamage(hunter, prey); // no debuff → no bonus
    applyStatus(prey, slowed(2));
    expect(computeDamage(hunter, prey)).toBe(clean + 5);
  });
});
