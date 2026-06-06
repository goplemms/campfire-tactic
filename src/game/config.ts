import Phaser from "phaser";
import { GuildScene } from "./scenes/GuildScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";

/** Phaser game configuration for the web build. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 800,
  height: 600,
  backgroundColor: "#11141b",
  // The guild hall boots first (M9); it dispatches a caravan to the OverworldScene,
  // which hands combat nodes to the BattleScene and returns to the hall on a terminal.
  scene: [GuildScene, OverworldScene, BattleScene],
};
