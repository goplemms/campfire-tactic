import Phaser from "phaser";
import {
  createRun,
  RunLoop,
  previewNode,
  createUnit,
  slotsUsed,
  countOf,
  moraleTier,
  // M8 — the overworld action economy (D35)
  getAbility,
  cooldownRemaining,
  scoutedTier,
  fatigueTier,
  fatiguePenalty,
  unitSkills,
  applyCampSkill,
  addItem,
  triageHeal,
  chunkHp,
  runDifficulty,
  combatRoster,
  type RunState,
  type MapNode,
  type NodePreview,
  type RestResult,
  type Unit,
  type OverworldAbility,
  type ActionResult,
  type SkillDef,
} from "../../core";

/** A small text button with a hover highlight. */
interface TextButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** Data handed between the overworld and a combat node's BattleScene. */
export interface RunHandoff {
  run: RunState;
  loop: RunLoop;
}

/**
 * The **overworld** screen — the seeded, branching run map (D22) and, since M8,
 * the **unified overworld camp** (D35). It owns the run + {@link RunLoop} and is
 * the screen the player returns to between missions: it draws the layered node DAG,
 * highlights the **reachable** nodes, and previews each with banded intel (D24).
 *
 * **M8 — camp at every node (D35).** Choosing a node no longer plays it straight
 * away; it opens **one unified camp** (the title callback) where the player takes
 * **overworld actions** — gated by per-ability **node-step cooldowns** (the spine)
 * and per-character **fatigue** (a loose guardrail) — then **commits**. This folds
 * the old separate Meta-phase screen in: the camp's meta skills (Chef/Merchant),
 * provisioning and triage now live here, alongside the new overworld economy. A
 * **combat** node's commit hands off to {@link "./BattleScene"} (Deployment → Battle
 * → Resolution, unchanged downstream); a **rest** node recovers in place and
 * **restores fatigue** (D23/D35). On a wipe it shows the **run-end** screen (seed
 * for replay); on clearing the final node, a **run complete** screen. It owns no
 * rules — every decision flows through the loop.
 */
export class OverworldScene extends Phaser.Scene {
  private run!: RunState;
  private loop!: RunLoop;

