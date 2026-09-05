import { BATTLEFIELD_CONFIG, CAMERA_CONFIG, GAME_HEIGHT } from "../config";

export type CameraViewMode = "COMBAT" | "OVERVIEW";

export function zoomForVisibleWorldRatio(viewportWidth: number, visibleWorldRatio: number): number {
  return viewportWidth / (BATTLEFIELD_CONFIG.width * visibleWorldRatio);
}

export function getCameraZoomLimits(viewportWidth: number, viewportHeight = GAME_HEIGHT): { min: number; max: number; defaultZoom: number } {
  const combatZoom = Math.max(
    viewportHeight / (BATTLEFIELD_CONFIG.height * CAMERA_CONFIG.combatVisibleHeightRatio),
    zoomForVisibleWorldRatio(viewportWidth, CAMERA_CONFIG.maxZoomOutVisibleWidthRatio),
  );
  return {
    min: zoomForVisibleWorldRatio(viewportWidth, CAMERA_CONFIG.maxZoomOutVisibleWidthRatio),
    max: zoomForVisibleWorldRatio(viewportWidth, CAMERA_CONFIG.maxZoomInVisibleWidthRatio),
    defaultZoom: combatZoom,
  };
}

export function getViewModeZoom(mode: CameraViewMode, viewportWidth: number, viewportHeight = GAME_HEIGHT): number {
  const limits = getCameraZoomLimits(viewportWidth, viewportHeight);
  return mode === "COMBAT" ? limits.defaultZoom : limits.min;
}

export function toggleCameraViewMode(mode: CameraViewMode): CameraViewMode {
  return mode === "COMBAT" ? "OVERVIEW" : "COMBAT";
}

export function clampCameraZoom(zoom: number, viewportWidth: number): number {
  const limits = getCameraZoomLimits(viewportWidth);
  return Math.max(limits.min, Math.min(limits.max, zoom));
}

export function visibleWorldWidth(viewportWidth: number, zoom: number): number {
  return viewportWidth / zoom;
}

export function getZoomAnchoredScroll(
  oldScroll: { x: number; y: number },
  oldZoom: number,
  newZoom: number,
  anchor: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const screenX = (anchor.x - oldScroll.x) * oldZoom;
  const screenY = (anchor.y - oldScroll.y) * oldZoom;
  const visibleWidth = viewportWidth / newZoom;
  const visibleHeight = viewportHeight / newZoom;
  const clampAxis = (value: number, maximum: number) => maximum < 0 ? maximum / 2 : Math.max(0, Math.min(maximum, value));
  return {
    x: clampAxis(anchor.x - screenX / newZoom, BATTLEFIELD_CONFIG.width - visibleWidth),
    y: clampAxis(anchor.y - screenY / newZoom, BATTLEFIELD_CONFIG.height - visibleHeight),
  };
}

export function getFollowScroll(
  targetX: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const visibleWidth = viewportWidth / zoom;
  const visibleHeight = viewportHeight / zoom;
  return {
    x: Math.max(0, Math.min(BATTLEFIELD_CONFIG.width - visibleWidth, targetX - visibleWidth / 2)),
    y: (BATTLEFIELD_CONFIG.height - visibleHeight) / 2,
  };
}
