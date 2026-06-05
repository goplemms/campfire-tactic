import Phaser from "phaser";
import {
  gridToScreen,
  screenToGrid,
  findPath,
  occupiedGrid,
  isAdjacent,
  TileGrid,
  TILE_WIDTH,
  TILE_HEIGHT,
  Battle,
  createUnit,
  unitSkills,
  isValidSkillTarget,
  // M5 — phases, jobs, camp
  PhasePipeline,
  PhaseSkillRegistry,
  registerParty,
  createCamp,
  applyCampSkill,
  applyCampToParty,
  moraleTier,
  makeTrap,
  // M5b — logistics, deployment gamble, resolution
  createInventory,
  addItem,
  removeItem,
  countOf,
  slotsUsed,
  createExposure,
  recordPlacement,
  exposureRisk,
  safeDepth,
  placementCost,
  freeCaptive,
  recoverMaterials,
  type Inventory,
  type DeployExposure,
  type Camp,
  type GridCoord,
  type Unit,
  type Side,
  type SkillDef,
} from "../../core";

/** A small text button with a hover highlight. */
interface TextButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/**
 * The M5 mini-loop scene: Camp (Meta) → Deployment → Battle, driven by the
 * core's {@link PhasePipeline}. The scene owns **no** rules — it invokes the
 * signature jobs' skills through `core` (Merchant/Chef in camp, Survivalist in
 * deployment) and the {@link Battle} in combat, then draws the results. It proves
 * the D3 seam: three jobs each hook a *different* phase, and the prep (a banked
 * Chef heal, a placed Survivalist trap) pays off in the following battle.
 */
export class BattleScene extends Phaser.Scene {
  private static readonly COLS = 8;
  private static readonly ROWS = 6;
  private static readonly BLOCKED: readonly GridCoord[] = [
    { col: 3, row: 2 },
    { col: 4, row: 2 },
    { col: 4, row: 3 },
  ];

  private grid!: TileGrid;
  private battle!: Battle;
  private camp!: Camp;
  private inventory!: Inventory;
  private pipeline!: PhasePipeline;
  private phaseSkills!: PhaseSkillRegistry;
  /** The full player party (incl. off-grid Chef/Merchant), for camp skills. */
  private party: Unit[] = [];
  /** The player unit currently active in Deployment (selected to move/place). */
  private deployActor: Unit | null = null;
  /** Per-unit deployment exposure meters. */
  private deployExposures = new Map<string, DeployExposure>();
  /** Translucent overlay marking the active unit's safe (zero-risk) depth. */
  private safeZoneGfx?: Phaser.GameObjects.Graphics;
  /** Where a captured unit is repositioned (enemy safe zone). */
  private static readonly CAPTURE_TILE: GridCoord = { col: 6, row: 5 };
  private originX = 0;
  private originY = 0;

  /** Per-unit render handles. */
  private views = new Map<
    string,
    {
      container: Phaser.GameObjects.Container;
      body: Phaser.GameObjects.Arc;
      hp: Phaser.GameObjects.Text;
    }
  >();
  private highlight!: Phaser.GameObjects.Graphics;
  private orderText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private campText!: Phaser.GameObjects.Text;

  /** Bottom-centre primary button (Proceed / Start Battle / Advance Clock). */
  private primary!: TextButton;
  /** Per-phase action buttons (camp/deploy/skill), cleared on phase change. */
  private actionButtons: Phaser.GameObjects.GameObject[] = [];

  // Battle interaction state.
  private waitingFor: Unit | null = null;
  private armedSkill: SkillDef | null = null;
  private lastHint = "";
  private busy = false;
  private over = false;

  // Deployment state.
  private trapDamage = 12;
  private placedTraps: {
    pos: GridCoord;
    damage: number;
    marker: Phaser.GameObjects.Text;
    sprung: boolean;
  }[] = [];

  constructor() {
    super("BattleScene");
  }

