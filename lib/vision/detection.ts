import type { DetectedObject, DebugLogEntry, HybridProfile } from "./types";
import { isInColorRange, type CustomColorRange } from "./color";
import { findContours, computeEdgeDensity, computeSolidity, approximateCornerCount } from "./image-processing";

const W = 640;
const H = 480;

interface DetectionOptions {
  mode: string;
  targetColor: string;
  colorThreshold: number;
  motionThreshold: number;
  minMotionArea: number;
  customRange?: CustomColorRange | null;
  colorLabel?: string | null;
  hybridProfile?: HybridProfile | null;
  trackedObjectsRef: React.MutableRefObject<Map<string, { x: number; y: number; w: number; h: number; lastSeen: number }>>;
  frameCountRef: React.MutableRefObject<number>;
  nextIdRef: React.MutableRefObject<number>;
  prevFrameRef: React.MutableRefObject<ImageData | null>;
  onDebugLog?: (log: DebugLogEntry) => void;
}

export function processFrame(
  frame: ImageData,
  options: DetectionOptions
): DetectedObject[] {
  const {
    mode, targetColor, colorThreshold, motionThreshold, minMotionArea, customRange, colorLabel, hybridProfile,
    trackedObjectsRef, frameCountRef, nextIdRef, prevFrameRef,
    onDebugLog,
  } = options;

  const detected: DetectedObject[] = [];

  if (mode === "color" || mode === "all" || mode === "custom") {
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < frame.data.length; i += 4) {
      const r = frame.data[i], g = frame.data[i + 1], b = frame.data[i + 2];
      if (isInColorRange(r, g, b, targetColor, customRange ?? undefined)) {
        mask[i / 4] = 255;
      }
    }
    const regions = findContours(mask, W, H, colorThreshold);
    const label = colorLabel || (customRange ? `Picked (${customRange.avgH.toFixed(0)}, ${customRange.avgS.toFixed(0)}, ${customRange.avgV.toFixed(0)})` : `Color: ${targetColor}`);
    for (const r of regions) {
      detected.push({ id: "", ...r, label, color: customRange ? "custom" : targetColor });
    }
  }

  if (mode === "motion" || mode === "all") {
    const current = frame.data;
    if (prevFrameRef.current) {
      const mask = new Uint8Array(W * H);
      const prev = prevFrameRef.current.data;
      for (let i = 0; i < current.length; i += 4) {
        const dr = Math.abs(current[i] - prev[i]);
        const dg = Math.abs(current[i + 1] - prev[i + 1]);
        const db = Math.abs(current[i + 2] - prev[i + 2]);
        if ((dr + dg + db) / 3 > motionThreshold) {
          mask[i / 4] = 255;
        }
      }
      const regions = findContours(mask, W, H, minMotionArea);
      for (const r of regions) {
        detected.push({ id: "", ...r, label: "Motion", color: "cyan" });
      }
    }
    prevFrameRef.current = frame;
  }

  if (mode === "object" || mode === "all" || mode === "custom") {
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < frame.data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * frame.data[i] + 0.587 * frame.data[i + 1] + 0.114 * frame.data[i + 2]);
    }
    const edgeMask = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        const gx = -gray[idx - W - 1] + gray[idx - W + 1] - 2 * gray[idx - 1] + 2 * gray[idx + 1] - gray[idx + W - 1] + gray[idx + W + 1];
        const gy = -gray[idx - W - 1] - 2 * gray[idx - W] - gray[idx - W + 1] + gray[idx + W - 1] + 2 * gray[idx + W] + gray[idx + W + 1];
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > 80) edgeMask[idx] = 255;
      }
    }
    const regions = findContours(edgeMask, W, H, 1000);
    for (const r of regions) {
      detected.push({ id: "", ...r, label: "Object", color: "white" });
    }
  }

  if (mode === "hybrid" && hybridProfile) {
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < frame.data.length; i += 4) {
      const r = frame.data[i], g = frame.data[i + 1], b = frame.data[i + 2];
      const [h, s, v] = rgbToHsv(r, g, b);
      const hInRange = h >= hybridProfile.hMin && h <= hybridProfile.hMax;
      const sInRange = s >= hybridProfile.sMin && s <= hybridProfile.sMax;
      const vInRange = v >= hybridProfile.vMin && v <= hybridProfile.vMax;
      if (hInRange && sInRange && vInRange) {
        mask[i / 4] = 255;
      }
    }
    const regions = findContours(mask, W, H, Math.max(200, colorThreshold));

    for (const r of regions) {
      const edgeDensity = computeEdgeDensity(frame, r.x, r.y, r.w, r.h);
      const solidity = computeSolidity(mask, W, H, r.x, r.y, r.w, r.h);
      const aspectRatio = r.w / r.h;
      const cornerCount = approximateCornerCount(mask, W, H, r.x, r.y, r.w, r.h);

      const edgeMatch = Math.abs(edgeDensity - hybridProfile.avgEdgeDensity) <= hybridProfile.edgeDensityTolerance;
      const aspectMatch = Math.abs(aspectRatio - hybridProfile.avgAspectRatio) <= hybridProfile.aspectRatioTolerance;
      const solidityMatch = Math.abs(solidity - hybridProfile.avgSolidity) <= hybridProfile.solidityTolerance;
      const cornerMatch = Math.abs(cornerCount - hybridProfile.avgCornerCount) <= hybridProfile.cornerCountTolerance;

      const score = [edgeMatch, aspectMatch, solidityMatch, cornerMatch].filter(Boolean).length;

      if (score >= 3) {
        detected.push({
          id: "", ...r,
          label: `${hybridProfile.name} (${Math.round((score / 4) * 100)}%)`,
          color: "custom",
          similarity: (score / 4) * 100,
        });
      }
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

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, v * 100];
}

function trackObjects(
  detected: DetectedObject[],
  trackedObjectsRef: React.MutableRefObject<Map<string, { x: number; y: number; w: number; h: number; lastSeen: number }>>,
  frameCountRef: React.MutableRefObject<number>,
  nextIdRef: React.MutableRefObject<number>
) {
  const tracked = trackedObjectsRef.current;
  const maxDist = 50;
  const usedIds = new Set<string>();

  for (const obj of detected) {
    let assignedId = "";
    let bestDist = maxDist;

    for (const [id, t] of tracked) {
      if (usedIds.has(id)) continue;
      const dx = (obj.x + obj.w / 2) - (t.x + t.w / 2);
      const dy = (obj.y + obj.h / 2) - (t.y + t.h / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
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

  for (const [id, t] of tracked) {
    if (frameCountRef.current - t.lastSeen > 30) {
      tracked.delete(id);
    }
  }
}
