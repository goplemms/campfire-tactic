/**
 * Run-loop orchestrator (M6) — the single entry the render layer drives.
 *
 * Steps a seeded run through the phase pipeline Camp → Deployment → Battle →
 * Resolution → next, applying Upkeep/recovery (D9/D15), rewards, material
 * recovery (D13), auto-rescue (D21) and the mortality policy (D9) between
 * encounters, until {@link RunLoop.isOver}. The orchestrator owns the *wiring*;
 * each rule still lives in its own core module — it just sequences them and
 * threads the run's single RNG so the whole run is deterministic.
 *
 * Pure logic: no Phaser, no DOM. Headlessly testable: {@link RunLoop.autoBattle}
 * plays a battle to a decision deterministically so a test can run a full run to
 * a wipe and replay a seed.
 */

import type { Unit } from "./units";
import type { GridCoord } from "./iso";
import { TileGrid } from "./grid";
import { Battle } from "./turn";
import { buildGrid, buildEnemies, type EncounterDef } from "./generation";
import {
  type RunState,
  runDifficulty,
  currentNode,
  currentEncounter,
  combatRoster,
  isRunOver,
  removeFromRoster,
  recordNight,
  reachableNodes,
  chooseNode,
} from "./run";
import type { MapNode } from "./overworld";
import { moraleModifiers } from "./morale";
import { moraleTier } from "./camp";
import { applyCampToParty } from "./camp";
import { freeCaptive } from "./deployment";
import { recoverMaterials } from "./resolution";
import { addItem } from "./inventory";
import { resolveDowned, resolveCaptured, tickDyingClocks, type DownedOutcome, type RescueQuest } from "./mortality";
import { rpPerNight, payUpkeep, triageHeal, type UpkeepResult } from "./upkeep";
import { intelFloor, readEncounter, type IntelReport, type IntelTier } from "./intel";
import { planEnemyTurn } from "./ai";
import { restoreFatigue } from "./fatigue";
import { takeOverworldAction, type ActionOpts, type ActionResult } from "./overworld-actions";
import { gainRunGold } from "./economy";
import { thiefEventSkim } from "./theft";

/** What a resolved encounter produced (for the render/run-end screen). */
export interface ResolveResult {
  winner?: "player" | "enemy";
  goldEarned: number;
  recovered: string[];
  rescued: string[];
  downed: DownedOutcome[];
  permadeaths: string[];
  rescueQuests: RescueQuest[];
  over: boolean;
}

/** What the nightly camp step produced. */
export interface CampResult {
  upkeep: UpkeepResult;
  rpAdded: number;
  dyingLost: string[];
}

/** What a rest node's recovery produced (no battle, D23). */
export interface RestResult {
  upkeep: UpkeepResult;
  rpAdded: number;
  /** Units auto-triaged and the HP each gained. */
  healed: { unitId: string; hp: number }[];
  moraleGained: number;
  /** Units whose overworld fatigue was restored to Rested (D35 — rest's second job). */
  fatigueRestored: string[];
  dyingLost: string[];
  over: boolean;
}

/** What a thief **event** node produced (no battle, D30). */
export interface EventResult {
  /** Purse gold skimmed by the thief (blunted by Banker protection, D30). */
  stolen: number;
  /** The purse balance after the skim. */
  purseAfter: number;
  over: boolean;
}

/** Rest-node tuning — the recovery a no-battle camp grants (data, D23). */
export const REST = {
  /**
   * Healing chunks a restful night funds, in addition to the nightly Rest
   * Points. Denominated in **chunks** (each costs `policy.rpPerChunk` RP) so a
   * rest is meaningful at every difficulty — the dying-clock dial scales with it.
   */
  chunks: 3,
  /** Morale a good rest restores (D8). */
  moraleGain: 2,
} as const;

/** The run-loop orchestrator. */
export class RunLoop {
  readonly run: RunState;
  /** The encounter currently being played (set by {@link startEncounter}). */
  encounter?: EncounterDef;
  /** The live battle for the current encounter. */
  battle?: Battle;
  /** Player combatants placed for the current encounter. */
  combatants: Unit[] = [];

  constructor(run: RunState) {
    this.run = run;
  }

  /** True once the run has ended (a wipe, or a lost battle). */
  isOver(): boolean {
    return this.run.over;
  }

  /** True once the run has been completed (the final node cleared, D23). */
  isComplete(): boolean {
    return this.run.complete;
  }

  /** True once the run has reached any terminal (over or complete). */
  isTerminal(): boolean {
    return this.run.over || this.run.complete;
  }

