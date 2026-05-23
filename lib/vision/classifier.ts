import type { TrainingSample } from "./types";

const STORAGE_KEY = "training_samples";

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) * (a[i] - b[i]);
  }
  return Math.sqrt(sum);
}

export function extractFeatures(
  frame: ImageData,
  x: number, y: number, w: number, h: number
): number[] {
  const cx = Math.max(0, Math.floor(x));
  const cy = Math.max(0, Math.floor(y));
  const cw = Math.min(frame.width - cx, Math.floor(w));
  const ch = Math.min(frame.height - cy, Math.floor(h));
  const data = frame.data;
  const stride = frame.width;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  let edgeCount = 0;

  for (let row = cy; row < cy + ch; row++) {
    for (let col = cx; col < cx + cw; col++) {
      const idx = (row * stride + col) * 4;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }

  const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count;
  const gray = Math.round(avgR * 0.299 + avgG * 0.587 + avgB * 0.114);

  for (let row = cy + 1; row < cy + ch - 1; row++) {
    for (let col = cx + 1; col < cx + cw - 1; col++) {
      const idx = (row * stride + col) * 4;
      const g = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const gx = data[((row) * stride + (col + 1)) * 4] * 0.299
               + data[((row) * stride + (col + 1)) * 4 + 1] * 0.587
               + data[((row) * stride + (col + 1)) * 4 + 2] * 0.114
               - data[((row) * stride + (col - 1)) * 4] * 0.299
               - data[((row) * stride + (col - 1)) * 4 + 1] * 0.587
               - data[((row) * stride + (col - 1)) * 4 + 2] * 0.114;
      const gy = data[((row + 1) * stride + col) * 4] * 0.299
               + data[((row + 1) * stride + col) * 4 + 1] * 0.587
               + data[((row + 1) * stride + col) * 4 + 2] * 0.114
               - data[((row - 1) * stride + col) * 4] * 0.299
               - data[((row - 1) * stride + col) * 4 + 1] * 0.587
               - data[((row - 1) * stride + col) * 4 + 2] * 0.114;
      if (Math.sqrt(gx * gx + gy * gy) > 50) edgeCount++;
    }
  }

  const area = cw * ch;
  const perimeter = 2 * (cw + ch);
  const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
  const edgeDensity = area > 0 ? edgeCount / area : 0;
  const whRatio = cw / (ch || 1);

  return [
    avgR / 255, avgG / 255, avgB / 255,
    gray / 255,
    whRatio / 5,
    Math.min(circularity, 1),
    Math.min(edgeDensity * 100, 1),
    (cw * ch) / (frame.width * frame.height) * 10,
  ];
}

export function knnPredict(
  samples: TrainingSample[],
  features: number[],
  k: number = 5
): { label: string; confidence: number } {
  if (samples.length === 0) return { label: "unknown", confidence: 0 };
  if (samples.length < k) k = samples.length;

  const distances = samples.map(s => ({
    label: s.label,
    dist: euclidean(s.features, features),
  }));
  distances.sort((a, b) => a.dist - b.dist);
  const nearest = distances.slice(0, k);

  const votes: Record<string, number> = {};
  for (const n of nearest) {
    votes[n.label] = (votes[n.label] || 0) + 1;
  }

  let bestLabel = nearest[0].label;
  let bestCount = 0;
  for (const [label, count] of Object.entries(votes)) {
    if (count > bestCount) { bestCount = count; bestLabel = label; }
  }

  return {
    label: bestLabel,
    confidence: bestCount / k,
  };
}

export function loadTrainingSamples(): TrainingSample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveTrainingSamples(samples: TrainingSample[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {}
}

export function addTrainingSample(sample: TrainingSample): TrainingSample[] {
  const samples = loadTrainingSamples();
  samples.push(sample);
  saveTrainingSamples(samples);
  return samples;
}

export function removeTrainingSample(id: string): TrainingSample[] {
  const samples = loadTrainingSamples().filter(s => s.id !== id);
  saveTrainingSamples(samples);
  return samples;
}

export function clearTrainingSamples(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
