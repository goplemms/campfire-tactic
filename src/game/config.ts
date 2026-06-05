import Phaser from "phaser";
import { BattleScene } from "./scenes/BattleScene";

/** Phaser game configuration for the web build. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 800,
  height: 600,
  backgroundColor: "#11141b",
  scene: [BattleScene],
};
