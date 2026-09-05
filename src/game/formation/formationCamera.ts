import formationRulesJson from "../../../assets/formation_ui/config/formation_rules.json";
import formationSceneJson from "../../../assets/formation_ui/config/formation_scene.json";

export type FormationCameraMode = "normal" | "overview";

export interface FormationCameraState {
  mode: FormationCameraMode;
  centerX: number;
  centerY: number;
  scale: number;
}

interface FormationSceneConfig {
  scene: {
    runtime_normal_camera: { scale: number; center_world: { x: number; y: number } };
    runtime_overview_camera: { scale: number; center_world: { x: number; y: number } };
  };
}

interface FormationRules {
  normal_camera_pan: {
    center_x_min: number;
    center_x_max: number;
    center_y_min: number;
    center_y_max: number;
    speed_world_per_tick: number;
    edge_bands_stage: { left: number; right: number; top: number; bottom: number };
  };
}

const sceneConfig = formationSceneJson as unknown as FormationSceneConfig;
const rules = formationRulesJson as unknown as FormationRules;
export const FORMATION_STAGE_CENTER = 190;
export const FORMATION_TOOLBAR_Y = 337;

export function createFormationCameraState(mode: FormationCameraMode = "normal"): FormationCameraState {
  const camera = mode === "normal"
    ? sceneConfig.scene.runtime_normal_camera
    : sceneConfig.scene.runtime_overview_camera;
  return {
    mode,
    centerX: camera.center_world.x,
    centerY: camera.center_world.y,
    scale: camera.scale,
  };
}

export function formationWorldToStage(
  worldX: number,
  worldY: number,
  camera: FormationCameraState,
): { x: number; y: number } {
  return {
    x: (worldX - camera.centerX) * camera.scale + FORMATION_STAGE_CENTER,
    y: (worldY - camera.centerY) * camera.scale + FORMATION_STAGE_CENTER,
  };
}

export function formationStageToWorld(
  stageX: number,
  stageY: number,
  camera: FormationCameraState,
): { x: number; y: number } {
  return {
    x: (stageX - FORMATION_STAGE_CENTER) / camera.scale + camera.centerX,
    y: (stageY - FORMATION_STAGE_CENTER) / camera.scale + camera.centerY,
  };
}

export function clampFormationCamera(camera: FormationCameraState): FormationCameraState {
  if (camera.mode === "overview") return createFormationCameraState("overview");
  const pan = rules.normal_camera_pan;
  return {
    ...camera,
    centerX: Math.max(pan.center_x_min, Math.min(camera.centerX, pan.center_x_max)),
    centerY: Math.max(pan.center_y_min, Math.min(camera.centerY, pan.center_y_max)),
  };
}

export function toggleFormationCamera(camera: FormationCameraState): FormationCameraState {
  return createFormationCameraState(camera.mode === "normal" ? "overview" : "normal");
}

export function panFormationCameraAtPointer(
  camera: FormationCameraState,
  stageX: number,
  stageY: number,
): FormationCameraState {
  if (camera.mode !== "normal") return camera;
  const pan = rules.normal_camera_pan;
  let centerX = camera.centerX;
  let centerY = camera.centerY;
  if (stageX < pan.edge_bands_stage.left) centerX -= pan.speed_world_per_tick;
  else if (stageX > pan.edge_bands_stage.right) centerX += pan.speed_world_per_tick;
  if (stageY < pan.edge_bands_stage.top) centerY -= pan.speed_world_per_tick;
  else if (stageY > pan.edge_bands_stage.bottom && stageY < FORMATION_TOOLBAR_Y) centerY += pan.speed_world_per_tick;
  return clampFormationCamera({ ...camera, centerX, centerY });
}
