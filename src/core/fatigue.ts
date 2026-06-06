/**
 * Fatigue (D29/D35) — the per-character **loose over-extension guardrail** of the
 * overworld action economy.
 *
 * Fatigue is **not** the spine of that economy — per-ability **cooldowns** are
 * (see {@link "./overworld-actions"}). Fatigue is the *stake*: a generous
 * per-character allowance that is **invisible in normal play** and only **bites
 * when you greedily skip rest and over-extend night after night**. It is built in
 * this codebase's recurring **shallow asymmetric-floor** shape — the same shape as
 * Deployment overdraw ({@link "./deployment"}, D7/D11) and the Morale bundle
 * ({@link "./morale"}, D8): a wide no-cost band, then a *gentle, bounded* bite past
 * a high threshold (D8's "never kick a player when down").
 *
 * **Two economies stay separate (D29).** Fatigue governs the **overworld** clock
 * (node-steps) **only**. It must never touch the CT clock ({@link "./clock"}),
 * initiative, or any combat stat — a tired character is *not* combat-penalized.
 * The value rides along on {@link "./units".Unit} like awareness/intelligence do,
 * read only in its own phase. Rest nodes restore it (rest's second job, D29).
 *
 * Fatigue accrues from 0 (**Rested**): each overworld action *adds* to it; rest
 * resets it. So the "floor" is at the top — you fall *into* exhaustion by spending.
 *
 * Pure logic: no Phaser, no DOM.
 */

/** Fatigue tuning — the shallow asymmetric floor (D35), all data. */
export const FATIGUE = {
  /** A fresh character's fatigue — the default a {@link "./units".Unit} starts at. */
  rested: 0,
  /**
   * The **generous allowance**: fatigue at or below this is invisible in normal
   * play — no bite at all. Crossing it is the "greedily skipped rest" signal.
   */
  floor: 6,
  /**
   * The deep-exhaustion threshold: past this the bite hardens — the surcharge
   * caps out *and* the most-demanding actions lock (see {@link fatiguePenalty}).
   */
  exhausted: 12,
  /** Past the floor, each point of over-extension adds this much to action costs. */
  surchargePerPoint: 0.5,
  /** The surcharge is **bounded** (D8 "gentle") — it never exceeds this. */
  maxSurcharge: 3,
  /**
   * When deeply exhausted, only the **most-demanding** actions lock — those whose
   * base fatigue cost is at or above this. Cheaper actions always stay available
   * (the guardrail is *loose*, not a wall).
   */
  demandingCost: 2,
  /** A hard ceiling so the value can't run away unboundedly. */
  ceiling: 18,
} as const;

/** Banded fatigue tier (D35) — a legible label for a raw fatigue value. */
export type FatigueTier = "Rested" | "Worn" | "Weary" | "Exhausted";

/**
 * Band a raw fatigue value into its tier. **Rested** and **Worn** sit within the
 * allowance (invisible, no bite); **Weary** is over the floor (the gentle bite
 * begins); **Exhausted** is the deep over-extension (bite caps + demanding-action
 * lock). The floor is shallow and asymmetric — most play never leaves Rested/Worn.
 */
export function fatigueTier(level: number): FatigueTier {
  if (level <= 0) return "Rested";
  if (level <= FATIGUE.floor) return "Worn";
  if (level < FATIGUE.exhausted) return "Weary";
  return "Exhausted";
}

/**
 * Spend `cost` fatigue on a character's current `level`, returning the new level
 * (clamped at the {@link FATIGUE.ceiling}). The *surcharge* an over-extended
 * character pays is **not** added here — the resolver adds it to `cost` before
 * spending (see {@link fatiguePenalty}); this is the pure accumulation.
 */
export function spendFatigue(level: number, cost: number): number {
  return Math.min(FATIGUE.ceiling, Math.max(0, level + Math.max(0, cost)));
}

/**
 * Restore a character to **Rested** — a rest node's second job (D29/D35). A full
 * reset (not a trickle): the asymmetry is the whole point — you fall into fatigue
 * by spending, and a real rest wipes it clean.
 */
export function restoreFatigue(_level: number): number {
  return FATIGUE.rested;
}

/** The (small, overworld-only) bite an over-extended character pays (D35). */
export interface FatiguePenalty {
  /**
   * Extra fatigue added to **every** subsequent action's cost — the gentle,
   * **bounded** bite. Zero within the allowance.
   */
  surcharge: number;
  /**
   * When deeply exhausted, actions whose **base** fatigue cost is at or above this
   * are **locked out**; below it nothing locks (`Infinity`). Keeps the guardrail
   * loose — you can always do the cheap things, just not push the demanding ones.
   */
  lockAtOrAbove: number;
}

/**
 * The overworld-only penalty for a fatigue `level` (D35). Within the allowance
 * (≤ {@link FATIGUE.floor}) there is **no** penalty. Past it, a gentle surcharge
 * grows with over-extension but **caps** at {@link FATIGUE.maxSurcharge}; only once
 * **Exhausted** do the most-demanding actions lock. The bite never reaches combat.
 */
export function fatiguePenalty(level: number): FatiguePenalty {
  if (level <= FATIGUE.floor) {
    return { surcharge: 0, lockAtOrAbove: Infinity };
  }
  const over = level - FATIGUE.floor;
  const surcharge = Math.min(
    FATIGUE.maxSurcharge,
    Math.ceil(over * FATIGUE.surchargePerPoint),
  );
  const lockAtOrAbove = level >= FATIGUE.exhausted ? FATIGUE.demandingCost : Infinity;
  return { surcharge, lockAtOrAbove };
}

/** Current fatigue as a 0..1 fraction of the way to deep exhaustion (for a meter). */
export function fatigueRisk(level: number): number {
  return Math.min(1, Math.max(0, level) / FATIGUE.exhausted);
}
