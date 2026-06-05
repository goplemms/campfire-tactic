import Phaser from "phaser";
import { gameConfig } from "./game/config";

// Web entry point: boot the Phaser game into #app. This is the only file that
// owns a live engine instance; everything testable lives under `core/`.
new Phaser.Game(gameConfig);
