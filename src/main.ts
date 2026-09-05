import Phaser from "phaser";
import "./style.css";
import { BattleScene } from "./game/BattleScene";
import { BattleIntroScene } from "./game/map/BattleIntroScene";
import { MapScene } from "./game/map/MapScene";
import { FormationScene } from "./game/scenes/FormationScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/config";
import { initializePlayerLoadoutPanel } from "./game/ui/playerLoadoutPanel";
import { initializeArmySetupPanel } from "./game/ui/armySetupPanel";

initializePlayerLoadoutPanel();
initializeArmySetupPanel();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#a9c978",
  scene: [MapScene, FormationScene, BattleIntroScene, BattleScene],
  render: { antialias: true },
});
