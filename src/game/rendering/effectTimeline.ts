import {
  getEffectAtlasRegion,
  getEffectSequence,
  type EffectAtlasRegion,
  type EffectMatrix,
  type EffectSequence,
} from "./effectManifest";

const IDENTITY_MATRIX: EffectMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export interface EffectTimelineSample {
  effectId: string;
  swfFrame: number;
  ended: boolean;
  visible: boolean;
  sequence: EffectSequence;
  region: EffectAtlasRegion | null;
  matrix: EffectMatrix;
}

export interface DecomposedEffectMatrix {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shear: number;
}

export function multiplyEffectMatrices(parent: EffectMatrix, child: EffectMatrix): EffectMatrix {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  };
}

export function decomposeEffectMatrix(matrix: EffectMatrix): DecomposedEffectMatrix {
  const scaleX = Math.hypot(matrix.a, matrix.b);
  if (scaleX <= Number.EPSILON) {
    return { x: matrix.tx, y: matrix.ty, rotation: 0, scaleX: 0, scaleY: Math.hypot(matrix.c, matrix.d), shear: 0 };
  }
  return {
    x: matrix.tx,
    y: matrix.ty,
    rotation: Math.atan2(matrix.b, matrix.a),
    scaleX,
    scaleY: (matrix.a * matrix.d - matrix.b * matrix.c) / scaleX,
    shear: (matrix.a * matrix.c + matrix.b * matrix.d) / (scaleX * scaleX),
  };
}

export function resolveEffectTimeline(effectId: string, elapsedMs: number): EffectTimelineSample | null {
  const sequence = getEffectSequence(effectId);
  if (!sequence) return null;
  const rawFrame = Math.floor(Math.max(0, elapsedMs) * sequence.fps / 1000) + 1;
  const ended = !sequence.loop && rawFrame > sequence.total_swf_frames;
  const swfFrame = sequence.loop
    ? ((rawFrame - 1) % sequence.total_swf_frames) + 1
    : Math.min(rawFrame, sequence.total_swf_frames);
  const row = sequence.timeline_playback.find((candidate) => candidate.swf_frame === swfFrame);
  const selector = sequence.selector_placement_matrix ?? IDENTITY_MATRIX;
  const matrix = multiplyEffectMatrices(selector, row?.matrix ?? IDENTITY_MATRIX);
  if (ended || !row || row.output_frame_index === null || row.bitmap_id === null) {
    return { effectId, swfFrame, ended, visible: false, sequence, region: null, matrix };
  }
  const frame = sequence.frames.find((candidate) => candidate.index === row.output_frame_index);
  const region = frame ? getEffectAtlasRegion(frame.bitmap_id) : null;
  return { effectId, swfFrame, ended, visible: region !== null, sequence, region, matrix };
}

export function hasEffectReachedArrival(elapsedMs: number, travelDurationMs: number): boolean {
  return travelDurationMs > 0 && elapsedMs >= travelDurationMs;
}
