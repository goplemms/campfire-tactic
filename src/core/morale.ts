/**
 * Morale effects (D8) — the passive, tiered, **asymmetric** modifier bundle.
 *
 * Morale was banked in M5 ({@link "./camp"} tracks the value + {@link moraleTier})
 * but had no mechanical teeth. M6 gives it teeth: a tier maps to a small bundle of
 * modifiers that feed **real systems** — Deployment safe depth, the initiative
 * seed, capture exposure — biased toward effects that *reinforce* systems we
 * already have. Per D8 the bundle is **asymmetric**: Neutral is baseline, High
 * tiers *add* modest bonuses, and the Low tier applies only a *marginal* penalty
 * (a slightly colder seed) — the floor is shallow, so the game never "kicks a
 * player while they're down."
 *
 * **Speed caution (D8):** Speed compounds in the CT clock, so the only
 * Speed-adjacent knob here (the initiative seed) carries the *smallest* magnitudes
 * in the bundle.
 *
 * Pure logic: no Phaser, no DOM.
 */

import type { MoraleTier } from "./camp";

/** The bundle of small modifiers a morale tier applies (D8). */
export interface MoraleModifiers {
  /** +tiles to every unit's zero-risk Deployment depth (D7/D11). */
  safeDepthBonus: number;
  /** Flat CT added to the party's initiative seed (smallest in the bundle, D5). */
  initiativeBonus: number;
  /** Multiplier on Deployment capture exposure (<1 = alert, confident units). */
  exposureMultiplier: number;
  /** Added crit chance (a flat, safe filler). */
  critBonus: number;
  /** Bonus fraction on gold rewards (run-flavored; ties to the Merchant). */
  goldFindBonus: number;
}

/** Baseline — Neutral applies nothing (the asymmetric reference point). */
const NEUTRAL: MoraleModifiers = {
  safeDepthBonus: 0,
  initiativeBonus: 0,
  exposureMultiplier: 1,
  critBonus: 0,
  goldFindBonus: 0,
};

/**
 * The morale modifier table (D8 asymmetry). High/Inspired *add* bonuses; Low only
 * applies a marginal initiative penalty (and simply lacks the High bonuses).
 */
const TABLE: Record<MoraleTier, MoraleModifiers> = {
  Low: { ...NEUTRAL, initiativeBonus: -3 },
  Neutral: NEUTRAL,
  High: {
    safeDepthBonus: 1,
    initiativeBonus: 4,
    exposureMultiplier: 0.9,
    critBonus: 0.05,
    goldFindBonus: 0.05,
  },
  Inspired: {
    safeDepthBonus: 1,
    initiativeBonus: 6,
    exposureMultiplier: 0.85,
    critBonus: 0.08,
    goldFindBonus: 0.1,
  },
};

/** The modifier bundle for a morale tier (D8). */
export function moraleModifiers(tier: MoraleTier): MoraleModifiers {
  return TABLE[tier];
}
