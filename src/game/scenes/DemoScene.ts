import Phaser from "phaser";
import {
  gridToScreen,
  screenToGrid,
  findPath,
  occupiedGrid,
  manhattan,
  reachableTiles,
  TILE_WIDTH,
  TILE_HEIGHT,
  DemoRunner,
  unlockedSkills,
  isValidSkillTarget,
  inAttackRange,
  effectiveMove,
  isImmobilized,
  computeFlankBonus,
  jobLevelOf,
  canSee,
  statusVisual,
  countOf,
  addItem,
  slotsUsed,
  DEFEND,
  type Unit,
  type GridCoord,
  type SkillDef,
  type StagedEncounter,
  type EncounterResult,
} from "../../core";
import { fitText } from "../ui";

/** A small text button. */
interface TextButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/**
 * Standalone **demo mode** (D44): plays *The Hollow Mill* end to end, bypassing
 * the guild/overworld. It drives a {@link DemoRunner} beat by beat — Provision →
 * (interactive) encounters with the four kits, charge/cooldown/channel readouts,
 * status trackers, Defend, and the bridge-cut timer → a Rest/level-up screen with
 * the deserter choice → graded-failure results. The combat rules all live in
 * `core`; this scene only renders + dispatches.
 */
export class DemoScene extends Phaser.Scene {
  private runner!: DemoRunner;
  private staged?: StagedEncounter;

  private originX = 0;
  private originY = 0;
  private gridGfx?: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  /** Move-range / attack / valid-target preview, painted on the player's turn. */
  private preview!: Phaser.GameObjects.Graphics;
  /** A bobbing chevron over the unit currently taking its turn. */
  private activeMarker!: Phaser.GameObjects.Triangle;
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  /** Self-destroying floating-combat-text objects, tracked so a scene change can sweep them. */
  private floaters = new Set<Phaser.GameObjects.Text>();
  /** Bus unsubscribers for the active encounter (floating combat text). */
  private busUnsubs: (() => void)[] = [];
  private views = new Map<
    string,
    {
      container: Phaser.GameObjects.Container;
      body: Phaser.GameObjects.Arc;
      hp: Phaser.GameObjects.Text;
      badges: Phaser.GameObjects.Text;
      hpBarFill: Phaser.GameObjects.Rectangle;
      hpBarW: number;
    }
  >();

  private titleText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private orderText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private lastHint = "";
  private primary!: TextButton;
  private buttons: Phaser.GameObjects.GameObject[] = [];
  /** Click handlers for the current action-row buttons (number-key hotkeys 1–9). */
  private buttonActions: (() => void)[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];

  // Battle interaction.
  private waitingFor: Unit | null = null;
  private armed: SkillDef | null = null;
  private pendingHerb: string | null = null;
  private busy = false;
  private ended = false;

  constructor() {
    super("DemoScene");
  }

  create(): void {
    this.runner = new DemoRunner();
    this.titleText = this.add.text(this.scale.width / 2, 14, "", { color: "#e8eefc", fontSize: "18px" }).setOrigin(0.5).setDepth(10);
    this.subText = this.add.text(this.scale.width / 2, 38, "", { color: "#cdd7ee", fontSize: "12px" }).setOrigin(0.5).setDepth(10);
    this.orderText = this.add.text(10, 70, "", { color: "#cdd7ee", fontSize: "11px", lineSpacing: 3 }).setDepth(10);
    this.timerText = this.add.text(this.scale.width / 2, 58, "", { color: "#f0b06a", fontSize: "13px" }).setOrigin(0.5).setDepth(10);
    this.hintText = this.add.text(this.scale.width / 2, this.scale.height - 100, "", { color: "#9fb0d0", fontSize: "12px", align: "center", wordWrap: { width: 720 } }).setOrigin(0.5).setDepth(10);
    this.preview = this.add.graphics().setDepth(0.4);
    this.highlight = this.add.graphics().setDepth(0.5);
    // A downward chevron that hovers over the acting unit (the active-unit cue).
    this.activeMarker = this.add
      .triangle(0, 0, -8, -10, 8, -10, 0, 2, 0xffe06a)
      .setStrokeStyle(1.5, 0x7a5a10)
      .setDepth(2)
      .setVisible(false);
    this.primary = this.makeButton(this.scale.width / 2, this.scale.height - 26, 220, 32, "", 0x2f6b46, 0x57b07a, () => this.onPrimary());
    this.add.text(this.scale.width - 10, this.scale.height - 8, "Space / Enter = advance · 1–9 = abilities", { color: "#6b7794", fontSize: "11px" }).setOrigin(1, 1).setDepth(10);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.setupKeyboard();
    this.nextBeat();
  }

