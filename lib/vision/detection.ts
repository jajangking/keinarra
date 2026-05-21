import type { DetectedObject, DebugLogEntry } from "./types";
import type { CustomColorRange } from "./color";
import { findContours } from "./image-processing";

const W = 640;
const H = 480;
const TOTAL = W * H;

const COLOR_RANGES: Record<string, [number, number, number, number, number, number]> = {
  red:    [0, 15, 50, 100, 50, 100],
  green:  [60, 170, 30, 100, 30, 100],
  blue:   [180, 270, 30, 100, 30, 100],
  yellow: [25, 60, 50, 100, 50, 100],
  orange: [15, 35, 50, 100, 50, 100],
  cyan:   [150, 210, 30, 100, 30, 100],
  pink:   [300, 345, 30, 100, 50, 100],
  purple: [270, 315, 30, 100, 30, 100],
  white:  [0, 360, 0, 30, 80, 100],
  black:  [0, 360, 0, 100, 0, 20],
  brown:  [15, 40, 30, 80, 20, 70],
  gold:   [30, 55, 50, 100, 50, 100],
  lime:   [70, 130, 50, 100, 50, 100],
  navy:   [210, 250, 40, 100, 15, 50],
  magenta:[290, 330, 50, 100, 50, 100],
  teal:   [150, 190, 30, 100, 30, 100],
  coral:  [5, 25, 40, 100, 50, 100],
  gray:   [0, 360, 0, 15, 30, 70],
  silver: [0, 360, 0, 15, 70, 90],
  indigo: [220, 260, 40, 100, 20, 60],
  amber:  [30, 50, 60, 100, 40, 90],
  olive:  [50, 80, 30, 70, 20, 70],
  peach:  [15, 35, 30, 70, 60, 100],
  crimson:[340, 360, 50, 100, 40, 90],
  scarlet:[0, 20, 60, 100, 40, 90],
  maroon: [340, 360, 40, 80, 15, 45],
  emerald:[130, 170, 40, 100, 30, 80],
  sky:    [180, 210, 30, 70, 60, 100],
  azure:  [190, 220, 40, 80, 50, 90],
  aqua:   [160, 200, 40, 100, 40, 100],
  lavender:[250, 290, 20, 50, 60, 95],
  plum:   [280, 310, 30, 70, 30, 70],
  tangerine:[18, 38, 60, 100, 50, 100],
  rust:   [5, 25, 40, 80, 20, 55],
  lemon:  [40, 65, 50, 100, 60, 100],
  mint:   [120, 170, 20, 50, 60, 95],
  rose:   [320, 355, 30, 80, 50, 90],
};

interface DetectionOptions {
  mode: string;
  targetColor: string;
  colorTolerance: number;
  colorMinArea: number;
  motionThreshold: number;
  motionMinArea: number;
  edgeThreshold: number;
  objectMinArea: number;
  customRange?: CustomColorRange | null;
  colorLabel?: string | null;
  trackedObjectsRef: React.MutableRefObject<Map<string, { x: number; y: number; w: number; h: number; lastSeen: number }>>;
  frameCountRef: React.MutableRefObject<number>;
  nextIdRef: React.MutableRefObject<number>;
  prevFrameRef: React.MutableRefObject<ImageData | null>;
  onDebugLog?: (log: DebugLogEntry) => void;
}

interface ColorBounds {
  hMin: number; hMax: number;
  sMin: number; sMax: number;
  vMin: number; vMax: number;
  wrapH: boolean;
}

function computeColorBounds(targetColor: string, customRange: CustomColorRange | null | undefined, tolerance: number): ColorBounds {
  if (customRange) {
    return {
      hMin: customRange.hMin, hMax: customRange.hMax,
      sMin: customRange.sMin, sMax: customRange.sMax,
      vMin: customRange.vMin, vMax: customRange.vMax,
      wrapH: customRange.hMin > customRange.hMax,
    };
  }
  const base = COLOR_RANGES[targetColor] || [0, 360, 0, 100, 0, 100];
  const f = tolerance / 100;
  const hC = (base[0] + base[1]) / 2, hS = (base[1] - base[0]) / 2 * f;
  const sC = (base[2] + base[3]) / 2, sS = (base[3] - base[2]) / 2 * f;
  const vC = (base[4] + base[5]) / 2, vS = (base[5] - base[4]) / 2 * f;
  return {
    hMin: Math.max(0, hC - hS), hMax: Math.min(360, hC + hS),
    sMin: Math.max(0, sC - sS), sMax: Math.min(100, sC + sS),
    vMin: Math.max(0, vC - vS), vMax: Math.min(100, vC + vS),
    wrapH: false,
  };
}

