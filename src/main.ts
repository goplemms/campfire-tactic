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
new Phaser.Game(gameConfig);
