/**
 * Skills as data (M4 / D3).
 *
 * A skill is a plain data record — never a subclass. It declares which **phase**
 * it hooks, what it **targets**, its **range**, the CT it **spends**, and a
 * declarative **effect** the resolver interprets against the battle. New skills
 * are new data; the battle loop needs no new branches. M4 exercises the
 * `battle`-phase skills; the other phases are laid as the D3 seam.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { Unit } from "./units";
import type { EventBus } from "./events";
import type { StatusInstance } from "./status";
import { resolveAttack, manhattan, PASSIVE } from "./combat";
import { applyStatus, markPrey, cleanseOne } from "./status";

/** The ordered phases of the game pipeline (D3). */
export type Phase = "meta" | "deployment" | "battle" | "resolution";

/**
 * Who a skill is aimed at. `self`/`enemy`/`ally` are battle targets (a unit);
 * `camp` (economy/morale) and `party` (a whole-party buff) are non-combat
 * targets resolved by the meta/deployment phases, not against a single unit.
 */
export type SkillTarget = "self" | "enemy" | "ally" | "camp" | "party";

/** A heavier strike: deal damage as if the caster's attack were `+bonusAttack`. */
export interface DamageEffect {
  kind: "damage";
  bonusAttack: number;
}
/** Restore HP to the target (capped at maxHp). */
export interface HealEffect {
  kind: "heal";
  amount: number;
}
/** Apply a status to the target (buff or debuff). */
export interface StatusEffect {
  kind: "status";
  status: Omit<StatusInstance, "data"> & { data?: Record<string, unknown> };
}
/**
 * Open a maintained-stance **channel** on the caster, locked to the target
 * (D37) — the Hunter's Mark Prey. Consecutive hits on that prey ramp damage; the
 * caster keeps moving & acting; the stance ends on caster death / target-switch.
 */
export interface ChannelEffect {
  kind: "channel";
}
/**
 * A heal that also **scales with the target's missing HP** when the caster has
 * the Medic's Triage passive (D40): heals `amount` + `triage × missingHp`. With
 * no Triage it's a plain heal of `amount`.
 */
export interface TriageHealEffect {
  kind: "triage-heal";
  amount: number;
}
/** Remove one debuff from the target (the Medic's antidote cleanse, D40/D41). */
export interface CleanseEffect {
  kind: "cleanse";
}

/** Meta/economy: the Merchant adds gold and storage to the camp. */
export interface EconomyEffect {
  kind: "economy";
  gold: number;
  storage: number;
}
/** Meta/camp: the Chef raises party morale and banks a between-battle heal. */
export interface MoraleEffect {
  kind: "morale";
  morale: number;
  /** HP healed to each unit at the start of the next battle. */
  partyHeal: number;
}
/** Deployment: the Survivalist places a trap dealing `damage` when sprung. */
export interface PlaceTrapEffect {
  kind: "placeTrap";
  damage: number;
}

/** The declarative effect a skill applies when it resolves. */
export type SkillEffect =
  | DamageEffect
  | HealEffect
  | StatusEffect
  | ChannelEffect
  | TriageHealEffect
  | CleanseEffect
  | EconomyEffect
  | MoraleEffect
  | PlaceTrapEffect;

/** Effect kinds resolved against a unit in the Battle phase. */
export type BattleEffectKind =
  | "damage"
  | "heal"
  | "status"
  | "channel"
  | "triage-heal"
  | "cleanse";

/**
 * Optional ability cost beyond the Act (D37). The combat economy is **time**:
 * `charge` commits now and resolves later on the clock; `cooldown` is a sparing
 * re-arm on instant utility. A skill with neither is the instant floor.
 */
export interface SkillCost {
  /**
   * Charge gauge speed (D5/D37): the effect resolves later, when a
   * {@link "./clock".ScheduledEffect} filling by this each tick reaches 100.
   * Lower = a longer charge ("~N turns"); ≥100 lands next tick.
   */
  charge?: number;
  /** CT cooldown armed after use (instant-utility spam-limit, ~150–250 CT). */
  cooldown?: number;
}

/** A skill definition — pure data authored in a job file. */
export interface SkillDef {
  id: string;
  name: string;
  description: string;
  /** Which phase of the pipeline this skill acts in (D3). */
  phase: Phase;
  /** Who it can be aimed at. */
  target: SkillTarget;
  /** Range in tiles (Manhattan). `self` skills use 0. */
  range: number;
  /** CT cost after use — battle skills are Acts (the expensive option, D5). */
  spend: "act" | "move";
  /** Optional charge/cooldown cost beyond the Act (D37). */
  cost?: SkillCost;
  effect: SkillEffect;
}

/** What a resolved skill did, for the caller / render layer to report. */
export interface SkillOutcome {
  damage?: number;
  healed?: number;
  status?: string;
  /** The debuff id removed by a cleanse, if any. */
  cleansed?: string;
  /** True if the skill was committed as a charge and will resolve later (D37). */
  charging?: boolean;
}

/** Restore HP to a target (capped at maxHp), firing `unitHealed`. */
export function applyHeal(
  caster: Unit,
  target: Unit,
  amount: number,
  bus?: EventBus,
): SkillOutcome {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + Math.max(0, amount));
  const healed = target.hp - before;
  bus?.emit("unitHealed", { unit: target, amount: healed, source: caster });
  return { healed };
}

/** True if `target` is a legal target for `skill` cast by `caster`. */
export function isValidSkillTarget(
  skill: SkillDef,
  caster: Unit,
  target: Unit,
): boolean {
  switch (skill.target) {
    case "self":
      return target === caster && caster.alive;
    case "enemy":
      return (
        target.alive &&
        target.side !== caster.side &&
        manhattan(caster.pos, target.pos) <= skill.range
      );
    case "ally":
      return (
        target.alive &&
        target.side === caster.side &&
        manhattan(caster.pos, target.pos) <= skill.range
      );
  }
  // `camp` / `party` are non-combat targets — never a valid single-unit target.
  return false;
}

/**
 * Apply a skill's effect to a target. Emits the relevant bus events (damage /
 * heal) so listeners and the render layer react. Returns what happened.
 */
export function resolveSkill(
  skill: SkillDef,
  caster: Unit,
  target: Unit,
  bus?: EventBus,
  units?: readonly Unit[],
): SkillOutcome {
  const effect = skill.effect;
  switch (effect.kind) {
    case "damage": {
      const damage = resolveAttack(
        caster,
        target,
        bus,
        caster.attack + effect.bonusAttack,
        units,
      );
      return { damage };
    }
    case "heal": {
      return applyHeal(caster, target, effect.amount, bus);
    }
    case "triage-heal": {
      // Triage (D40): heal more the more wounded the target is. Without the
      // passive it's a plain heal of `amount`.
      const triage = caster.passives[PASSIVE.triage] ?? 0;
      const missing = target.maxHp - target.hp;
      const amount = effect.amount + Math.floor(triage * missing);
      return applyHeal(caster, target, amount, bus);
    }
    case "status": {
      applyStatus(target, { ...effect.status });
      return { status: effect.status.id };
    }
    case "channel": {
      // Maintained-stance channel: lock the mark onto the chosen prey (D37).
      markPrey(caster, target.id);
      return { status: "marked" };
    }
    case "cleanse": {
      const removed = cleanseOne(target);
      return { cleansed: removed?.id };
    }
  }
  // Non-combat effects (economy/morale/placeTrap) resolve in their own phase
  // (see camp.ts / makeTrap), not against a single unit.
  throw new Error(`resolveSkill: "${effect.kind}" is not a Battle-phase effect`);
}
