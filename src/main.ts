import Phaser from "phaser";
import "./style.css";
import { BattleScene } from "./game/BattleScene";
import { BattleIntroScene } from "./game/map/BattleIntroScene";
import { MapScene } from "./game/map/MapScene";
import { FormationScene } from "./game/scenes/FormationScene";
import { PostBattleScene } from "./game/postBattle/PostBattleScene";
import { SWF_STAGE_HEIGHT, SWF_STAGE_WIDTH } from "./game/stageLayout";
import { initializePlayerLoadoutPanel } from "./game/ui/playerLoadoutPanel";
import { initializeArmySetupPanel } from "./game/ui/armySetupPanel";

initializePlayerLoadoutPanel();
initializeArmySetupPanel();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: SWF_STAGE_WIDTH,
  height: SWF_STAGE_HEIGHT,
  backgroundColor: "#a9c978",
  scene: [MapScene, FormationScene, BattleIntroScene, BattleScene, PostBattleScene],
  render: { antialias: true },
});
