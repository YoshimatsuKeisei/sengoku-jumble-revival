import Phaser from "phaser";

const sourceUrls = import.meta.glob(
  "../../../assets/formation_ui/{save_drawer,soldier_detail}/*.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;

function urlFor(folder: "save_drawer" | "soldier_detail", file: string): string {
  const suffix = `/assets/formation_ui/${folder}/${file}`;
  const match = Object.entries(sourceUrls).find(([path]) => path.replaceAll("\\", "/").endsWith(suffix));
  if (!match) throw new Error(`Missing formation extra UI asset: ${folder}/${file}`);
  return match[1];
}

const FILES = {
  saveDrawerBg: ["save_drawer", "save_drawer_bg.png"],
  formationSaveNormal: ["save_drawer", "formation_save_normal.png"],
  formationSaveActive: ["save_drawer", "formation_save_hover_down.png"],
  slotLabels: ["save_drawer", "slot_labels_ichi_ni_san.png"],
  loadNormal: ["save_drawer", "load_normal.png"],
  loadActive: ["save_drawer", "load_hover_down.png"],
  saveNormal: ["save_drawer", "save_normal.png"],
  saveActive: ["save_drawer", "save_hover_down.png"],
  closeNormal: ["save_drawer", "close_normal.png"],
  closeActive: ["save_drawer", "close_hover_down.png"],
  makeSelfNormal: ["soldier_detail", "make_self_button_bg_normal.png"],
  makeSelfActive: ["soldier_detail", "make_self_button_bg_hover_down.png"],
  makeSelfLabel: ["soldier_detail", "make_self_button_label.png"],
  toFormationNormal: ["soldier_detail", "to_formation_button_bg_normal.png"],
  toFormationActive: ["soldier_detail", "to_formation_button_bg_hover_down.png"],
  toFormationLabel: ["soldier_detail", "to_formation_button_label.png"],
  toListLabel: ["soldier_detail", "to_list_button_label.png"],
  previousNormal: ["soldier_detail", "prev_normal.png"],
  previousActive: ["soldier_detail", "prev_hover_down.png"],
  nextNormal: ["soldier_detail", "next_normal.png"],
  nextActive: ["soldier_detail", "next_hover_down.png"],
} as const satisfies Record<string, readonly ["save_drawer" | "soldier_detail", string]>;

export type FormationExtraAssetId = keyof typeof FILES;

export const FORMATION_EXTRA_ASSETS = Object.freeze(Object.fromEntries(
  Object.entries(FILES).map(([id, [folder, file]]) => [id, {
    key: `formation-extra:${id}`,
    url: urlFor(folder, file),
  }]),
) as Record<FormationExtraAssetId, { key: string; url: string }>);

export function preloadFormationExtraAssets(scene: Phaser.Scene): void {
  for (const asset of Object.values(FORMATION_EXTRA_ASSETS)) {
    if (!scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.url);
  }
}

export function formationExtraImage(
  scene: Phaser.Scene,
  id: FormationExtraAssetId,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, FORMATION_EXTRA_ASSETS[id].key).setOrigin(0);
}