  create(): void {
    this.grid = new TileGrid(BattleScene.COLS, BattleScene.ROWS, BattleScene.BLOCKED);
    this.battle = new Battle(this.grid, this.makeCombatants());
    this.camp = createCamp({ gold: 0, storageCap: 6, morale: 0 });
    this.inventory = createInventory(this.camp.storageCap);
    this.pipeline = new PhasePipeline();

    // The party = on-grid combatants + off-grid non-combat jobs (Chef/Merchant).
    this.party = [
      ...this.battle.units.filter((u) => u.side === "player"),
      ...this.makeCampCrew(),
    ];
    this.phaseSkills = new PhaseSkillRegistry();
    registerParty(this.party, this.phaseSkills);

    this.originX = this.scale.width / 2;
    this.originY = this.scale.height / 2 - (BattleScene.ROWS * TILE_HEIGHT) / 2 - 10;

    this.drawGrid();
    this.highlight = this.add.graphics().setDepth(0.5);
    this.spawnUnits();

    this.titleText = this.add
      .text(this.scale.width / 2, 22, "", { color: "#e8eefc", fontSize: "18px" })
      .setOrigin(0.5)
      .setDepth(10);
    this.campText = this.add
      .text(this.scale.width / 2, 46, "", { color: "#cdd7ee", fontSize: "13px" })
      .setOrigin(0.5)
      .setDepth(10);
    this.orderText = this.add
      .text(12, 12, "", { color: "#cdd7ee", fontSize: "13px", lineSpacing: 3 })
      .setDepth(10);
    this.hintText = this.add
      .text(this.scale.width / 2, this.scale.height - 104, "", {
        color: "#9fb0d0",
        fontSize: "14px",
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.primary = this.makeTextButton(
      this.scale.width / 2,
      this.scale.height - 26,
      190,
      34,
      "",
      0x2f6b46,
      0x57b07a,
      () => this.onPrimary(),
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    this.refreshCampText();
    this.enterCampPhase();
  }

  // --- Rosters (pure data) ---------------------------------------------------

  /** The on-grid combatants. */
  private makeCombatants(): Unit[] {
    return [
      createUnit({ id: "Rook", side: "player", pos: { col: 0, row: 1 }, name: "Rook", jobId: "soldier", awareness: 4, speed: 12, maxHp: 30, hp: 18, attack: 9, defense: 3, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Vale", side: "player", pos: { col: 0, row: 4 }, name: "Vale", jobId: "survivalist", awareness: 2, speed: 10, maxHp: 24, hp: 14, attack: 11, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Grunt", side: "enemy", pos: { col: 7, row: 1 }, name: "Grunt", awareness: 3, speed: 9, maxHp: 22, attack: 7, defense: 2, moveRange: 4, sightRadius: 5 }),
      createUnit({ id: "Brute", side: "enemy", pos: { col: 7, row: 4 }, name: "Brute", awareness: 3, speed: 7, maxHp: 30, attack: 8, defense: 3, moveRange: 3, sightRadius: 4 }),
    ];
  }

  /** Off-grid party members whose jobs act only in camp. */
  private makeCampCrew(): Unit[] {
    return [
      createUnit({ id: "Pip", side: "player", pos: { col: -1, row: -1 }, name: "Pip", jobId: "chef", speed: 8, maxHp: 18, attack: 3, defense: 1, moveRange: 3, sightRadius: 4 }),
      createUnit({ id: "Coin", side: "player", pos: { col: -1, row: -1 }, name: "Coin", jobId: "merchant", speed: 8, maxHp: 16, attack: 2, defense: 1, moveRange: 3, sightRadius: 4 }),
    ];
  }

  // --- Coordinate helpers ----------------------------------------------------

  private tileToWorld(coord: GridCoord): { x: number; y: number } {
    const { x, y } = gridToScreen(coord);
    return { x: this.originX + x, y: this.originY + y };
  }

  private worldToTile(px: number, py: number): GridCoord {
    const frac = screenToGrid({ x: px - this.originX, y: py - this.originY });
    return { col: Math.round(frac.col), row: Math.round(frac.row) };
  }

  // --- Drawing ---------------------------------------------------------------

  private drawGrid(): void {
    const g = this.add.graphics();
    for (let row = 0; row < BattleScene.ROWS; row++) {
      for (let col = 0; col < BattleScene.COLS; col++) {
        const { x, y } = this.tileToWorld({ col, row });
        const walkable = this.grid.isWalkable({ col, row });
        const fill = !walkable
          ? 0x55304a
          : (col + row) % 2 === 0
            ? 0x2a3550
            : 0x222b40;
        this.drawDiamond(g, x, y, fill);
      }
    }
  }

  private drawDiamond(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    fill: number,
  ): void {
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    g.fillStyle(fill, 1);
    g.lineStyle(1, 0x3d4b6e, 1);
    g.beginPath();
    g.moveTo(cx, cy - halfH);
    g.lineTo(cx + halfW, cy);
    g.lineTo(cx, cy + halfH);
    g.lineTo(cx - halfW, cy);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private spawnUnits(): void {
    for (const unit of this.battle.units) {
      const color = unit.side === "player" ? 0xffcf6b : 0xe06b6b;
      const stroke = unit.side === "player" ? 0x6b4a1c : 0x6b1c1c;
      const body = this.add.circle(0, -TILE_HEIGHT / 2, 11, color);
      body.setStrokeStyle(2, stroke);
      const label = this.add
        .text(0, -TILE_HEIGHT / 2 - 26, unit.name, { color: "#e8eefc", fontSize: "11px" })
        .setOrigin(0.5);
      const hp = this.add
        .text(0, -TILE_HEIGHT / 2 - 13, "", { color: "#bfe8c0", fontSize: "11px" })
        .setOrigin(0.5);
      const container = this.add.container(0, 0, [body, label, hp]).setDepth(1);
      this.views.set(unit.id, { container, body, hp });
      this.placeView(unit);
    }
    this.refreshHp();
  }

  /** Recolour a captured/freed unit's token (purple = bound). */
  private tintCaptured(unit: Unit, captured: boolean): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    view.body.setFillStyle(captured ? 0x9a6bd0 : 0xffcf6b);
    view.body.setStrokeStyle(2, captured ? 0x4a2c6b : 0x6b4a1c);
  }

  private placeView(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    const { x, y } = this.tileToWorld(unit.pos);
    view.container.setPosition(x, y);
  }

  private refreshHp(): void {
    for (const unit of this.battle.units) {
      const view = this.views.get(unit.id);
      if (!view) continue;
      view.hp.setText(`${unit.hp}/${unit.maxHp}`);
      view.container.setAlpha(unit.alive ? 1 : 0.25);
    }
  }

  private refreshHud(): void {
    const order = [...this.battle.units]
      .filter((u) => u.alive)
      .sort((a, b) => b.ct - a.ct)
      .map((u) => `${u.side === "player" ? "●" : "○"} ${u.name}  CT ${Math.round(u.ct)}`)
      .join("\n");
    this.orderText.setText(`CT order\n${order}`);
    this.refreshHp();
  }

  private refreshCampText(): void {
    this.campText.setText(
      `Gold ${this.camp.gold}   Morale ${moraleTier(this.camp.morale)} (${this.camp.morale})   Banked heal ${this.camp.pendingHeal}    |    ` +
        `Storage ${slotsUsed(this.inventory)}/${this.inventory.storageCap}   Trap Kits ${countOf(this.inventory, "trap-kit")}`,
    );
  }

  private setHint(text: string): void {
    this.lastHint = text;
    this.hintText.setText(text);
  }

  private showTransientHint(text: string): void {
    this.hintText.setText(text);
  }

  private restoreHint(): void {
    this.hintText.setText(this.lastHint);
  }

  private highlightTile(coord: GridCoord | null): void {
    this.highlight.clear();
    if (!coord) return;
    const { x, y } = this.tileToWorld(coord);
    const halfW = TILE_WIDTH / 2;
    const halfH = TILE_HEIGHT / 2;
    this.highlight.lineStyle(3, 0x7fe0a0, 1);
    this.highlight.beginPath();
    this.highlight.moveTo(x, y - halfH);
    this.highlight.lineTo(x + halfW, y);
    this.highlight.lineTo(x, y + halfH);
    this.highlight.lineTo(x - halfW, y);
    this.highlight.closePath();
    this.highlight.strokePath();
  }

  // --- Buttons ---------------------------------------------------------------

  private makeTextButton(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    fill: number,
    stroke: number,
    onClick: () => void,
    description?: string,
  ): TextButton {
    const bg = this.add
      .rectangle(x, y, w, h, fill)
      .setStrokeStyle(2, stroke)
      .setInteractive({ useHandCursor: true })
      .setDepth(12);
    const label = this.add
      .text(x, y, text, { color: "#eafff0", fontSize: "14px" })
      .setOrigin(0.5)
      .setDepth(13);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      bg.setFillStyle(Phaser.Display.Color.IntegerToColor(fill).brighten(18).color);
      if (description) this.showTransientHint(description);
    });
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      bg.setFillStyle(fill);
      if (description) this.restoreHint();
    });
    return { bg, label };
  }

  private setPrimary(text: string, visible = true): void {
    this.primary.label.setText(text);
    this.primary.bg.setVisible(visible);
    this.primary.label.setVisible(visible);
  }

  private clearActionButtons(): void {
    for (const obj of this.actionButtons) obj.destroy();
    this.actionButtons = [];
  }

  /** Lay out a row of action buttons centred in the bottom band. */
  private layoutActionRow(
    specs: { text: string; description?: string; onClick: () => void }[],
  ): void {
    this.clearActionButtons();
    const y = this.scale.height - 66;
    const gap = 165;
    const startX = this.scale.width / 2 - ((specs.length - 1) * gap) / 2;
    specs.forEach((spec, i) => {
      const btn = this.makeTextButton(
        startX + i * gap,
        y,
        155,
        30,
        spec.text,
        0x394063,
        0x6f7bb0,
        spec.onClick,
        spec.description,
      );
      this.actionButtons.push(btn.bg, btn.label);
    });
  }

  // --- Phase: Camp (Meta) ----------------------------------------------------

  private enterCampPhase(): void {
    this.titleText.setText("Camp — Meta phase (provision under your storage cap)");
    this.setHint("Trade for storage, cook for the party, and load trap kits. Then deploy.");
    const metaSkills = this.phaseSkills.forPhase("meta");
    this.layoutActionRow([
      ...metaSkills.map(({ unit, skill }) => ({
        text: `${unit.name}: ${skill.name}`,
        description: `${skill.name} — ${skill.description}`,
        onClick: () => this.useCampSkill(skill),
      })),
      {
        text: "Load Trap Kit",
        description: "Provision a Trap Kit into storage (1 slot) for the Survivalist.",
        onClick: () => this.provisionTrapKit(),
      },
    ]);
    this.setPrimary("Proceed to Deployment");
  }

  private useCampSkill(skill: SkillDef): void {
    const out = applyCampSkill(skill, this.camp);
    // The Merchant's storage upgrade is the master logistics cap — sync it.
    if (out.storage) this.inventory.storageCap = this.camp.storageCap;
    this.refreshCampText();
    const parts: string[] = [];
    if (out.gold) parts.push(`+${out.gold} gold`);
    if (out.storage) parts.push(`+${out.storage} storage`);
    if (out.morale) parts.push(`+${out.morale} morale`);
    if (out.bankedHeal) parts.push(`banked +${out.bankedHeal} HP/unit`);
    this.setHint(`${skill.name}: ${parts.join(", ")}.`);
  }

  private provisionTrapKit(): void {
    if (addItem(this.inventory, "trap-kit", 1)) {
      this.refreshCampText();
      this.setHint(`Loaded a Trap Kit (${countOf(this.inventory, "trap-kit")} carried).`);
    } else {
      this.setHint("Storage full — Trade for more slots first.");
    }
  }

  // --- Phase: Deployment -----------------------------------------------------

  private enterDeployPhase(): void {
    // Pull the trap's damage from the Survivalist's data so it stays data-driven.
    const trapSkill = this.phaseSkills
      .forPhase("deployment")
      .find((h) => h.skill.effect.kind === "placeTrap");
    if (trapSkill && trapSkill.skill.effect.kind === "placeTrap") {
      this.trapDamage = trapSkill.skill.effect.damage;
    }
    // Deployment plays on the board: select a unit, walk it out (A*), and place
    // traps where it stands. The first player unit is active to start.
    this.selectDeployActor(this.battle.units.find((u) => u.side === "player") ?? null);
    this.setPrimary("Start Battle");
  }

  /** A unit's deployment exposure meter (created on first use). */
  private exposureOf(unit: Unit): DeployExposure {
    let st = this.deployExposures.get(unit.id);
    if (!st) {
      st = createExposure();
      this.deployExposures.set(unit.id, st);
    }
    return st;
  }

  /** Make a player unit the active deployer: highlight it, draw its safe zone. */
  private selectDeployActor(unit: Unit | null): void {
    this.deployActor = unit;
    this.highlightTile(unit ? unit.pos : null);
    this.drawSafeZone(unit);
    this.refreshDeployButtons();
    this.refreshDeployStatus();
    if (unit) {
      this.setHint(
        `${unit.name}: click a tile to move (deeper = riskier), place a trap where you stand, or pick another unit.`,
      );
    }
  }

  private refreshDeployButtons(): void {
    const actor = this.deployActor;
    const specs: { text: string; description?: string; onClick: () => void }[] = [];
    if (actor && !actor.captured) {
      const isTrapper = unitSkills(actor, "deployment").some(
        (s) => s.effect.kind === "placeTrap",
      );
      if (isTrapper) {
        specs.push({
          text: "Place Trap Here",
          description: "Drop a trap on this tile (1 kit). Deeper tiles raise capture risk.",
          onClick: () => this.placeTrapAtActor(),
        });
      }
    }
    // Let the player cycle which unit is deploying.
    const players = this.battle.units.filter((u) => u.side === "player" && !u.captured);
    if (players.length > 1) {
      specs.push({
        text: "Next Unit",
        description: "Switch to another unit to deploy.",
        onClick: () => this.cycleDeployActor(),
      });
    }
    this.layoutActionRow(specs);
  }

  private cycleDeployActor(): void {
    if (this.busy) return;
    const players = this.battle.units.filter((u) => u.side === "player" && !u.captured);
    if (players.length === 0) return;
    const i = this.deployActor ? players.indexOf(this.deployActor) : -1;
    this.selectDeployActor(players[(i + 1) % players.length]);
  }

  /** The depth (tiles from the party's home edge, col 0) of a tile. */
  private depthOf(tile: GridCoord): number {
    return tile.col;
  }

  /** Title line showing the active deployer's spatial exposure gamble. */
  private refreshDeployStatus(): void {
    const actor = this.deployActor;
    if (!actor) {
      this.titleText.setText("Deployment");
      return;
    }
    const st = this.exposureOf(actor);
    const pct = Math.round(exposureRisk(st) * 100);
    const here = Math.round((placementCost(actor, this.depthOf(actor.pos)) / 100) * 100);
    const kits = countOf(this.inventory, "trap-kit");
    const tag = actor.captured
      ? " — CAPTURED"
      : `, safe to depth ${safeDepth(actor)} (place here +${here}%)`;
    this.titleText.setText(
      `Deployment — ${actor.name} exposure ${pct}%${tag} · Trap Kits ${kits}`,
    );
  }

  /** Faintly tint the active unit's zero-risk depth columns. */
  private drawSafeZone(unit: Unit | null): void {
    if (!this.safeZoneGfx) this.safeZoneGfx = this.add.graphics().setDepth(0.4);
    this.safeZoneGfx.clear();
    if (!unit) return;
    const maxCol = safeDepth(unit);
    for (let row = 0; row < BattleScene.ROWS; row++) {
      for (let col = 0; col <= maxCol && col < BattleScene.COLS; col++) {
        if (!this.grid.isWalkable({ col, row })) continue;
        const { x, y } = this.tileToWorld({ col, row });
        const halfW = TILE_WIDTH / 2;
        const halfH = TILE_HEIGHT / 2;
        this.safeZoneGfx.fillStyle(0x2f6b46, 0.28);
        this.safeZoneGfx.beginPath();
        this.safeZoneGfx.moveTo(x, y - halfH);
        this.safeZoneGfx.lineTo(x + halfW, y);
        this.safeZoneGfx.lineTo(x, y + halfH);
        this.safeZoneGfx.lineTo(x - halfW, y);
        this.safeZoneGfx.closePath();
        this.safeZoneGfx.fillPath();
      }
    }
  }

  /** Move the active deployer toward a clicked tile (A*, capped at moveRange). */
  private deployMove(tile: GridCoord): void {
    const actor = this.deployActor;
    if (!actor || actor.captured || this.busy) return;
    const nav = occupiedGrid(this.grid, this.battle.units, [actor]);
    const path = findPath(nav, actor.pos, tile);
    if (!path || path.length < 2) {
      this.setHint("Can't move there.");
      return;
    }
    const steps = path.slice(1).slice(0, actor.moveRange);
    const dest = steps[steps.length - 1];
    actor.pos = { ...dest };
    this.busy = true;
    this.animateMove(actor, steps, () => {
      this.busy = false;
      this.highlightTile(actor.pos);
      this.refreshDeployStatus();
      this.refreshDeployButtons();
    });
  }

  private placeTrapAtActor(): void {
    if (this.busy) return;
    this.placeTrap();
  }

  /** Place a trap on the active deployer's current tile (the risky commit). */
  private placeTrap(): void {
    const actor = this.deployActor;
    if (!actor || actor.captured) return;
    if (countOf(this.inventory, "trap-kit") <= 0) {
      this.setHint("No trap kits carried — go back and load some in camp.");
      return;
    }
    const tile = actor.pos;
    if (this.placedTraps.some((t) => t.pos.col === tile.col && t.pos.row === tile.row)) {
      this.setHint("There's already a trap here — move first.");
      return;
    }

    // Provisioning constraint: spend a carried trap kit (D6).
    removeItem(this.inventory, "trap-kit", 1);
    const { x, y } = this.tileToWorld(tile);
    const marker = this.add
      .text(x, y - TILE_HEIGHT / 2, "✸", { color: "#ff9d5c", fontSize: "20px" })
      .setOrigin(0.5)
      .setDepth(0.8);
    this.placedTraps.push({ pos: { ...tile }, damage: this.trapDamage, marker, sprung: false });
    this.refreshCampText();

    // The push-your-luck gamble: a placement this deep may tip into capture.
    const st = this.exposureOf(actor);
    const result = recordPlacement(st, actor, this.depthOf(tile));
    this.refreshDeployStatus();
    if (result.captured) {
      this.captureDuringDeploy(actor);
    } else {
      const pct = Math.round(exposureRisk(st) * 100);
      this.refreshDeployButtons();
      this.setHint(
        result.exposureAdded > 0
          ? `Trap placed deep — exposure now ${pct}%. Press your luck or Start Battle.`
          : "Trap placed safely (within your safe depth). Range deeper or Start Battle.",
      );
    }
  }

  /** A unit was captured mid-deployment: bind it in the enemy safe zone. */
  private captureDuringDeploy(unit: Unit): void {
    unit.pos = { ...BattleScene.CAPTURE_TILE };
    this.placeView(unit);
    this.tintCaptured(unit, true);
    this.highlightTile(null);
    // Hand control to another free unit if there is one.
    const next = this.battle.units.find(
      (u) => u.side === "player" && !u.captured && u !== unit,
    );
    this.selectDeployActor(next ?? null);
    this.setHint(
      `${unit.name} ranged too deep and was captured! She starts the battle bound in the enemy zone (dropped from your initiative seed) — rescue her, or win to bring her home.`,
    );
  }

  // --- Phase: Battle ---------------------------------------------------------

  private startBattlePhase(): void {
    this.titleText.setText("Battle");
    this.clearActionButtons();
    this.deployActor = null;
    this.safeZoneGfx?.clear();
    this.highlightTile(null);

    // Register the Survivalist's traps as field entities (D4) before the fight.
    this.placedTraps.forEach((t, i) =>
      this.battle.entities.register(makeTrap(`trap-${i}`, t.pos, "player", t.damage)),
    );
    // Watch for traps springing, to give them a visual.
    this.battle.bus.on("unitEnterTile", ({ unit, tile }) => {
      if (unit.side !== "enemy") return;
      const t = this.placedTraps.find(
        (t) => !t.sprung && t.pos.col === tile.col && t.pos.row === tile.row,
      );
      if (t) {
        t.sprung = true;
        t.marker.setText("✺").setColor("#7a8190");
        this.tweens.add({ targets: t.marker, scale: 1.8, duration: 140, yoyo: true });
      }
    });

    // Apply the Chef's banked heal to the party (D8 morale buff lands here).
    const healed = applyCampToParty(this.camp, this.battle.units, this.battle.bus);
    this.refreshCampText();
    if (healed > 0) {
      for (const u of this.battle.units) {
        if (u.side === "player" && u.alive) this.flashHeal(u);
      }
    }

    this.battle.seed();
    this.refreshHud();
    this.setPrimary("Advance Clock");
    const bound = this.battle.units.find((u) => u.captured && u.side === "player");
    const captiveNote = bound
      ? ` ${bound.name} is bound in the enemy zone and dropped from your initiative seed — rescue her (or win to bring her home).`
      : "";
    this.setHint(
      (healed > 0
        ? `Chef's stew restored ${healed} HP across the party.`
        : "Battle begins.") +
        captiveNote +
        " Press Advance Clock.",
    );
  }

  // --- Primary button + phase transitions ------------------------------------

  private onPrimary(): void {
    const phase = this.pipeline.current();
    if (phase === "meta") {
      this.pipeline.advance(); // → deployment
      this.enterDeployPhase();
    } else if (phase === "deployment") {
      this.pipeline.advance(); // → battle
      this.startBattlePhase();
    } else if (phase === "battle") {
      this.onAdvance();
    }
  }

  // --- Battle loop -----------------------------------------------------------

  private onAdvance(): void {
    if (this.over || this.busy || this.waitingFor) return;
    const actor = this.battle.nextActor();
    if (!actor) {
      this.finish();
      return;
    }
    this.highlightTile(actor.pos);
    this.refreshHud();

    if (actor.side === "enemy") {
      this.runEnemyTurn(actor);
    } else {
      this.waitingFor = actor;
      this.setHint(`${actor.name}'s turn — move, attack, or use a skill.`);
      this.showSkillButtons(actor);
    }
  }

  /** Draw a button per Battle-phase skill the acting unit's job grants. */
  private showSkillButtons(actor: Unit): void {
    const skills = unitSkills(actor, "battle");
    this.layoutActionRow(
      skills.map((skill) => ({
        text: skill.name,
        description: `${skill.name} — ${skill.description}`,
        onClick: () => this.onSkillButton(actor, skill),
      })),
    );
  }

  private onSkillButton(actor: Unit, skill: SkillDef): void {
    if (this.busy || this.waitingFor !== actor) return;
    if (skill.target === "self") {
      this.commitSkill(actor, skill, actor);
      return;
    }
    this.armedSkill = skill;
    this.setHint(`${skill.name}: click a valid target (or click ${actor.name} to cancel).`);
  }

  /** Apply a skill through the core, then animate it and end the turn. */
  private commitSkill(actor: Unit, skill: SkillDef, target: Unit): void {
    this.armedSkill = null;
    this.waitingFor = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    const outcome = this.battle.useSkill(actor, skill, target);
    if (skill.target === "self") this.flashHeal(target);
    else this.flashAttack(actor, target);
    const verb = outcome.healed
      ? `heals ${outcome.healed}`
      : outcome.damage
        ? `hits for ${outcome.damage}`
        : outcome.status
          ? `applies ${outcome.status}`
          : "acts";
    this.afterTurn();
    if (!this.over) this.setHint(`${actor.name} used ${skill.name} — ${verb}. Advance Clock.`);
  }

  private runEnemyTurn(actor: Unit): void {
    this.busy = true;
    this.setHint(`${actor.name} (enemy) acts…`);
    const plan = this.battle.runEnemyTurn(actor);
    this.animateMove(actor, plan.path, () => {
      if (plan.target) this.flashAttack(actor, plan.target);
      this.afterTurn();
    });
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const phase = this.pipeline.current();
    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    if (!this.grid.inBounds(tile)) return;

    if (phase === "deployment") {
      if (this.busy) return;
      const clicked = this.battle.units.find(
        (u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row,
      );
      if (clicked && clicked.side === "player" && !clicked.captured) {
        this.selectDeployActor(clicked); // pick this unit to deploy
      } else if (!clicked) {
        this.deployMove(tile); // walk the active unit out (A*)
      }
      return;
    }
    if (phase !== "battle") return;

    const actor = this.waitingFor;
    if (this.over || this.busy || !actor) return;

    const clicked = this.battle.units.find(
      (u) => u.alive && u.pos.col === tile.col && u.pos.row === tile.row,
    );

    if (this.armedSkill) {
      if (clicked === actor) {
        this.armedSkill = null;
        this.setHint(`${actor.name}'s turn — move, attack, or use a skill.`);
        return;
      }
      if (clicked && isValidSkillTarget(this.armedSkill, actor, clicked)) {
        this.commitSkill(actor, this.armedSkill, clicked);
      } else {
        this.setHint("Not a valid target for that skill.");
      }
      return;
    }

    // A bound ally → rescue (move adjacent + free, D7).
    if (clicked && clicked.captured && clicked.side === actor.side && clicked !== actor) {
      this.playerRescueOrApproach(actor, clicked);
    } else if (clicked && clicked.side !== actor.side && !clicked.captured) {
      this.playerAttackOrApproach(actor, clicked);
    } else if (!clicked && this.grid.isWalkable(tile)) {
      this.playerMove(actor, tile);
    }
  }

  private playerRescueOrApproach(actor: Unit, captive: Unit): void {
    if (isAdjacent(actor.pos, captive.pos)) {
      this.commitRescue(actor, [], captive);
      return;
    }
    const nav = occupiedGrid(this.grid, this.battle.units, [actor, captive]);
    const path = findPath(nav, actor.pos, captive.pos);
    if (!path || path.length < 2) {
      this.setHint("No path to your captured ally.");
      return;
    }
    const approach = path.slice(1, -1).slice(0, actor.moveRange);
    const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
    this.commitRescue(actor, approach, isAdjacent(dest, captive.pos) ? captive : null);
  }

  private commitRescue(actor: Unit, path: GridCoord[], captive: Unit | null): void {
    this.waitingFor = null;
    this.armedSkill = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    if (path.length > 0) this.battle.moveUnit(actor, path);
    let freed = false;
    if (captive && isAdjacent(actor.pos, captive.pos)) {
      freeCaptive(captive); // rejoins the clock cold
      this.tintCaptured(captive, false);
      freed = true;
    }
    this.battle.endTurn(actor, { moved: path.length > 0, acted: freed });
    this.animateMove(actor, path, () => {
      if (freed) this.flashHeal(captive!);
      this.afterTurn();
      if (!this.over && freed) {
        this.setHint(`${actor.name} freed ${captive!.name}! She rejoins the clock. Advance Clock.`);
      } else if (!this.over && !freed) {
        this.setHint("Couldn't reach your ally this turn. Advance Clock.");
      }
    });
  }

  private playerAttackOrApproach(actor: Unit, foe: Unit): void {
    if (isAdjacent(actor.pos, foe.pos)) {
      this.commitPlayer(actor, [], foe);
      return;
    }
    const nav = occupiedGrid(this.grid, this.battle.units, [actor, foe]);
    const path = findPath(nav, actor.pos, foe.pos);
    if (!path || path.length < 2) {
      this.setHint("No path to that foe.");
      return;
    }
    const approach = path.slice(1, -1).slice(0, actor.moveRange);
    const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
    this.commitPlayer(actor, approach, isAdjacent(dest, foe.pos) ? foe : null);
  }

  private playerMove(actor: Unit, tile: GridCoord): void {
    const nav = occupiedGrid(this.grid, this.battle.units, [actor]);
    const path = findPath(nav, actor.pos, tile);
    if (!path || path.length < 2) {
      this.setHint("Can't move there.");
      return;
    }
    this.commitPlayer(actor, path.slice(1).slice(0, actor.moveRange), null);
  }

  /** Apply a player action through the core, then animate it. */
  private commitPlayer(actor: Unit, path: GridCoord[], target: Unit | null): void {
    this.waitingFor = null;
    this.armedSkill = null;
    this.busy = true;
    this.clearActionButtons();
    this.highlightTile(null);
    if (path.length > 0) this.battle.moveUnit(actor, path);
    if (target && target.alive) this.battle.attack(actor, target);
    this.battle.endTurn(actor, { moved: path.length > 0, acted: target !== null });
    this.animateMove(actor, path, () => {
      if (target) this.flashAttack(actor, target);
      this.afterTurn();
    });
  }

  // --- Animation -------------------------------------------------------------

  private animateMove(unit: Unit, path: readonly GridCoord[], done: () => void): void {
    const view = this.views.get(unit.id);
    if (!view || path.length === 0) {
      done();
      return;
    }
    const targets = path.map((c) => this.tileToWorld(c));
    this.tweens.chain({
      targets: view.container,
      tweens: targets.map((p) => ({ x: p.x, y: p.y, duration: 160, ease: "Linear" })),
      onComplete: done,
    });
  }

  private flashAttack(attacker: Unit, target: Unit): void {
    const av = this.views.get(attacker.id);
    const tv = this.views.get(target.id);
    if (av) {
      const home = this.tileToWorld(attacker.pos);
      const toward = this.tileToWorld(target.pos);
      this.tweens.add({
        targets: av.container,
        x: home.x + (toward.x - home.x) * 0.3,
        y: home.y + (toward.y - home.y) * 0.3,
        duration: 90,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }
    if (tv) {
      this.tweens.add({ targets: tv.container, alpha: 0.4, duration: 70, yoyo: true });
    }
  }

  private flashHeal(unit: Unit): void {
    const view = this.views.get(unit.id);
    if (!view) return;
    this.tweens.add({
      targets: view.container,
      scale: 1.25,
      duration: 130,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  /** Common post-turn bookkeeping: refresh HUD, check win/lose, re-arm. */
  private afterTurn(): void {
    this.busy = false;
    this.refreshHud();
    this.highlightTile(null);
    const outcome = this.battle.outcome();
    if (outcome.over) {
      this.finish(outcome.winner);
      return;
    }
    this.setHint("Press Advance Clock for the next turn.");
  }

  private finish(winner?: Side): void {
    if (this.over) return;
    this.over = true;
    this.pipeline.advance(); // battle → resolution
    this.highlightTile(null);
    this.clearActionButtons();
    this.setPrimary("", false);
    const won = winner === "player";
    const title = winner === undefined ? "Draw" : won ? "Victory!" : "Defeat";

    // Resolution — material recovery (D13): a win reclaims unsprung trap kits.
    const { recovered } = recoverMaterials(this.battle.entities.all(), winner, this.inventory);
    this.refreshCampText();

    const lines: string[] = [];
    if (won) {
      // Victory = control of the field: any still-bound allies are freed (D7/D13).
      const freed = this.battle.units.filter((u) => u.captured && u.side === "player");
      for (const u of freed) {
        freeCaptive(u);
        this.tintCaptured(u, false);
        this.flashHeal(u);
      }
      if (freed.length > 0) {
        lines.push(`Auto-rescued ${freed.map((u) => u.name).join(", ")} (won the field).`);
      }
      lines.push(
        recovered.length > 0
          ? `Recovered ${recovered.length} unsprung trap kit(s) to storage.`
          : "No unsprung materials to recover.",
      );
    } else {
      lines.push("Fled the field — no materials recovered.");
    }
    lines.push(`Storage now ${slotsUsed(this.inventory)}/${this.inventory.storageCap}, ${countOf(this.inventory, "trap-kit")} trap kits.`);
    this.setHint(`Resolution — ${lines.join("  ")}`);

    this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, 460, 150, 0x11141b, 0.9)
      .setStrokeStyle(2, won ? 0x57b07a : 0xb05757)
      .setDepth(20);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 44, title, {
        color: won ? "#9ff0bf" : "#f0a0a0",
        fontSize: "30px",
      })
      .setOrigin(0.5)
      .setDepth(21);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 14, lines.join("\n"), {
        color: "#cdd7ee",
        fontSize: "14px",
        align: "center",
        lineSpacing: 4,
      })
      .setOrigin(0.5)
      .setDepth(21);
  }
}
