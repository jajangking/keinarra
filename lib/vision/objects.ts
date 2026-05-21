import { rgbToHsv } from "./color";

export interface ObjectSignature {
  avgR: number;
  avgG: number;
  avgB: number;
  avgH: number;
  avgS: number;
  avgV: number;
  stdR: number;
  stdG: number;
  stdB: number;
  widthHeightRatio: number;
  area: number;
  perimeter: number;
  circularity: number;
  edgeDensity: number;
}

export interface SavedObject {
  id: string;
  name: string;
  signature: ObjectSignature;
  thumbnail: string;
  createdAt: number;
  lastSeen?: number;
  seenCount: number;
}

export interface ScannedObject {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  confidence: number;
  color: string;
  signature: ObjectSignature;
  thumbnail: string;
}

export function computeSignature(
  frame: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  perimeter: number,
  edgeMask?: Uint8Array
): ObjectSignature {
  const W = frame.width;
  const rValues: number[] = [];
  const gValues: number[] = [];
  const bValues: number[] = [];

  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W - 1, Math.floor(x + w));
  const y1 = Math.min(frame.height - 1, Math.floor(y + h));

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const idx = (py * W + px) * 4;
      rValues.push(frame.data[idx]);
      gValues.push(frame.data[idx + 1]);
      bValues.push(frame.data[idx + 2]);
    }
  }

  const count = rValues.length || 1;
  const avgR = rValues.reduce((a, b) => a + b, 0) / count;
  const avgG = gValues.reduce((a, b) => a + b, 0) / count;
  const avgB = bValues.reduce((a, b) => a + b, 0) / count;

  const stdR = Math.sqrt(rValues.reduce((sum, v) => sum + (v - avgR) ** 2, 0) / count);
  const stdG = Math.sqrt(gValues.reduce((sum, v) => sum + (v - avgG) ** 2, 0) / count);
  const stdB = Math.sqrt(bValues.reduce((sum, v) => sum + (v - avgB) ** 2, 0) / count);

  const [avgH, avgS, avgV] = rgbToHsv(Math.round(avgR), Math.round(avgG), Math.round(avgB));

  const area = w * h;
  const whRatio = h > 0 ? w / h : 1;
  const circularity = area > 0 ? (4 * Math.PI * area) / (perimeter * perimeter + 1) : 0;
  const edgeDensity = edgeMask ? computeEdgeDensity(edgeMask, x0, y0, x1, y1, W) : 0;

  return {
    avgR, avgG, avgB,
    avgH, avgS, avgV,
    stdR, stdG, stdB,
    widthHeightRatio: whRatio,
    area,
    perimeter,
    circularity,
    edgeDensity,
  };
}

function computeEdgeDensity(
  edgeMask: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  W: number
): number {
  let edges = 0;
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total++;
      if (edgeMask[y * W + x] > 0) edges++;
    }
  }
  return total > 0 ? (edges / total) * 100 : 0;
}

export function extractThumbnail(
  frame: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  size = 64
): string {
  const W = frame.width;
  const H = frame.height;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.min(W - sx, Math.floor(w));
  const sh = Math.min(H - sy, Math.floor(h));

  const srcData = ctx.createImageData(sw, sh);
  for (let i = 0; i < sw * sh; i++) {
    const srcIdx = ((sy + Math.floor(i / sw)) * W + (sx + (i % sw))) * 4;
    srcData.data[i * 4] = frame.data[srcIdx];
    srcData.data[i * 4 + 1] = frame.data[srcIdx + 1];
    srcData.data[i * 4 + 2] = frame.data[srcIdx + 2];
    srcData.data[i * 4 + 3] = 255;
  }

  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = sw;
  tmpCanvas.height = sh;
  const tmpCtx = tmpCanvas.getContext("2d");
  if (!tmpCtx) return "";
  tmpCtx.putImageData(srcData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(tmpCanvas, 0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.7);
}

export function matchObject(
  signature: ObjectSignature,
  savedObjects: SavedObject[],
  threshold = 0.75
): SavedObject | null {
  let bestMatch: SavedObject | null = null;
  let bestScore = 0;

  for (const obj of savedObjects) {
    const s = obj.signature;
    const hDiff = Math.abs(signature.avgH - s.avgH);
    const hDist = Math.min(hDiff, 360 - hDiff) / 180;
    const sDist = Math.abs(signature.avgS - s.avgS) / 100;
    const vDist = Math.abs(signature.avgV - s.avgV) / 100;
    const rDist = Math.abs(signature.avgR - s.avgR) / 255;
    const gDist = Math.abs(signature.avgG - s.avgG) / 255;
    const bDist = Math.abs(signature.avgB - s.avgB) / 255;
    const whDist = Math.abs(signature.widthHeightRatio - s.widthHeightRatio) / Math.max(1, s.widthHeightRatio);
    const circDist = Math.abs(signature.circularity - s.circularity);

    const colorScore = 1 - (hDist * 0.4 + sDist * 0.15 + vDist * 0.15 + rDist * 0.1 + gDist * 0.1 + bDist * 0.1);
    const shapeScore = 1 - (Math.min(whDist, 1) * 0.6 + circDist * 0.4);
    const score = colorScore * 0.6 + shapeScore * 0.4;

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = obj;
    }
  }

  return bestMatch;
}

const STORAGE_KEY = "keinarra_saved_objects";

export async function loadSavedObjects(): Promise<SavedObject[]> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addSavedObject(obj: SavedObject): Promise<SavedObject[]> {
  const existing = await loadSavedObjects();
  const updated = [...existing, obj];
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export async function removeSavedObject(id: string): Promise<SavedObject[]> {
  const existing = await loadSavedObjects();
  const updated = existing.filter(o => o.id !== id);
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export async function updateSavedObject(id: string, updates: Partial<SavedObject>): Promise<SavedObject[]> {
  const existing = await loadSavedObjects();
  const updated = existing.map(o => o.id === id ? { ...o, ...updates } : o);
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}