  private graph?: Phaser.GameObjects.Graphics;
  private nodePos = new Map<string, { x: number; y: number }>();
  private nodeObjects: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];

  // The unified overworld camp (D35): objects + the node currently camped at.
  private campObjects: Phaser.GameObjects.GameObject[] = [];
  private campNode?: MapNode;

  private titleText!: Phaser.GameObjects.Text;
  private campText!: Phaser.GameObjects.Text;
  private previewText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super("OverworldScene");
  }

  /** Resume data: an in-flight run+loop handed back from a BattleScene. */
  init(data?: Partial<RunHandoff>): void {
    this.run = data?.run as RunState;
    this.loop = data?.loop as RunLoop;
  }

  create(): void {
    // Seed bar (the re-enterable replay field) + New Run button.
    const seedInput = document.getElementById("seed") as HTMLInputElement | null;
    const newRunBtn = document.getElementById("newrun") as HTMLButtonElement | null;
    if (newRunBtn) newRunBtn.onclick = () => this.scene.start("OverworldScene");

    // Fresh run from the seed field unless we're resuming an in-flight one.
    if (!this.run || !this.loop) {
      let seed = seedInput?.value.trim() ?? "";
      if (!seed) {
        seed = `run-${Date.now()}`;
        if (seedInput) seedInput.value = seed;
      }
      this.run = createRun(seed, { party: this.startingRoster(), difficultyId: "normal", gold: 120, storageCap: 6 });
      this.loop = new RunLoop(this.run);
    }

    this.titleText = this.add.text(this.scale.width / 2, 16, "", { color: "#e8eefc", fontSize: "18px" }).setOrigin(0.5).setDepth(10);
    this.campText = this.add.text(this.scale.width / 2, 40, "", { color: "#cdd7ee", fontSize: "13px" }).setOrigin(0.5).setDepth(10);
    this.previewText = this.add.text(this.scale.width / 2, this.scale.height - 96, "", { color: "#d6c98a", fontSize: "13px", align: "center", wordWrap: { width: 720 } }).setOrigin(0.5).setDepth(10);
    this.hintText = this.add.text(this.scale.width / 2, this.scale.height - 64, "", { color: "#9fb0d0", fontSize: "13px", align: "center", wordWrap: { width: 720 } }).setOrigin(0.5).setDepth(10);

    this.refreshCampText();

    // Terminal screens take over the map.
    if (this.loop.isOver()) return this.runEnd();
    if (this.loop.isComplete()) return this.runComplete();

    this.drawMap();
  }

  /** The starting party: two fighters + camp-only Chef and Merchant (D3). */
  private startingRoster(): Unit[] {
    return [
      createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, name: "Rook", jobId: "soldier", awareness: 4, intelligence: 4, speed: 12, maxHp: 30, attack: 9, defense: 3, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, name: "Vale", jobId: "survivalist", awareness: 2, intelligence: 2, speed: 10, maxHp: 24, attack: 11, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Pip", side: "player", pos: { col: -1, row: -1 }, name: "Pip", jobId: "chef", speed: 8, maxHp: 18, attack: 3, defense: 1, moveRange: 3, sightRadius: 4 }),
      createUnit({ id: "Coin", side: "player", pos: { col: -1, row: -1 }, name: "Coin", jobId: "merchant", speed: 8, maxHp: 16, attack: 2, defense: 1, moveRange: 3, sightRadius: 4 }),
    ];
  }

  // --- Map drawing ----------------------------------------------------------

  private drawMap(): void {
    for (const o of this.nodeObjects) o.destroy();
    this.nodeObjects = [];
    this.graph?.destroy();
    this.nodePos.clear();

    const map = this.run.map;
    const reachableIds = new Set(this.loop.reachable().map((n) => n.id));
    const onPath = new Set(this.run.path);

    this.titleText.setText(`Overworld — Night ${this.run.night + 1} · choose your next move`);

    // Layout: layers left→right, nodes spread vertically within each layer.
    const marginX = 80;
    const usableW = this.scale.width - 2 * marginX;
    const centerY = this.scale.height / 2 - 20;
    const byLayer = new Map<number, MapNode[]>();
    for (const id of map.order) {
      const node = map.nodes[id];
      byLayer.set(node.layer, [...(byLayer.get(node.layer) ?? []), node]);
    }
    for (const [layer, nodes] of byLayer) {
      const x = map.layers > 1 ? marginX + (layer * usableW) / (map.layers - 1) : this.scale.width / 2;
      const rowGap = 84;
      nodes.forEach((node, i) => {
        const y = centerY + (i - (nodes.length - 1) / 2) * rowGap;
        this.nodePos.set(node.id, { x, y });
      });
    }

    // Edges underneath the nodes.
    this.graph = this.add.graphics().setDepth(0);
    for (const id of map.order) {
      const from = this.nodePos.get(id)!;
      for (const e of map.nodes[id].edges) {
        const to = this.nodePos.get(e)!;
        const live = this.run.mapNodeId === id; // edges out of the current node
        this.graph.lineStyle(live ? 3 : 1.5, live ? 0x7fe0a0 : 0x3d4b6e, live ? 0.9 : 0.5);
        this.graph.lineBetween(from.x, from.y, to.x, to.y);
      }
    }

    // Nodes on top.
    for (const id of map.order) {
      const node = map.nodes[id];
      const pos = this.nodePos.get(id)!;
      const reachable = reachableIds.has(id);
      const current = this.run.mapNodeId === id;
      const visited = onPath.has(id) && !current;
      this.drawNode(node, pos, { reachable, current, visited });
    }

    this.setHint("Click a highlighted node to preview it; click again to commit. Combat nodes start a mission; rest nodes recover.");
    this.previewText.setText("");
  }

  private drawNode(node: MapNode, pos: { x: number; y: number }, state: { reachable: boolean; current: boolean; visited: boolean }): void {
    const isFinal = node.layer === this.run.map.layers - 1;
    const baseColor = node.kind === "rest" ? 0x57b07a : isFinal ? 0xd6b24a : 0xc6584f;
    const radius = isFinal ? 20 : 15;

    let alpha = 0.32;
    if (state.current) alpha = 1;
    else if (state.reachable) alpha = 1;
    else if (state.visited) alpha = 0.6;

    const circle = this.add.circle(pos.x, pos.y, radius, baseColor, alpha).setDepth(1);
    if (state.current) circle.setStrokeStyle(3, 0xffffff, 1);
    else if (state.reachable) circle.setStrokeStyle(3, 0x7fe0a0, 1);
    else circle.setStrokeStyle(1, 0x222b40, 0.8);
    this.nodeObjects.push(circle);

    // Kind glyph.
    const glyph = node.kind === "rest" ? "❄" : isFinal ? "★" : "⚔";
    const label = this.add.text(pos.x, pos.y, glyph, { color: "#11141b", fontSize: isFinal ? "16px" : "13px" }).setOrigin(0.5).setDepth(2);
    this.nodeObjects.push(label);

    if (state.visited) {
      const tick = this.add.text(pos.x + radius - 2, pos.y - radius + 2, "✓", { color: "#9ff0bf", fontSize: "12px" }).setOrigin(0.5).setDepth(2);
      this.nodeObjects.push(tick);
    }

    if (state.reachable) {
      circle.setInteractive({ useHandCursor: true });
      circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.showPreview(node));
      circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.enterCamp(node));
    }
  }

  // --- Selection / preview (D24) --------------------------------------------

  private showPreview(node: MapNode): void {
    // Read at the floor + whatever Scout has bought for this node (D35).
    const p = previewNode(this.run, node.id, scoutedTier(this.run.overworld, node.id));
    this.previewText.setText(this.describePreview(p));
  }

  private describePreview(p: NodePreview): string {
    if (p.kind === "rest") return `Layer ${p.layer} · Rest — ${p.restHint}`;
    const parts = [`Layer ${p.layer} · Combat (${p.encounterType})`];
    if (p.intel?.types) parts.push(`enemies: ${p.intel.types.join(", ")}`);
    else parts.push("enemies: unknown");
    if (p.intel?.count !== undefined) parts.push(`count: ${p.intel.count}`);
    if (p.intel?.grantsVision) parts.push("starting vision");
    parts.push(`reward: ${p.rewardHint ?? "unknown"}`);
    return parts.join("   ·   ");
  }

  private clearMap(): void {
    for (const o of this.nodeObjects) o.destroy();
    this.nodeObjects = [];
    this.graph?.destroy();
    this.graph = undefined;
    this.previewText.setText("");
  }

  // --- The unified overworld camp (D35) -------------------------------------

  /**
   * Open the unified camp at a chosen node: advance the run there, then surface the
   * overworld actions (cooldown- + fatigue-gated) and meta/provision actions before
   * the player commits onward. This is the single between-nodes surface (D35).
   */
  private enterCamp(node: MapNode): void {
    this.clearMap();
    this.loop.choose(node.id);
    this.campNode = node;
    this.renderCamp();
  }

  /** (Re)draw the camp panel — called after every action so readouts stay live. */
  private renderCamp(): void {
    const node = this.campNode!;
    this.clearCamp();
    this.refreshCampText();

    const isCombat = node.kind === "combat";
    this.titleText.setText(`Camp — Night ${this.run.night + 1} · ${isCombat ? `Combat (layer ${node.layer})` : "Rest"}`);
    this.setHint("Take overworld actions (cooldown- and fatigue-gated), then commit. Cooldowns tick as you advance.");

    const cx = this.scale.width / 2;
    const panelW = 720;
    const top = 90;
    const colX = cx - panelW / 2 + 30;
    const rowH = 30;

    // --- Overworld actions (the new economy, D35) ---
    this.campObjects.push(
      this.add.text(colX - 10, top - 6, "Overworld Actions", { color: "#9ff0bf", fontSize: "14px" }).setOrigin(0, 0.5).setDepth(11),
    );
    let y = top + 22;

    // Scout — one button per reachable node ahead (the chosen target, D24/D35).
    const scout = getAbility("scout")!;
    const ahead = this.loop.reachable();
    for (const target of ahead) {
      const actor = this.scoutActor();
      const label = `Scout → ${target.id} (${target.kind})  ·  ${this.costReadout(scout, actor)}`;
      const refusal = this.refusal(scout, actor);
      this.campButton(colX, y, 360, 24, label, !refusal, () => this.doOverworldAction(actor, "scout", { targetNodeId: target.id }), refusal ?? scout.description);
      y += rowH;
    }

    // Market — the Merchant's ACCESS verb (D30) as an overworld action.
    const market = getAbility("market")!;
    const marketActor = this.marketActor();
    const mRefusal = this.refusal(market, marketActor);
    this.campButton(colX, y, 360, 24, `${marketActor.name}: Market  ·  ${this.costReadout(market, marketActor)}`, !mRefusal, () => this.doOverworldAction(marketActor, "market"), mRefusal ?? market.description);
    y += rowH + 8;

    // --- Camp / meta actions (the folded-in Meta phase + provisioning) ---
    this.campObjects.push(
      this.add.text(colX - 10, y, "Camp", { color: "#d6c98a", fontSize: "14px" }).setOrigin(0, 0.5).setDepth(11),
    );
    y += 22;
    for (const u of this.run.party) {
      for (const skill of unitSkills(u, "meta")) {
        this.campButton(colX, y, 360, 24, `${u.name}: ${skill.name}`, true, () => this.useCampSkill(skill), `${skill.name} — ${skill.description}`);
        y += rowH;
      }
    }
    this.campButton(colX, y, 360, 24, "Load Trap Kit (15g)", true, () => this.provisionTrapKit(), "Buy a Trap Kit into storage (1 slot) for the Survivalist.");
    y += rowH;
    this.campButton(colX, y, 360, 24, "Triage Heal", true, () => this.triage(), "Spend Rest Points to heal the most-wounded fighter one chunk (D9).");
    const leftBottom = y + 16;

    // --- Fatigue meter (per-character, banded — à la the morale readout) ---
    const meterX = cx + 60;
    this.campObjects.push(
      this.add.text(meterX, top - 6, "Fatigue", { color: "#cdd7ee", fontSize: "14px" }).setOrigin(0, 0.5).setDepth(11),
      this.add.text(meterX, top + 18, this.fatigueMeter(), { color: "#cdd7ee", fontSize: "13px", lineSpacing: 6 }).setOrigin(0, 0).setDepth(11),
    );
    const meterBottom = top + 18 + this.run.party.filter((u) => u.alive).length * 21 + 8;

    // --- Commit — placed below all content so it never collides with buttons ---
    const contentBottom = Math.max(leftBottom, meterBottom);
    const commitLabel = isCombat ? "Commit — Begin Mission" : "Commit — Make Camp (Rest)";
    const commit = this.makeTextButton(cx, contentBottom + 26, 240, 34, commitLabel, 0x2f6b46, 0x57b07a, () => this.commit());
    this.campObjects.push(commit.bg, commit.label);

    // Backdrop sized to the actual content (added last; its low depth keeps it behind).
    const panelTop = top - 22;
    const panelBottom = contentBottom + 50;
    this.campObjects.push(
      this.add.rectangle(cx, (panelTop + panelBottom) / 2, panelW, panelBottom - panelTop, 0x141925, 0.96).setStrokeStyle(2, 0x3d4b6e).setDepth(8),
    );
  }

  /** A human-readable cost line for an overworld ability (cooldown + fatigue + gold). */
  private costReadout(ability: OverworldAbility, actor: Unit): string {
    const cd = cooldownRemaining(this.run.overworld, ability.id);
    const cdStr = cd > 0 ? `${cd} node${cd === 1 ? "" : "s"}` : "ready";
    const parts = [`cd: ${cdStr}`];
    const baseFat = ability.cost.fatigue ?? 0;
    if (baseFat > 0) {
      const surcharge = fatiguePenalty(actor.fatigue).surcharge;
      parts.push(`fatigue: ${baseFat + surcharge}${surcharge > 0 ? " (tired)" : ""}`);
    }
    if (ability.cost.gold) parts.push(`gold: ${ability.cost.gold}`);
    return parts.join(", ");
  }

  /** Why an ability would refuse right now (cooldown / exhaustion / gold), or null. */
  private refusal(ability: OverworldAbility, actor: Unit): string | null {
    const cd = cooldownRemaining(this.run.overworld, ability.id);
    if (cd > 0) return `On cooldown — ${cd} more node${cd === 1 ? "" : "s"}.`;
    const baseFat = ability.cost.fatigue ?? 0;
    if (baseFat >= fatiguePenalty(actor.fatigue).lockAtOrAbove) return `${actor.name} is too exhausted — rest first.`;
    if (ability.cost.gold && this.run.camp.gold < ability.cost.gold) return `Not enough gold (${ability.cost.gold}g).`;
    return null;
  }

  /** Units that can act on the overworld — alive and not bound (D7). */
  private activeUnits(): Unit[] {
    return this.run.party.filter((u) => u.alive && !u.captured);
  }

  /** The acting unit for Scout: the highest-Intelligence active member (a survey skill). */
  private scoutActor(): Unit {
    const active = this.activeUnits();
    return active.reduce((best, u) => (u.intelligence > best.intelligence ? u : best), active[0] ?? this.run.party[0]);
  }

  /** The acting unit for Market: the Merchant if active, else any active member. */
  private marketActor(): Unit {
    const active = this.activeUnits();
    return active.find((u) => u.jobId === "merchant") ?? active[0] ?? this.run.party[0];
  }

  /** A banded per-character fatigue readout (overworld-only, never combat). */
  private fatigueMeter(): string {
    return this.run.party
      .filter((u) => u.alive)
      .map((u) => `${u.name}: ${fatigueTier(u.fatigue)} (${u.fatigue})`)
      .join("\n");
  }

  private doOverworldAction(actor: Unit, abilityId: string, opts: { targetNodeId?: string } = {}): void {
    const res: ActionResult = this.loop.overworldAction(actor, abilityId, opts);
    this.renderCamp();
    this.setHint(res.applied ? `${res.detail ?? "Done."}` : `Can't: ${res.reason ?? "refused."}`);
  }

  private useCampSkill(skill: SkillDef): void {
    const out = applyCampSkill(skill, this.run.camp);
    if (out.storage) this.run.inventory.storageCap = this.run.camp.storageCap;
    this.renderCamp();
    const parts: string[] = [];
    if (out.gold) parts.push(`+${out.gold} gold`);
    if (out.storage) parts.push(`+${out.storage} storage`);
    if (out.morale) parts.push(`+${out.morale} morale`);
    if (out.bankedHeal) parts.push(`banked +${out.bankedHeal} HP/unit`);
    this.setHint(`${skill.name}: ${parts.join(", ")}.`);
  }

  private provisionTrapKit(): void {
    const cost = 15;
    if (this.run.camp.gold < cost) return this.setHint("Not enough gold for a Trap Kit (15g).");
    if (addItem(this.run.inventory, "trap-kit", 1)) {
      this.run.camp.gold -= cost;
      this.renderCamp();
      this.setHint(`Bought a Trap Kit (${countOf(this.run.inventory, "trap-kit")} carried).`);
    } else {
      this.setHint("Storage full — Market or Trade for more slots.");
    }
  }

  private triage(): void {
    const policy = runDifficulty(this.run);
    const wounded = combatRoster(this.run)
      .filter((u) => u.hp < u.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!wounded) return this.setHint("No wounded fighters to heal.");
    if (this.run.rp < policy.rpPerChunk) return this.setHint(`Not enough RP (need ${policy.rpPerChunk} for a ${chunkHp(wounded)} HP chunk).`);
    const res = triageHeal(wounded, policy.rpPerChunk, policy);
    this.run.rp -= res.rpSpent;
    this.renderCamp();
    this.setHint(`Triaged ${wounded.name}: +${res.hpHealed} HP for ${res.rpSpent} RP.`);
  }

  /** A camp button that greys out (non-interactive) when disabled, with a reason on hover. */
  private campButton(x: number, y: number, w: number, h: number, text: string, enabled: boolean, onClick: () => void, description: string): void {
    const fill = enabled ? 0x26314a : 0x1b2030;
    const bg = this.add.rectangle(x, y, w, h, fill).setStrokeStyle(1, enabled ? 0x4a5d86 : 0x2a3142).setOrigin(0, 0.5).setDepth(10);
    const label = this.add.text(x + 8, y, text, { color: enabled ? "#dbe5fb" : "#6b7488", fontSize: "12px" }).setOrigin(0, 0.5).setDepth(11);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    }
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.hintText.setText(description));
    this.campObjects.push(bg, label);
  }

  private clearCamp(): void {
    for (const o of this.campObjects) o.destroy();
    this.campObjects = [];
  }

  /** Leave the camp and play the node (D35): combat hands off; rest recovers here. */
  private commit(): void {
    const node = this.campNode!;
    this.clearCamp();
    this.campNode = undefined;
    if (node.kind === "combat") {
      // Hand the run off to the battle flow; it returns to this scene when done.
      this.scene.start("BattleScene", { run: this.run, loop: this.loop } as RunHandoff);
    } else {
      this.playRest();
    }
  }

  // --- Rest node (D23) -------------------------------------------------------

  private playRest(): void {
    const res = this.loop.restNode();
    this.refreshCampText();
    this.showRestScreen(res);
  }

  private showRestScreen(res: RestResult): void {
    const lines: string[] = [];
    const upkeepNote = res.upkeep.underfunded.length > 0 ? `Underfunded ${res.upkeep.underfunded.join(" + ")} — morale took a hit.` : `Upkeep paid (${res.upkeep.paid}g).`;
    lines.push(upkeepNote);
    lines.push(`Banked +${res.rpAdded} Rest Points; morale +${res.moraleGained}.`);
    if (res.healed.length) lines.push(`Triaged: ${res.healed.map((h) => `${h.unitId} +${h.hp} HP`).join(", ")}.`);
    else lines.push("No one needed triage — the party rested easy.");
    if (res.fatigueRestored.length) lines.push(`Fatigue restored: ${res.fatigueRestored.join(", ")} back to Rested.`);
    else lines.push("Everyone was already rested.");
    if (res.dyingLost.length) lines.push(`Lost to wounds: ${res.dyingLost.join(", ")}.`);

    this.showOverlay("Rest", lines.join("\n"), true, 520, 200, () => {
      if (this.loop.isOver()) return this.runEnd();
      if (this.loop.isComplete()) return this.runComplete();
      this.drawMap();
    });
  }

  // --- Terminal screens ------------------------------------------------------

  private runComplete(): void {
    const won = this.run.history.filter((h) => h.winner === "player").length;
    const lines = [
      "You cleared the final mission — the run is complete!",
      "",
      `Survived ${this.run.night} night(s), won ${won} encounter(s).`,
      `Final gold ${this.run.camp.gold}.`,
      "",
      `Seed:  ${this.run.seed}`,
      "Re-enter the seed above and press New Run to replay this exact map.",
    ];
    this.titleText.setText("Run Complete");
    this.showOverlay("Run Complete!", lines.join("\n"), true, 560, 250);
    this.setHint("Run complete. Re-enter the seed above and press New Run to replay the same map.");
  }

  private runEnd(): void {
    const won = this.run.history.filter((h) => h.winner === "player").length;
    const last = this.run.history[this.run.history.length - 1];
    const lines = [
      last && last.winner === "enemy" ? "The party was overwhelmed." : "The run has ended.",
      "",
      `Survived ${this.run.night} night(s), won ${won} encounter(s).`,
      `Final gold ${this.run.camp.gold}.`,
      "",
      `Seed:  ${this.run.seed}`,
      "Re-enter the seed above and press New Run to replay this run.",
    ];
    this.titleText.setText("Run Over");
    this.showOverlay("Run Over", lines.join("\n"), false, 560, 250);
    this.setHint("Run over. Re-enter the seed above and press New Run to replay the same run.");
  }

  // --- UI helpers ------------------------------------------------------------

  private refreshCampText(): void {
    const tier = moraleTier(this.run.camp.morale);
    this.campText.setText(
      `Gold ${this.run.camp.gold}  ·  Morale ${tier} (${this.run.camp.morale})  ·  ` +
        `Storage ${slotsUsed(this.run.inventory)}/${this.run.inventory.storageCap}  ·  Kits ${countOf(this.run.inventory, "trap-kit")}  ·  RP ${this.run.rp}`,
    );
  }

  private setHint(text: string): void {
    this.hintText.setText(text);
  }

  private showOverlay(title: string, body: string, good: boolean, w = 480, h = 200, onContinue?: () => void): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 - 20;
    this.overlay.push(
      this.add.rectangle(cx, cy, w, h, 0x11141b, 0.94).setStrokeStyle(2, good ? 0x57b07a : 0xb05757).setDepth(20),
      this.add.text(cx, cy - h / 2 + 26, title, { color: good ? "#9ff0bf" : "#f0a0a0", fontSize: "24px" }).setOrigin(0.5).setDepth(21),
      this.add.text(cx, cy + 6, body, { color: "#cdd7ee", fontSize: "13px", align: "center", lineSpacing: 4 }).setOrigin(0.5).setDepth(21),
    );
    if (onContinue) {
      const btn = this.makeTextButton(cx, cy + h / 2 - 20, 160, 30, "Continue", 0x2f6b46, 0x57b07a, () => {
        for (const o of this.overlay) o.destroy();
        this.overlay = [];
        onContinue();
      });
      this.overlay.push(btn.bg, btn.label);
    }
  }

  private makeTextButton(x: number, y: number, w: number, h: number, text: string, fill: number, stroke: number, onClick: () => void): TextButton {
    const bg = this.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true }).setDepth(22);
    const label = this.add.text(x, y, text, { color: "#eafff0", fontSize: "13px" }).setOrigin(0.5).setDepth(23);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => bg.setFillStyle(Phaser.Display.Color.IntegerToColor(fill).brighten(18).color));
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => bg.setFillStyle(fill));
    return { bg, label };
  }
}
