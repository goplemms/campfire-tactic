import Phaser from "phaser";
import { GuildScene } from "./scenes/GuildScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";
import { DemoScene } from "./scenes/DemoScene";

// Standalone **demo mode** (M12/D44): `#demo` (or the run-bar button) boots
// straight into *The Hollow Mill*, bypassing the guild/overworld. Otherwise the
// guild hall boots first (M9) → dispatches a caravan to the OverworldScene →
// hands combat nodes to the BattleScene → returns to the hall on a terminal.
const isDemo = typeof window !== "undefined" && window.location.hash.slice(1) === "demo";

/** Phaser game configuration for the web build. */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 800,
  height: 600,
  backgroundColor: "#11141b",
  scene: isDemo
    ? [DemoScene, GuildScene, OverworldScene, BattleScene]
    : [GuildScene, OverworldScene, BattleScene, DemoScene],
};
