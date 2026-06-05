import Phaser from "phaser";
import {
  createRun,
  RunLoop,
  previewNode,
  createUnit,
  slotsUsed,
  countOf,
  moraleTier,
  type RunState,
  type MapNode,
  type NodePreview,
  type RestResult,
  type Unit,
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
 * The M7 **overworld** screen — the seeded, branching run map (D22). It owns the
 * run + {@link RunLoop} and is the screen the player returns to between missions:
 * it draws the layered node DAG, highlights the **reachable** nodes, previews each
 * with banded intel (D24), and commits a choice. A **combat** node hands off to
 * {@link "./BattleScene"} (the existing Camp → Deployment → Battle → Resolution
 * flow); a **rest** node recovers in place (D23). On a wipe it shows the M6-style
 * **run-end** screen (seed for replay); on clearing the final node, a **run
 * complete** screen. It owns no rules — every decision flows through the loop.
 */
export class OverworldScene extends Phaser.Scene {
  private run!: RunState;
  private loop!: RunLoop;

  private graph?: Phaser.GameObjects.Graphics;
  private nodePos = new Map<string, { x: number; y: number }>();
  private nodeObjects: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];

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
      circle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.commitNode(node));
    }
  }

  // --- Selection / preview (D24) --------------------------------------------

  private showPreview(node: MapNode): void {
    const p = previewNode(this.run, node.id);
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

  private commitNode(node: MapNode): void {
    this.clearMap(); // drop the (now stale) interactive nodes before we move on
    this.loop.choose(node.id);
    if (node.kind === "combat") {
      // Hand the run off to the battle flow; it returns to this scene when done.
      this.scene.start("BattleScene", { run: this.run, loop: this.loop } as RunHandoff);
    } else {
      this.playRest();
    }
  }

  private clearMap(): void {
    for (const o of this.nodeObjects) o.destroy();
    this.nodeObjects = [];
    this.graph?.destroy();
    this.graph = undefined;
    this.previewText.setText("");
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
