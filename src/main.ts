import Phaser from "phaser";
import { gameConfig } from "./game/config";

// The run-bar "Demo" button (M12/D44): set the #demo hash and reload so the game
// boots straight into the standalone Hollow Mill demo.
const demoBtn = document.getElementById("demobtn") as HTMLButtonElement | null;
if (demoBtn) {
  demoBtn.onclick = () => {
    window.location.hash = "demo";
    window.location.reload();
  };
}

// Web entry point: boot the Phaser game into #app. This is the only file that
// owns a live engine instance; everything testable lives under `core/`.
const game = new Phaser.Game(gameConfig);

// Expose the running game so the screenshot harness (scripts/screenshot.mjs) can
// poll scene state for an animation-idle sync point. Harmless in production — a
// single reference on window.
(window as Window & { game?: Phaser.Game }).game = game;
