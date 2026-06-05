import Phaser from "phaser";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";

/** Phaser game configuration for the web build. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 800,
  height: 600,
  backgroundColor: "#11141b",
  // The overworld boots first; it hands combat nodes to the BattleScene.
  scene: [OverworldScene, BattleScene],
};