  /** Keyboard control (D44 playtest QoL): Space/Enter = primary, 1–9 = actions. */
  private setupKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    // Stop Space/Enter/digits from scrolling or otherwise leaking to the page.
    kb.addCapture("SPACE,ENTER,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE");
    kb.on("keydown", (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        if (this.primary.bg.visible) this.onPrimary();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= this.buttonActions.length) {
        this.buttonActions[n - 1]();
      }
    });
  }

  // --- Beat dispatch ---------------------------------------------------------

  private nextBeat(): void {
    this.clearBoard();
    this.clearButtons();
    this.clearOverlay();
    this.timerText.setText("");
    this.orderText.setText("");
    const beat = this.runner.currentBeat();
    if (!beat || this.runner.outcome) return this.showEnd();
    if (beat.kind === "provision") this.showProvision();
    else if (beat.kind === "rest") this.showRest();
    else this.startEncounter();
  }

  // --- Beat 1: Provision -----------------------------------------------------

  private showProvision(): void {
    const beat = this.runner.currentBeat();
    if (beat?.kind !== "provision") return;
    this.runner.provision([]); // initialize inventory + gold at the cap
    this.titleText.setText("Provision — The Hollow Mill");
    this.subText.setText(beat.intel ?? "");
    this.setHint("Load herbs under the storage cap, then March Out. Salve=+heal · Stimulant=+speed · Antidote=cleanse.");
    this.refreshProvisionButtons();
    this.setPrimary("March Out →");
  }

  private refreshProvisionButtons(): void {
    const beat = this.runner.currentBeat();
    if (beat?.kind !== "provision") return;
    const inv = this.runner.inventory;
    const specs = beat.offer.map((id) => ({
      text: `+ ${id} (have ${countOf(inv, id)})`,
      description: `Load one ${id} (uses storage).`,
      onClick: () => {
        if (addItem(inv, id, 1)) this.refreshProvisionButtons();
        else this.setHint("Storage full — that's the provisioning choice (can't carry everything).");
        this.refreshProvisionStatus();
      },
    }));
    this.layoutButtons(specs);
    this.refreshProvisionStatus();
  }

  private refreshProvisionStatus(): void {
    const inv = this.runner.inventory;
    this.subText.setText(`Storage ${slotsUsed(inv)}/${inv.storageCap}  ·  Gold ${this.runner.gold}`);
  }

  // --- Beat 3: Rest + Level-up + deserter choice -----------------------------

  private showRest(): void {
    this.titleText.setText("Rest in the Grain Loft");
    const before = new Map(this.runner.party.map((u) => [u.id, jobLevelOf(u, u.primaryJob)]));
    // Show the choice first; the level-up applies on the choice.
    this.setHint("The party recovers. A wounded bandit deserter begs for mercy — your call shapes the ambush ahead.");
    const beat = this.runner.currentBeat();
    const choiceMeta = beat?.kind === "rest" ? beat.choice : undefined;
    const apply = (choice: "spare" | "press") => {
      this.runner.rest(choice);
      const lines = this.runner.party.map((u) => {
        const was = before.get(u.id) ?? 1;
        const now = jobLevelOf(u, u.primaryJob);
        const unlocked = unlockedSkills(u, "battle").map((s) => s.name).join(", ");
        return `${u.name}: job L${was}→L${now}  ·  HP ${u.maxHp}  ·  actives: ${unlocked}`;
      });
      this.clearButtons();
      this.showOverlay(
        "Level Up!",
        `${this.runner.log[this.runner.log.length - 1]}\n\n${lines.join("\n")}`,
        true,
        560,
        220,
      );
      this.setPrimary("To the Chokepoint →");
    };
    this.layoutButtons([
      { text: choiceMeta?.spareLabel ?? "Spare", description: "Spare the deserter.", onClick: () => apply("spare") },
      { text: choiceMeta?.pressLabel ?? "Press", description: "Press him for coin.", onClick: () => apply("press") },
    ]);
    this.setPrimary("", false);
  }

  // --- Encounters ------------------------------------------------------------

  private startEncounter(): void {
    const beat = this.runner.currentBeat();
    if (beat?.kind !== "encounter") return;
    this.staged = this.runner.stageEncounter(beat);
    this.staged.battle.seed();
    // Floating combat text rides the same bus the rules already emit on — so
    // damage/heal pop-ups cover every source (attacks, cleave, charged skills).
    this.busUnsubs.push(
      this.battle.bus.on("unitDamaged", ({ unit, amount }) => {
        if (amount > 0) this.floatText(unit, `-${amount}`, "#ff9a9a");
      }),
      this.battle.bus.on("unitHealed", ({ unit, amount }) => {
        if (amount > 0) this.floatText(unit, `+${amount}`, "#9ff0bf");
      }),
    );
    this.ended = false;
    this.busy = false;
    this.waitingFor = null;
    this.armed = null;
    this.pendingHerb = null;
    this.titleText.setText(beat.encounter.name);
    this.subText.setText(`Storage ${slotsUsed(this.runner.inventory)}/${this.runner.inventory.storageCap}  ·  Gold ${this.runner.gold}`);
    this.rebuildBoard();
    this.refreshHud();
    this.setPrimary("Advance Clock");
    this.setHint("Battle: press Advance Clock. Flank isolated foes, tarpit with Edrin, cleanse snares with Sela's antidote.");
  }

  private get battle() {
    return this.staged!.battle;
  }

  private onAdvance(): void {
    if (this.ended || this.busy || this.waitingFor) return;
    if (this.checkEncounterEnd()) return;
    const actor = this.battle.nextActor();
    if (!actor) return this.finishEncounter();
    if (this.checkEncounterEnd()) return; // the clock tick may have cut the bridge
    this.revealScouted();
    this.refreshHud();
    // A hidden ambush body lies in wait — the AI doesn't act on it until the
    // party scouts it into view (D42/D44 fog). It just waits its turn.
    if (actor.hidden) {
      this.battle.endTurn(actor, {});
      this.setHint("Something stirs in ambush ahead… scout it out.");
      return;
    }
    this.highlightTile(actor.pos);
    if (actor.side === "enemy") {
      this.busy = true;
      this.setHint(`${actor.name} (enemy) acts…`);
      const plan = this.battle.runEnemyTurn(actor);
      this.animateMove(actor, plan.path, () => {
        if (plan.target) this.flash(actor, plan.target);
        this.afterTurn();
      });
    } else {
      this.waitingFor = actor;
      this.setHint(`${actor.name}'s turn — click to move/attack, or use a kit ability.`);
      this.showKitButtons(actor);
    }
  }

  private showKitButtons(actor: Unit): void {
    const specs: { text: string; description?: string; onClick: () => void }[] = [];
    for (const skill of unlockedSkills(actor, "battle")) {
      const cooling = !this.battle.canUseSkill(actor, skill);
      const cd = actor.cooldowns[skill.id];
      const charge = skill.cost?.charge ? " (charge)" : "";
      const tag = cooling ? ` [cd ${Math.ceil(cd ?? 0)}]` : charge;
      specs.push({
        text: `${skill.name}${tag}`,
        description: `${skill.name} — ${skill.description}`,
        onClick: () => {
          if (cooling) return this.setHint(`${skill.name} is cooling down.`);
          this.onKitButton(actor, skill);
        },
      });
    }
    specs.push({ text: "Defend", description: DEFEND.description, onClick: () => this.commitSkill(actor, DEFEND, actor) });
    this.layoutButtons(specs);
    this.drawPreview();
  }

  private onKitButton(actor: Unit, skill: SkillDef): void {
    if (this.busy || this.waitingFor !== actor) return;
    if (skill.effect.kind === "med-heal") {
      // Pick a herb, then a target ally.
      const inv = this.runner.inventory;
      const herbs = ["salve", "stimulant", "antidote"].filter((h) => countOf(inv, h) > 0);
      if (herbs.length === 0) return this.setHint("No herbs carried — provision some next run.");
      this.layoutButtons(
        herbs.map((h) => ({
          text: `${h} (${countOf(inv, h)})`,
          description: `Heal with ${h}.`,
          onClick: () => {
            this.pendingHerb = h;
            this.armed = skill;
            this.setHint(`Heal (${h}): click a wounded ally.`);
            this.drawPreview();
          },
        })),
      );
      return;
    }
    if (skill.target === "self") return this.commitSkill(actor, skill, actor);
    this.armed = skill;
    this.setHint(`${skill.name}: click a target (or click ${actor.name} to cancel).`);
    this.drawPreview();
  }

  private commitSkill(actor: Unit, skill: SkillDef, target: Unit): void {
    this.armed = null;
    this.waitingFor = null;
    this.busy = true;
    this.clearButtons();
    this.highlightTile(null);
    let verb = "acts";
    if (skill.effect.kind === "med-heal" && this.pendingHerb) {
      const out = this.battle.useHeal(actor, skill, target, this.pendingHerb, this.runner.inventory);
      this.pendingHerb = null;
      verb = out.cleansed ? `cleanses ${out.cleansed}` : out.healed ? `heals ${out.healed}` : "no herb";
      if (out.cleansed) this.floatText(target, `cleanse ${out.cleansed}`, "#9fe0e0");
      this.flash(actor, target);
    } else if (skill.effect.kind === "cleave") {
      const dir = { col: Math.sign(target.pos.col - actor.pos.col) || 1, row: target.pos.col === actor.pos.col ? Math.sign(target.pos.row - actor.pos.row) : 0 };
      const res = this.battle.cleave(actor, skill, dir);
      verb = `cleaves ${res.hits} foe(s) for ${res.damage}`;
      this.flash(actor, target);
    } else {
      const out = this.battle.useSkill(actor, skill, target);
      verb = out.charging ? "begins charging" : out.damage ? `hits for ${out.damage}` : out.healed ? `heals ${out.healed}` : out.status ? `applies ${out.status}` : "acts";
      this.flash(actor, target);
    }
    this.afterTurn();
    if (!this.ended) this.setHint(`${actor.name} — ${skill.name}: ${verb}. Advance Clock.`);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.staged) return;
    const tile = this.worldToTile(pointer.worldX, pointer.worldY);
    if (!this.battle.grid.inBounds(tile)) return;
    const actor = this.waitingFor;
    if (this.ended || this.busy || !actor) return;
    const clicked = this.battle.units.find((u) => u.alive && !u.hidden && u.pos.col === tile.col && u.pos.row === tile.row);

    if (this.armed) {
      if (clicked === actor) {
        this.armed = null;
        this.pendingHerb = null;
        this.setHint(`${actor.name}'s turn.`);
        this.showKitButtons(actor);
        return;
      }
      if (clicked && isValidSkillTarget(this.armed, actor, clicked)) return this.commitSkill(actor, this.armed, clicked);
      return this.setHint("Not a valid target for that ability.");
    }

    if (clicked && clicked.side !== actor.side) return this.playerAttack(actor, clicked);
    if (!clicked && this.battle.grid.isWalkable(tile)) return this.playerMove(actor, tile);
  }

  private playerAttack(actor: Unit, foe: Unit): void {
    if (inAttackRange(actor, foe)) return this.commitMove(actor, [], foe);
    const nav = occupiedGrid(this.battle.grid, this.battle.units, [actor, foe]);
    const path = findPath(nav, actor.pos, foe.pos);
    if (!path || path.length < 2) return this.setHint("No path to that foe.");
    const approach = path.slice(1, -1).slice(0, effectiveMove(actor));
    const dest = approach.length > 0 ? approach[approach.length - 1] : actor.pos;
    this.commitMove(actor, approach, manhattan(dest, foe.pos) <= actor.attackRange ? foe : null);
  }

  private playerMove(actor: Unit, tile: GridCoord): void {
    const nav = occupiedGrid(this.battle.grid, this.battle.units, [actor]);
    const path = findPath(nav, actor.pos, tile);
    if (!path || path.length < 2) return this.setHint("Can't move there.");
    this.commitMove(actor, path.slice(1).slice(0, effectiveMove(actor)), null);
  }

  private commitMove(actor: Unit, path: GridCoord[], target: Unit | null): void {
    this.armed = null;
    this.waitingFor = null;
    this.busy = true;
    this.clearButtons();
    this.highlightTile(null);
    if (path.length > 0) this.battle.moveUnit(actor, path);
    if (target && target.alive) {
      // Flank is computed from the post-move position, so a "FLANK!" cue fires
      // exactly when the +bonus actually lands.
      const flanked = computeFlankBonus(actor, target, this.battle.units) > 0;
      this.battle.attack(actor, target);
      if (flanked) this.floatText(target, "FLANK!", "#ffd86b", -14);
    }
    this.battle.endTurn(actor, { moved: path.length > 0, acted: target !== null });
    this.animateMove(actor, path, () => {
      if (target) this.flash(actor, target);
      this.afterTurn();
    });
  }

  private afterTurn(): void {
    this.busy = false;
    this.revealScouted();
    this.refreshHud();
    this.highlightTile(null);
    if (this.checkEncounterEnd()) return;
    this.setHint("Press Advance Clock for the next turn.");
  }

  /** Reveal hidden ambush bodies the party can now see (the scouting payoff). */
  private revealScouted(): void {
    if (!this.staged) return;
    for (const u of this.battle.units) {
      if (u.hidden && u.alive && canSee(this.battle.units, "player", u.pos)) {
        u.hidden = false;
        this.setHint(`Ambush revealed — ${u.name} springs from cover!`);
      }
    }
  }

  /** True (and finishes) if the encounter has reached a graded terminal (D43). */
  private checkEncounterEnd(): boolean {
    if (!this.staged || this.ended) return this.ended;
    if (this.staged.objective.failed) {
      this.finishEncounter("objective-failure");
      return true;
    }
    const o = this.battle.outcome();
    if (o.over) {
      this.finishEncounter(o.winner === "player" ? "win" : "wipe");
      return true;
    }
    return false;
  }

  private finishEncounter(forced?: EncounterResult): void {
    if (this.ended) return;
    this.ended = true;
    this.clearButtons();
    this.highlightTile(null);
    const result: EncounterResult =
      forced ?? (this.staged!.objective.failed ? "objective-failure" : this.battle.outcome().winner === "player" ? "win" : "wipe");
    this.runner.resolveEncounter(this.staged!, result);
    const titles: Record<EncounterResult, string> = { win: "Victory", "objective-failure": "Objective Failed — Retreat", wipe: "Party Wiped" };
    const body =
      result === "win"
        ? "The field is yours. Press on."
        : result === "objective-failure"
          ? "The bridge fell and the Captain slipped away — but the party retreats ALIVE (a graded failure, not a wipe)."
          : "Every fighter is down. The run is over.";
    this.showOverlay(titles[result], body, result !== "wipe");
    this.setPrimary(result === "wipe" ? "End" : "Continue →");
  }

  // --- Primary button --------------------------------------------------------

  private onPrimary(): void {
    const beat = this.runner.currentBeat();
    if (this.runner.outcome) {
      this.scene.start("GuildScene");
      return;
    }
    if (!beat) return this.showEnd();
    if (beat.kind === "encounter") {
      if (this.ended) {
        this.runner.advance();
        return this.nextBeat();
      }
      return this.onAdvance();
    }
    // provision / rest: advance the beat.
    this.runner.advance();
    this.nextBeat();
  }

  private showEnd(): void {
    this.clearBoard();
    this.clearButtons();
    const o = this.runner.outcome ?? "complete";
    const title = o === "complete" ? "The Hollow Mill is Cleared!" : o === "failed" ? "Quest Failed — the Party Survives" : "Party Wiped";
    this.titleText.setText("");
    this.showOverlay(title, this.runner.log.slice(-6).join("\n"), o !== "wipe", 620, 240);
    this.runner.outcome = o; // ensure onPrimary routes back to the guild
    this.setPrimary("Back to Guild");
  }

  // --- Board rendering -------------------------------------------------------

  private rebuildBoard(): void {
    this.clearBoard();
    const grid = this.battle.grid;
    this.originX = this.scale.width / 2;
    this.originY = this.scale.height / 2 - (grid.rows * TILE_HEIGHT) / 2 + 10;
    this.drawGrid();
    for (const unit of this.battle.units) this.spawnUnit(unit);
    this.refreshHp();
  }

  private clearBoard(): void {
    for (const u of this.busUnsubs) u();
    this.busUnsubs = [];
    for (const f of this.floaters) f.destroy();
    this.floaters.clear();
    for (const o of this.boardObjects) o.destroy();
    this.boardObjects = [];
    this.views.clear();
    this.gridGfx?.destroy();
    this.gridGfx = undefined;
    this.highlight.clear();
    this.preview.clear();
    this.setActiveMarker(null);
  }

  private drawGrid(): void {
    const g = this.add.graphics();
    this.gridGfx = g;
    const grid = this.battle.grid;
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const { x, y } = this.tileToWorld({ col, row });
        const walkable = grid.isWalkable({ col, row });
        const fill = !walkable ? 0x55304a : (col + row) % 2 === 0 ? 0x2a3550 : 0x222b40;
        this.drawDiamond(g, x, y, fill);
      }
    }
  }

  private drawDiamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, fill: number): void {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.fillStyle(fill, 1);
    g.lineStyle(1, 0x3d4b6e, 1);
    g.beginPath();
    g.moveTo(cx, cy - hh);
    g.lineTo(cx + hw, cy);
    g.lineTo(cx, cy + hh);
    g.lineTo(cx - hw, cy);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private spawnUnit(unit: Unit): void {
    const color = unit.side === "player" ? 0xffcf6b : 0xe06b6b;
    const stroke = unit.side === "player" ? 0x6b4a1c : 0x6b1c1c;
    const body = this.add.circle(0, -TILE_HEIGHT / 2, 11, color).setStrokeStyle(2, stroke);
    const label = this.add.text(0, -TILE_HEIGHT / 2 - 28, unit.name, { color: "#e8eefc", fontSize: "10px" }).setOrigin(0.5);
    const hp = this.add.text(0, -TILE_HEIGHT / 2 - 15, "", { color: "#bfe8c0", fontSize: "10px" }).setOrigin(0.5);
    const badges = this.add.text(0, -TILE_HEIGHT / 2 + 9, "", { color: "#ffe6a0", fontSize: "10px" }).setOrigin(0.5);
    // An at-a-glance HP bar under the token; fill width + tint track the fraction.
    const hpBarW = 24;
    const hpBarY = -TILE_HEIGHT / 2 - 2;
    const hpBarBg = this.add.rectangle(0, hpBarY, hpBarW, 4, 0x101521).setStrokeStyle(1, 0x000000, 0.6);
    const hpBarFill = this.add.rectangle(-hpBarW / 2, hpBarY, hpBarW, 4, 0x57b07a).setOrigin(0, 0.5);
    const container = this.add.container(0, 0, [hpBarBg, hpBarFill, body, label, hp, badges]).setDepth(1);
    this.views.set(unit.id, { container, body, hp, badges, hpBarFill, hpBarW });
    this.boardObjects.push(container);
    this.placeView(unit);
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
      view.hp.setText(`${Math.max(0, unit.hp)}/${unit.maxHp}`);
      // HP bar: width by fraction, tint green→amber→red as it drops.
      const frac = unit.maxHp > 0 ? Math.max(0, unit.hp) / unit.maxHp : 0;
      view.hpBarFill.width = Math.max(0, view.hpBarW * frac);
      view.hpBarFill.setFillStyle(frac > 0.5 ? 0x57b07a : frac > 0.25 ? 0xd8b24a : 0xc8504a);
      view.hpBarFill.setVisible(unit.alive);
      // Status trackers (D41): one glyph per active status, tinted by the registry.
      const badges = unit.statuses.map((s) => statusVisual(s.id).glyph).join("");
      view.badges.setText(badges);
      if (unit.statuses.length > 0) view.badges.setColor(`#${statusVisual(unit.statuses[0].id).tint.toString(16).padStart(6, "0")}`);
      view.container.setAlpha(!unit.alive ? 0.2 : unit.hidden ? 0.35 : 1);
    }
  }

  private refreshHud(): void {
    const order = [...this.battle.units]
      .filter((u) => u.alive && !u.captured && !u.hidden)
      .sort((a, b) => b.ct - a.ct)
      .map((u) => `${u.side === "player" ? "●" : "○"} ${u.name} CT${Math.round(u.ct)}${this.battle.clock.isCharging(u) ? " ⏳" : ""}`)
      .join("\n");
    this.orderText.setText(`CT order\n${order}`);
    this.refreshHp();
    // The bridge-cut timer (D43): a visible race readout.
    const prog = this.battle.clock.scheduledProgress(`objective:${this.staged?.encounter.id}:bridge-cut`);
    if (prog !== undefined) {
      const pct = Math.round(prog * 100);
      this.timerText.setText(`⚠ BRIDGE CUT ${pct}% — kill or Immobilize the Sapper!`);
    } else if (this.staged?.encounter.objective && !this.staged.objective.failed) {
      this.timerText.setText("Bridge secured — the Sapper is down.");
    }
  }

  // --- Geometry --------------------------------------------------------------

  private tileToWorld(coord: GridCoord): { x: number; y: number } {
    const { x, y } = gridToScreen(coord);
    return { x: this.originX + x, y: this.originY + y };
  }

  private worldToTile(px: number, py: number): GridCoord {
    const frac = screenToGrid({ x: px - this.originX, y: py - this.originY });
    return { col: Math.round(frac.col), row: Math.round(frac.row) };
  }

  private highlightTile(coord: GridCoord | null): void {
    this.highlight.clear();
    this.setActiveMarker(coord);
    if (!coord) {
      this.preview.clear();
      return;
    }
    const { x, y } = this.tileToWorld(coord);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    this.highlight.lineStyle(3, 0x7fe0a0, 1);
    this.highlight.beginPath();
    this.highlight.moveTo(x, y - hh);
    this.highlight.lineTo(x + hw, y);
    this.highlight.lineTo(x, y + hh);
    this.highlight.lineTo(x - hw, y);
    this.highlight.closePath();
    this.highlight.strokePath();
  }

  /** Hover the bobbing active-unit chevron over a tile (or hide it on null). */
  private setActiveMarker(coord: GridCoord | null): void {
    this.tweens.killTweensOf(this.activeMarker);
    if (!coord) return void this.activeMarker.setVisible(false);
    const { x, y } = this.tileToWorld(coord);
    const baseY = y - TILE_HEIGHT / 2 - 36;
    this.activeMarker.setPosition(x, baseY).setVisible(true);
    this.tweens.add({ targets: this.activeMarker, y: baseY - 6, duration: 480, yoyo: true, repeat: -1, ease: "Sine.InOut" });
  }

  /**
   * Paint the player's options on their turn (the "don't click blind" preview):
   * with an ability armed, tint its **valid targets**; otherwise tint the
   * **reachable** move tiles and outline the **foes in reach** this turn.
   */
  private drawPreview(): void {
    this.preview.clear();
    const actor = this.waitingFor;
    if (!actor || this.busy || this.ended) return;
    const g = this.preview;
    if (this.armed) {
      for (const u of this.battle.units) {
        if (!u.alive || u.hidden || !isValidSkillTarget(this.armed, actor, u)) continue;
        const ally = u.side === actor.side;
        this.fillTile(g, u.pos, ally ? 0x57b07a : 0xc85a5a, 0.22, ally ? 0x8fe0b0 : 0xe89090);
      }
      return;
    }
    const budget = isImmobilized(actor) ? 0 : effectiveMove(actor);
    const reach = reachableTiles(actor, this.battle.units, this.battle.grid, budget);
    for (const r of reach) {
      if (r.tile.col === actor.pos.col && r.tile.row === actor.pos.row) continue;
      this.fillTile(g, r.tile, 0x3a7bd5, 0.18);
    }
    for (const foe of this.battle.units) {
      if (!foe.alive || foe.hidden || foe.side === actor.side) continue;
      if (reach.some((r) => manhattan(r.tile, foe.pos) <= actor.attackRange)) {
        this.outlineTile(g, foe.pos, 0xe07b7b);
      }
    }
  }

  private fillTile(g: Phaser.GameObjects.Graphics, coord: GridCoord, fill: number, alpha: number, line?: number): void {
    const { x, y } = this.tileToWorld(coord);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.fillStyle(fill, alpha);
    g.beginPath();
    g.moveTo(x, y - hh);
    g.lineTo(x + hw, y);
    g.lineTo(x, y + hh);
    g.lineTo(x - hw, y);
    g.closePath();
    g.fillPath();
    if (line !== undefined) {
      g.lineStyle(2, line, 0.9);
      g.strokePath();
    }
  }

  private outlineTile(g: Phaser.GameObjects.Graphics, coord: GridCoord, color: number): void {
    const { x, y } = this.tileToWorld(coord);
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;
    g.lineStyle(2.5, color, 0.95);
    g.beginPath();
    g.moveTo(x, y - hh);
    g.lineTo(x + hw, y);
    g.lineTo(x, y + hh);
    g.lineTo(x - hw, y);
    g.closePath();
    g.strokePath();
  }

  /** A short-lived combat-text pop-up that drifts up off a unit and fades. */
  private floatText(unit: Unit, text: string, color: string, dy = 0): void {
    if (!this.views.has(unit.id)) return;
    const { x, y } = this.tileToWorld(unit.pos);
    const t = this.add
      .text(x, y - TILE_HEIGHT / 2 - 18 + dy, text, { color, fontSize: "13px", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(30);
    this.floaters.add(t);
    this.tweens.add({
      targets: t,
      y: t.y - 26,
      alpha: 0,
      duration: 760,
      ease: "Cubic.Out",
      onComplete: () => {
        this.floaters.delete(t);
        t.destroy();
      },
    });
  }

  // --- Animation -------------------------------------------------------------

  private animateMove(unit: Unit, path: readonly GridCoord[], done: () => void): void {
    const view = this.views.get(unit.id);
    if (!view || path.length === 0) {
      this.placeView(unit);
      return done();
    }
    const targets = path.map((c) => this.tileToWorld(c));
    this.tweens.chain({ targets: view.container, tweens: targets.map((p) => ({ x: p.x, y: p.y, duration: 130, ease: "Linear" })), onComplete: done });
  }

  private flash(attacker: Unit, target: Unit): void {
    const av = this.views.get(attacker.id);
    const tv = this.views.get(target.id);
    if (av && attacker !== target) {
      const home = this.tileToWorld(attacker.pos);
      const toward = this.tileToWorld(target.pos);
      this.tweens.add({ targets: av.container, x: home.x + (toward.x - home.x) * 0.3, y: home.y + (toward.y - home.y) * 0.3, duration: 90, yoyo: true });
    }
    if (tv) this.tweens.add({ targets: tv.container, alpha: 0.4, duration: 70, yoyo: true, onComplete: () => this.refreshHp() });
  }

  // --- UI primitives ---------------------------------------------------------

  private makeButton(x: number, y: number, w: number, h: number, text: string, fill: number, stroke: number, onClick: () => void, description?: string): TextButton {
    const bg = this.add.rectangle(x, y, w, h, fill).setStrokeStyle(2, stroke).setInteractive({ useHandCursor: true }).setDepth(12);
    const label = this.add.text(x, y, text, { color: "#eafff0", fontSize: "12px" }).setOrigin(0.5).setDepth(13);
    fitText(label, w - 10);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      bg.setFillStyle(Phaser.Display.Color.IntegerToColor(fill).brighten(18).color);
      if (description) this.hintText.setText(description);
    });
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      bg.setFillStyle(fill);
      if (description) this.hintText.setText(this.lastHint);
    });
    return { bg, label };
  }

  private setPrimary(text: string, visible = true): void {
    this.primary.label.setText(text);
    fitText(this.primary.label, this.primary.bg.width - 10);
    this.primary.bg.setVisible(visible);
    this.primary.label.setVisible(visible);
  }

  private clearButtons(): void {
    for (const o of this.buttons) o.destroy();
    this.buttons = [];
    this.buttonActions = [];
  }

  private layoutButtons(specs: { text: string; description?: string; onClick: () => void }[]): void {
    this.clearButtons();
    if (specs.length === 0) return;
    const y = this.scale.height - 64;
    const gap = Math.min(160, 760 / specs.length);
    const startX = this.scale.width / 2 - ((specs.length - 1) * gap) / 2;
    specs.forEach((spec, i) => {
      // The number-key hotkey (1–9) is shown on the label and recorded for keys.
      const label = i < 9 ? `${i + 1}. ${spec.text}` : spec.text;
      const btn = this.makeButton(startX + i * gap, y, gap - 10, 28, label, 0x394063, 0x6f7bb0, spec.onClick, spec.description);
      this.buttons.push(btn.bg, btn.label);
      this.buttonActions.push(spec.onClick);
    });
  }

  private setHint(text: string): void {
    this.lastHint = text;
    this.hintText.setText(text);
  }

  private clearOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }

  private showOverlay(title: string, body: string, good: boolean, w = 480, h = 180): void {
    this.clearOverlay();
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    this.overlay.push(
      this.add.rectangle(cx, cy, w, h, 0x11141b, 0.94).setStrokeStyle(2, good ? 0x57b07a : 0xb05757).setDepth(20),
      this.add.text(cx, cy - h / 2 + 26, title, { color: good ? "#9ff0bf" : "#f0a0a0", fontSize: "22px" }).setOrigin(0.5).setDepth(21),
      this.add.text(cx, cy + 12, body, { color: "#cdd7ee", fontSize: "12px", align: "center", lineSpacing: 4, wordWrap: { width: w - 40 } }).setOrigin(0.5).setDepth(21),
    );
  }
}
