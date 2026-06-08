import Phaser from "phaser";
import { FONT } from "./theme";

const Events = Phaser.Input.Events;

/**
 * A collapsible top-right info card that gives tips and command instructions one
 * consistent home. It stays out of the way as a slim header bar and reveals its
 * body two ways, no setting to manage:
 *
 *   • **hover-peek** — pointing at the card expands it; moving away collapses it
 *     again after a short grace delay. A contextual tip arriving (a button hover)
 *     also peeks it open so the tip is never shown into a collapsed void.
 *   • **click-pin** — clicking the header pins it open (or unpins) so it won't
 *     auto-collapse while you read or play.
 *
 * The body holds the live contextual tip and the static keybindings. It satisfies
 * the buttons' `{ setText }` hint sink, so it drops into the existing Button /
 * ButtonColumn wiring: on-hover passes a tip (peeks open), on-out restores the
 * resting hint (collapses if unpinned).
 */
export class HintPanel extends Phaser.GameObjects.Container {
  private readonly headerBg: Phaser.GameObjects.Rectangle;
  private readonly headerLabel: Phaser.GameObjects.Text;
  private readonly chevron: Phaser.GameObjects.Text;
  private readonly bodyBg: Phaser.GameObjects.Rectangle;
  private readonly tipText: Phaser.GameObjects.Text;
  private readonly keysText: Phaser.GameObjects.Text;

  private static readonly W = 244;
  private static readonly HEADER_H = 24;

  private resting = "";
  private pinned = false;
  private hovered = false;
  private tipActive = false;
  private isOpen = false;
  private collapseTimer?: Phaser.Time.TimerEvent;

  /**
   * @param keys the static command instructions shown in the body (e.g.
   *             "Space / Enter = advance · 1–9 = abilities")
   */
  constructor(scene: Phaser.Scene, keys: string) {
    // Anchor the card's top-left so it hugs the top-right corner with a 10px margin.
    super(scene, scene.scale.width - HintPanel.W - 10, 10);
    const W = HintPanel.W;
    const hH = HintPanel.HEADER_H;

    this.headerBg = scene.add.rectangle(0, 0, W, hH, 0x232b40, 0.96).setStrokeStyle(1, 0x44557e).setOrigin(0, 0);
    this.headerLabel = scene.add.text(8, hH / 2, "Tips & Keys", { color: "#cdd9f2", fontSize: FONT.caption }).setOrigin(0, 0.5);
    this.chevron = scene.add.text(W - 8, hH / 2, "▸", { color: "#8fa0c8", fontSize: FONT.caption }).setOrigin(1, 0.5);
    this.bodyBg = scene.add.rectangle(0, hH, W, 10, 0x161b29, 0.96).setStrokeStyle(1, 0x44557e).setOrigin(0, 0);
    this.tipText = scene.add.text(10, hH + 9, "", { color: "#aebbd6", fontSize: FONT.caption, align: "left", lineSpacing: 3, wordWrap: { width: W - 20 } }).setOrigin(0, 0);
    this.keysText = scene.add.text(10, 0, keys, { color: "#6f7c98", fontSize: FONT.micro, wordWrap: { width: W - 20 } }).setOrigin(0, 0);

    this.add([this.bodyBg, this.tipText, this.keysText, this.headerBg, this.headerLabel, this.chevron]);
    this.setDepth(15);
    scene.add.existing(this);

    // Hover + pin live on both bars so moving header→body doesn't drop the hover.
    for (const r of [this.headerBg, this.bodyBg]) {
      r.setInteractive({ useHandCursor: true });
      r.on(Events.GAMEOBJECT_POINTER_OVER, () => this.onOver());
      r.on(Events.GAMEOBJECT_POINTER_OUT, () => this.onOut());
      r.on(Events.GAMEOBJECT_POINTER_DOWN, () => this.togglePin());
    }
    this.apply(false);
  }

  /** The resting hint (set by the scene's setHint). Shown when no transient tip is up. */
  setResting(text: string): this {
    this.resting = text;
    if (!this.tipActive) this.setTipText(text);
    return this;
  }

  /**
   * The buttons' hint sink. A tip that differs from the resting hint is transient
   * (peek open); restoring the resting text ends the tip (collapse if unpinned).
   */
  setText(text: string): this {
    if (text === this.resting) {
      this.tipActive = false;
      this.setTipText(this.resting);
      this.scheduleCollapse();
    } else {
      this.tipActive = true;
      this.setTipText(text);
      this.expand();
    }
    return this;
  }

  /** Swap the tip text and, if the card is open, re-fit the body to the new height. */
  private setTipText(text: string): void {
    this.tipText.setText(text);
    if (this.isOpen) this.apply(true);
  }

  private onOver(): void {
    this.hovered = true;
    this.expand();
  }

  private onOut(): void {
    this.hovered = false;
    this.scheduleCollapse();
  }

  private togglePin(): void {
    this.pinned = !this.pinned;
    this.headerLabel.setText(this.pinned ? "Tips & Keys · pinned" : "Tips & Keys");
    if (this.pinned) this.expand();
    else this.scheduleCollapse();
  }

  private expand(): void {
    this.collapseTimer?.remove();
    this.collapseTimer = undefined;
    this.apply(true);
  }

  /** Collapse after a grace delay, unless something still wants it open. */
  private scheduleCollapse(): void {
    this.collapseTimer?.remove();
    this.collapseTimer = this.scene.time.delayedCall(320, () => {
      this.collapseTimer = undefined;
      if (!this.pinned && !this.hovered && !this.tipActive) this.apply(false);
    });
  }

  /** Lay out for the open/closed state, sizing the body to its text. */
  private apply(expanded: boolean): void {
    this.isOpen = expanded;
    this.chevron.setText(expanded ? "▾" : "▸");
    const accent = this.pinned ? 0x7f9bd6 : 0x44557e;
    this.headerBg.setStrokeStyle(1, accent);
    for (const o of [this.bodyBg, this.tipText, this.keysText]) o.setVisible(expanded);
    if (!expanded) return;
    // Stack the keys line under the (variable-height) tip, then fit the backing.
    this.keysText.setY(this.tipText.y + this.tipText.height + 7);
    const bodyH = this.keysText.y + this.keysText.height + 8 - HintPanel.HEADER_H;
    this.bodyBg.setSize(HintPanel.W, bodyH);
  }
}