function checkColorInline(r: number, g: number, b: number, bounds: ColorBounds): boolean {
  const rf = r * 0.003921569, gf = g * 0.003921569, bf = b * 0.003921569;
  const mx = rf > gf ? (rf > bf ? rf : bf) : (gf > bf ? gf : bf);
  const mn = rf < gf ? (rf < bf ? rf : bf) : (gf < bf ? gf : bf);
  const d = mx - mn;
  const s = mx > 0 ? (d * 100) / mx : 0;
  if (s < bounds.sMin || s > bounds.sMax) return false;
  const v = mx * 100;
  if (v < bounds.vMin || v > bounds.vMax) return false;
  let h = 0;
  if (d > 0) {
    if (mx === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
    else if (mx === gf) h = ((bf - rf) / d + 2) * 60;
    else h = ((rf - gf) / d + 4) * 60;
  }
  if (bounds.wrapH) return h >= bounds.hMin || h <= bounds.hMax;
  return h >= bounds.hMin && h <= bounds.hMax;
}

export function processFrame(
  frame: ImageData,
  options: DetectionOptions
): DetectedObject[] {
  const {
    mode, targetColor, colorTolerance, colorMinArea, motionThreshold, motionMinArea, edgeThreshold, objectMinArea, customRange, colorLabel,
    trackedObjectsRef, frameCountRef, nextIdRef, prevFrameRef,
    onDebugLog,
  } = options;

  const detected: DetectedObject[] = [];
  const data = frame.data;

  if (mode === "color" || mode === "all") {
    const bounds = computeColorBounds(targetColor, customRange, colorTolerance);
    const mask = new Uint8Array(TOTAL);
    for (let i = 0; i < data.length; i += 4) {
      if (checkColorInline(data[i], data[i + 1], data[i + 2], bounds)) mask[i >> 2] = 255;
    }
    const regions = findContours(mask, W, H, colorMinArea);
    const label = colorLabel || (customRange ? `RGB(${customRange.avgH.toFixed(0)}, ${customRange.avgS.toFixed(0)}, ${customRange.avgV.toFixed(0)})` : `Color: ${targetColor}`);
    for (const r of regions) {
      detected.push({ id: "", ...r, label, color: customRange ? "custom" : targetColor });
    }
  }

  if (mode === "motion" || mode === "all") {
    const prev = prevFrameRef.current;
    if (prev) {
      const mask = new Uint8Array(TOTAL);
      const prevData = prev.data;
      const thresh3 = motionThreshold * 3;
      for (let i = 0; i < data.length; i += 4) {
        const diff = Math.abs(data[i] - prevData[i]) + Math.abs(data[i + 1] - prevData[i + 1]) + Math.abs(data[i + 2] - prevData[i + 2]);
        if (diff > thresh3) mask[i >> 2] = 255;
      }
      const regions = findContours(mask, W, H, motionMinArea);
      for (const r of regions) {
        detected.push({ id: "", ...r, label: "Motion", color: "cyan" });
      }
    }
    prevFrameRef.current = frame;
  }

  if (mode === "object" || mode === "all" || mode === "scan") {
    const gray = new Uint8Array(TOTAL);
    for (let i = 0; i < data.length; i += 4) {
      gray[i >> 2] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }
    const edgeMask = new Uint8Array(TOTAL);
    const threshSq = edgeThreshold * edgeThreshold;
    for (let y = 1; y < H - 1; y++) {
      const rowOff = y * W;
      const prevRow = rowOff - W;
      const nextRow = rowOff + W;
      for (let x = 1; x < W - 1; x++) {
        const idx = rowOff + x;
        const gx = -gray[prevRow + x - 1] + gray[prevRow + x + 1] - 2 * gray[idx - 1] + 2 * gray[idx + 1] - gray[nextRow + x - 1] + gray[nextRow + x + 1];
        const gy = -gray[prevRow + x - 1] - 2 * gray[prevRow + x] - gray[prevRow + x + 1] + gray[nextRow + x - 1] + 2 * gray[nextRow + x] + gray[nextRow + x + 1];
        if (gx * gx + gy * gy > threshSq) edgeMask[idx] = 255;
      }
    }
    const regions = findContours(edgeMask, W, H, objectMinArea);
    for (const r of regions) {
      detected.push({ id: "", ...r, label: mode === "scan" ? "Scan" : "Object", color: mode === "scan" ? "yellow" : "white" });
    }
  }

  trackObjects(detected, trackedObjectsRef, frameCountRef, nextIdRef);

  frameCountRef.current++;
  if (frameCountRef.current % 60 === 0) {
    onDebugLog?.({
      type: "detection",
      frame: frameCountRef.current,
      message: `${detected.length} object(s) detected`,
      timestamp: Date.now(),
    });
  }

  return detected;
}

function trackObjects(
  detected: DetectedObject[],
  trackedObjectsRef: React.MutableRefObject<Map<string, { x: number; y: number; w: number; h: number; lastSeen: number }>>,
  frameCountRef: React.MutableRefObject<number>,
  nextIdRef: React.MutableRefObject<number>
) {
  const tracked = trackedObjectsRef.current;
  const maxDistSq = 2500;
  const usedIds = new Set<string>();

  for (const obj of detected) {
    let assignedId = "";
    let bestDistSq = maxDistSq;
    const objCx = obj.x + (obj.w >> 1);
    const objCy = obj.y + (obj.h >> 1);

    for (const [id, t] of tracked) {
      if (usedIds.has(id)) continue;
      const dx = objCx - (t.x + (t.w >> 1));
      const dy = objCy - (t.y + (t.h >> 1));
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        assignedId = id;
      }
    }

    if (!assignedId) {
      assignedId = `obj-${nextIdRef.current++}`;
    }

    usedIds.add(assignedId);
    tracked.set(assignedId, { x: obj.x, y: obj.y, w: obj.w, h: obj.h, lastSeen: frameCountRef.current });
    obj.id = assignedId;
  }

  const fc = frameCountRef.current;
  for (const [id, t] of tracked) {
    if (fc - t.lastSeen > 30) {
      tracked.delete(id);
    }
  }
}