  // --- Overworld (D22) ------------------------------------------------------

  /** The branch choices reachable from the run's current map position (D22). */
  reachable(): MapNode[] {
    return reachableNodes(this.run);
  }

  /** Commit to a reachable node — moves the run there so it can be played (D22). */
  choose(id: string): MapNode {
    return chooseNode(this.run, id);
  }

  // --- The unified overworld camp (D35) -------------------------------------

  /**
   * Take an overworld action at the current node (D29/D35) — the unified camp's
   * verb. Delegates to the cost-gating interpreter ({@link takeOverworldAction}):
   * checks the ability is off cooldown and the actor has fatigue headroom/gold,
   * applies the effect, spends the costs and arms the node-step cooldown. Never
   * throws on a refusal — returns the {@link ActionResult} the render reads.
   */
  overworldAction(unit: Unit, abilityId: string, opts: ActionOpts = {}): ActionResult {
    return takeOverworldAction(this.run, unit, abilityId, opts);
  }

  // --- Rest node (no battle, D23) -------------------------------------------

  /**
   * Play a **rest** node: a night of recovery with **no fight** (D23). Pays
   * Upkeep (a night still costs), banks the nightly Rest Points **plus a rest
   * bonus**, **auto-triages** the most-wounded fighters down the RP pool, nudges
   * morale up (D8), **restores every member's overworld fatigue** (rest's second
   * job, D29/D35), ticks any dying clocks, and records the night. Returns a
   * summary for the render's rest screen.
   */
  restNode(): RestResult {
    const policy = runDifficulty(this.run);
    const upkeep = payUpkeep(this.run.camp, this.run.party);
    const rpAdded = rpPerNight(this.run.party) + REST.chunks * policy.rpPerChunk;
    this.run.rp += rpAdded;

    // Rest's second job (D35): wipe overworld fatigue clean — the only restore.
    const fatigueRestored: string[] = [];
    for (const u of this.run.party) {
      if (u.fatigue > 0) {
        u.fatigue = restoreFatigue(u.fatigue);
        fatigueRestored.push(u.id);
      }
    }

    // Auto-triage: heal the worst-off fighters first, spending the RP pool down.
    const healed: { unitId: string; hp: number }[] = [];
    const wounded = combatRoster(this.run)
      .filter((u) => u.hp < u.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (const u of wounded) {
      if (this.run.rp < policy.rpPerChunk) break;
      const res = triageHeal(u, this.run.rp, policy);
      if (res.rpSpent > 0) {
        this.run.rp -= res.rpSpent;
        healed.push({ unitId: u.id, hp: res.hpHealed });
      }
    }

    this.run.camp.morale += REST.moraleGain;

    const lost = tickDyingClocks(this.run.party);
    for (const u of lost) removeFromRoster(this.run, u);
    const node = currentNode(this.run);
    const over = recordNight(this.run, {
      nodeId: node.id,
      layer: node.layer,
      kind: node.kind,
      goldEarned: 0,
      fallen: lost.map((u) => u.id),
    });
    return { upkeep, rpAdded, healed, moraleGained: REST.moraleGain, fatigueRestored, dyingLost: lost.map((u) => u.id), over };
  }

  // --- Event node (the thief, no battle, D30) -------------------------------

  /**
   * Play a thief **event** node (M10, D30): a no-battle overworld hazard that
   * **skims the run purse** ({@link "./theft".thiefEventSkim}), blunted by any
   * Banker theft protection. Ticks the night/cooldowns like any node-step and
   * records the loss. Returns the skim summary for the render's event screen.
   */
  eventNode(): EventResult {
    const node = currentNode(this.run);
    const theft = thiefEventSkim(this.run, node);
    const over = recordNight(this.run, {
      nodeId: node.id,
      layer: node.layer,
      kind: node.kind,
      goldEarned: -theft.stolen,
      fallen: [],
    });
    return { stolen: theft.stolen, purseAfter: theft.purseAfter, over };
  }

  // --- Camp (between battles, D9/D15) ---------------------------------------

  /**
   * Run the nightly camp upkeep + recovery (D9/D15): pay Upkeep (underfunding a
   * line hits morale), bank Rest Points, and tick any Hard-mode dying clocks —
   * removing units whose clock ran out (permadeath). RP triage and cleric
   * revives are explicit player actions on {@link "./upkeep"}.
   */
  camp(): CampResult {
    const upkeep = payUpkeep(this.run.camp, this.run.party);
    const rpAdded = rpPerNight(this.run.party);
    this.run.rp += rpAdded;
    const lost = tickDyingClocks(this.run.party);
    const dyingLost = lost.map((u) => u.id);
    for (const u of lost) removeFromRoster(this.run, u);
    this.run.over = isRunOver(this.run);
    return { upkeep, rpAdded, dyingLost };
  }

  // --- Intel (D10) ----------------------------------------------------------

  /** The current encounter's intel report at the party's floor tier (D10). */
  intel(extraTier = 0): IntelReport {
    const def = this.encounter ?? currentEncounter(this.run);
    const tier = Math.min(3, intelFloor(this.run.party) + extraTier) as IntelTier;
    return readEncounter(def, tier);
  }

  // --- Battle setup ---------------------------------------------------------

  /**
   * Generate and stage the current encounter: build the grid, inflate enemies,
   * place the active roster on the home (left) edge, and create the {@link Battle}
   * the render drives. `deploymentPenalty` shrinks the player's usable home
   * columns (the D9 rescue "ambush-in-reverse" modifier).
   */
  startEncounter(deploymentPenalty = 0): Battle {
    const def = currentEncounter(this.run);
    this.encounter = def;
    const grid = buildGrid(def);
    const enemies = buildEnemies(def);
    const players = combatRoster(this.run);
    this.placePlayers(players, grid, def, deploymentPenalty);
    this.combatants = players;
    this.battle = new Battle(grid, [...players, ...enemies]);
    return this.battle;
  }

  /** Position player combatants on the left edge, resetting combat-scoped state. */
  private placePlayers(
    players: Unit[],
    grid: TileGrid,
    def: EncounterDef,
    deploymentPenalty: number,
  ): void {
    // The rescue modifier pushes the home edge inward (fewer columns to set up).
    const homeCols = Math.max(1, 2 - Math.min(1, deploymentPenalty));
    const taken = new Set<string>();
    for (const block of def.blocked) taken.add(`${block.col},${block.row}`);
    players.forEach((u, i) => {
      let pos: GridCoord = { col: i % homeCols, row: i % def.rows };
      for (let row = 0; row < def.rows; row++) {
        for (let col = 0; col < homeCols; col++) {
          const key = `${col},${row}`;
          if (!taken.has(key) && grid.isWalkable({ col, row })) {
            pos = { col, row };
            taken.add(key);
            row = def.rows;
            break;
          }
        }
      }
      taken.add(`${pos.col},${pos.row}`);
      u.pos = pos;
      u.ct = 0;
      u.statuses = [];
      u.captured = false;
    });
  }

  /**
   * Begin the staged battle: apply the Chef's banked heal and seed initiative
   * warmed by the current morale tier (D8). Returns the HP healed.
   */
  beginBattle(): number {
    if (!this.battle) throw new Error("RunLoop.beginBattle: no staged battle");
    const healed = applyCampToParty(this.run.camp, this.battle.units, this.battle.bus);
    const mods = moraleModifiers(moraleTier(this.run.camp.morale));
    this.battle.seed(mods.initiativeBonus);
    return healed;
  }

  // --- Resolution (D13/D21/D9) ----------------------------------------------

  /**
   * Resolve the finished battle: award gold (morale gold-find bonus, D8) and
   * material drops on a win, recover unsprung materials (D13), auto-rescue still-
   * captured allies (D21), apply the mortality policy to downed units (D9) with
   * permadeath removal, turn any non-win captives into rescue quests, then
   * advance the run. Returns a full summary for the render/run-end screen.
   */
  resolve(): ResolveResult {
    if (!this.battle || !this.encounter) throw new Error("RunLoop.resolve: no battle");
    const battle = this.battle;
    const def = this.encounter;
    const policy = runDifficulty(this.run);
    const outcome = battle.outcome();
    const winner = outcome.winner;
    const won = winner === "player";

    // Rewards + material recovery (win only).
    let goldEarned = 0;
    const recovered: string[] = [];
    if (won) {
      const mods = moraleModifiers(moraleTier(this.run.camp.morale));
      goldEarned = Math.round(def.reward.gold * (1 + mods.goldFindBonus));
      // Loot routes to the PURSE (D34), auto-repaying any Banker debt first (D30).
      gainRunGold(this.run, goldEarned);
      for (const drop of def.reward.materials) {
        // Add drops up to the storage cap; overflow is simply lost (D6).
        for (let i = 0; i < drop.count; i++) addItem(this.run.inventory, drop.id);
      }
      const rec = recoverMaterials(battle.entities.all(), winner, this.run.inventory);
      recovered.push(...rec.recovered);
    }

    // Auto-rescue still-captured allies on a win (D21).
    const rescued: string[] = [];
    const rescueQuests: RescueQuest[] = [];
    for (const u of this.combatants) {
      if (!u.captured) continue;
      if (won) {
        freeCaptive(u);
        rescued.push(u.id);
      } else {
        rescueQuests.push(resolveCaptured(policy, u)); // a follow-up quest, not death
      }
    }

    // Mortality (D9): on a **win**, resolve every downed player combatant per the
    // difficulty policy (Easy full-heal … Hardest permadeath) — the run continues.
    // A **lost** battle is the run-ending wipe itself (the party went down), so the
    // per-unit recovery policy doesn't apply — there's no camp to recover in.
    const downed: DownedOutcome[] = [];
    const permadeaths: string[] = [];
    if (won) {
      for (const u of this.combatants) {
        if (u.alive || u.captured) continue;
        const res = resolveDowned(policy, u);
        downed.push(res);
        if (res.permadeath) {
          removeFromRoster(this.run, u);
          permadeaths.push(u.id);
        }
      }
    }

    // Record the node outcome + advance the night. A win checks the run-complete
    // (final-node) terminal; a loss ends the run here (the party's own wipe).
    const node = currentNode(this.run);
    let over: boolean;
    if (won) {
      recordNight(this.run, {
        nodeId: node.id,
        layer: node.layer,
        kind: node.kind,
        type: def.type,
        winner,
        goldEarned,
        fallen: [...permadeaths],
      });
      over = this.run.over || this.run.complete;
    } else {
      this.run.history.push({
        nodeId: node.id,
        layer: node.layer,
        kind: node.kind,
        type: def.type,
        winner,
        goldEarned: 0,
        fallen: this.combatants.filter((u) => !u.alive).map((u) => u.id),
        night: this.run.night,
      });
      this.run.night += 1;
      this.run.over = true;
      over = true;
    }

    this.battle = undefined;
    this.encounter = undefined;
    this.combatants = [];

    return { winner, goldEarned, recovered, rescued, downed, permadeaths, rescueQuests, over };
  }

  // --- Headless auto-play (tests / fast-forward) ----------------------------

  /**
   * Play **one** node at the run's current position to completion (D22/D23): a
   * **combat** node runs camp → stage → auto-battle → resolve; a **rest** node
   * runs the recovery step. The orchestrator must already be positioned (via
   * {@link choose}). Returns the node played. The interactive render drives the
   * battle itself — this is the headless fast-forward used by {@link autoTraverse}.
   */
  playCurrentNode(): MapNode {
    const node = currentNode(this.run);
    if (node.kind === "rest") {
      this.restNode();
      return node;
    }
    if (node.kind === "event") {
      this.eventNode();
      return node;
    }
    this.camp();
    if (this.isOver()) return node; // a dying clock ran out at camp → wipe
    this.startEncounter();
    this.beginBattle();
    this.autoBattle();
    this.resolve();
    return node;
  }

  /**
   * **Pick-first-reachable** traversal of the whole map to a terminal state
   * (D22) — deterministically choosing the first reachable node each step and
   * playing it, until the run is **over** (wipe / lost) or **complete** (final
   * node cleared). Returns the route taken. Lets a headless test play an entire
   * map to a wipe/clear and replay a seed.
   */
  autoTraverse(maxNodes = 100): string[] {
    let guard = 0;
    while (!this.isTerminal() && guard++ < maxNodes) {
      const next = this.reachable();
      if (next.length === 0) break; // only the final node has none — defensive
      this.choose(next[0].id);
      this.playCurrentNode();
    }
    return [...this.run.path];
  }

  /**
   * Play the current battle to a decision **deterministically** — both sides use
   * the same nearest-enemy AI, threading no randomness beyond the clock's stable
   * tie-breaks. Returns the winning side. Used by the full-loop integration test
   * (and as a "simulate" hook); the interactive render drives the battle itself.
   */
  autoBattle(maxTurns = 1000): "player" | "enemy" | undefined {
    if (!this.battle) throw new Error("RunLoop.autoBattle: no staged battle");
    const battle = this.battle;
    for (let i = 0; i < maxTurns; i++) {
      const o = battle.outcome();
      if (o.over) return o.winner;
      const actor = battle.nextActor();
      if (!actor) break;
      const plan = planEnemyTurn(actor, battle.units, battle.grid);
      if (plan.path.length > 0) battle.moveUnit(actor, plan.path);
      if (plan.target && plan.target.alive) battle.attack(actor, plan.target);
      battle.endTurn(actor, { moved: plan.path.length > 0, acted: plan.target !== null });
    }
    return battle.outcome().winner;
  }
}
