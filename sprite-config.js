(function () {
  "use strict";

  const directions = [
    { id: "south", label: "正面", dx: 0, dy: 1 },
    { id: "southeast", label: "右手前", dx: 1, dy: 1 },
    { id: "east", label: "右", dx: 1, dy: 0 },
    { id: "northeast", label: "右奥", dx: 1, dy: -1 },
    { id: "north", label: "真後ろ", dx: 0, dy: -1 },
    { id: "northwest", label: "左奥", dx: -1, dy: -1 },
    { id: "west", label: "左", dx: -1, dy: 0 },
    { id: "southwest", label: "左手前", dx: -1, dy: 1 }
  ].map(Object.freeze);

  window.SPRITE_CONFIG = Object.freeze({
    basePath: "assets/characters",
    defaultUnit: "teppou",
    defaultDirection: "east",
    defaultAssetSet: "accepted",
    assetSets: Object.freeze({ accepted: "accepted", candidate: "candidate" }),
    directions: Object.freeze(directions),
    frames: Object.freeze(["walk_01", "walk_02", "kneel_left_01"]),
    modes: Object.freeze([
      Object.freeze({ id: "walk", label: "walk loop", frames: Object.freeze(["walk_01", "walk_02"]) }),
      Object.freeze({ id: "stand-kneel", label: "stand-kneel test", frames: Object.freeze(["walk_02", "kneel_left_01"]) }),
      Object.freeze({ id: "custom", label: "custom 2-frame test", frames: Object.freeze([]) })
    ])
  });
}());
