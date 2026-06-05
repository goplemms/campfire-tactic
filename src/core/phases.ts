/**
 * The phase pipeline (D3): Meta → Deployment → Battle → Resolution.
 *
 * The signature jobs each act in a *different* phase, so the game is modeled as
 * ordered phases and jobs/skills are **data that register into a phase** rather
 * than special cases bolted onto the battle loop. M4 stands up the seam: a
 * {@link PhasePipeline} that advances through the ordered phases, and a
 * {@link PhaseSkillRegistry} that collects each unit's skills under the phase
 * they hook. Only the Battle phase is exercised in M4; the rest are stubs the
 * later milestones (M5/M5b/M6) fill in.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { Phase, SkillDef } from "./skills";

/** The phases in pipeline order. */
export const PHASES: readonly Phase[] = [
  "meta",
  "deployment",
  "battle",
  "resolution",
] as const;

/**
 * A tiny cursor over {@link PHASES}. `advance` steps forward and stops at
 * Resolution; `reset` returns to Meta (a new encounter). The render/run layer
 * drives it — the pipeline owns no rules.
 */
export class PhasePipeline {
  private index = 0;

  /** The current phase. */
  current(): Phase {
    return PHASES[this.index];
  }

  /** True if at the final phase (Resolution). */
  isLast(): boolean {
    return this.index === PHASES.length - 1;
  }

  /** Step to the next phase (clamped at Resolution). Returns the new phase. */
  advance(): Phase {
    if (this.index < PHASES.length - 1) this.index += 1;
    return this.current();
  }

  /** Return to the first phase (Meta) — the start of the next encounter. */
  reset(): Phase {
    this.index = 0;
    return this.current();
  }
}

/** A skill registered by a unit under the phase it hooks. */
export interface PhaseSkill {
  unit: Unit;
  skill: SkillDef;
}

/**
 * Collects skills under the phase each one hooks (D3). Jobs register their
 * skills here; a phase then asks `forPhase` (everything that acts now) or
 * `skillsFor(unit)` (one unit's options this phase). This is the seam that lets
 * the Chef hook Meta, the Survivalist hook Deployment, and a Soldier hook Battle
 * without the loop knowing any of them by name.
 */
export class PhaseSkillRegistry {
  private readonly byPhase = new Map<Phase, PhaseSkill[]>();

  /** Register one unit/skill under the skill's declared phase. */
  register(unit: Unit, skill: SkillDef): void {
    const list = this.byPhase.get(skill.phase) ?? [];
    list.push({ unit, skill });
    this.byPhase.set(skill.phase, list);
  }

  /** Everything registered to act in a phase. */
  forPhase(phase: Phase): PhaseSkill[] {
    return this.byPhase.get(phase) ?? [];
  }

  /** A single unit's skills that act in a phase. */
  skillsFor(unit: Unit, phase: Phase): SkillDef[] {
    return this.forPhase(phase)
      .filter((h) => h.unit === unit)
      .map((h) => h.skill);
  }
}
