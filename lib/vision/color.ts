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

const COLOR_CENTERS: { name: string; h: number; s: number; v: number }[] = [
  { name: "red", h: 7, s: 75, v: 75 },
  { name: "orange", h: 25, s: 75, v: 75 },
  { name: "yellow", h: 42, s: 75, v: 75 },
  { name: "green", h: 115, s: 65, v: 65 },
  { name: "blue", h: 225, s: 65, v: 65 },
  { name: "cyan", h: 180, s: 65, v: 65 },
  { name: "pink", h: 330, s: 65, v: 75 },
  { name: "purple", h: 285, s: 65, v: 65 },
  { name: "white", h: 0, s: 5, v: 90 },
  { name: "black", h: 0, s: 5, v: 10 },
  { name: "brown", h: 25, s: 55, v: 45 },
  { name: "gold", h: 42, s: 75, v: 75 },
  { name: "lime", h: 90, s: 75, v: 75 },
  { name: "navy", h: 230, s: 70, v: 35 },
  { name: "magenta", h: 300, s: 75, v: 75 },
  { name: "teal", h: 170, s: 65, v: 65 },
  { name: "coral", h: 15, s: 70, v: 75 },
  { name: "gray", h: 0, s: 5, v: 50 },
  { name: "silver", h: 0, s: 5, v: 80 },
  { name: "indigo", h: 240, s: 70, v: 40 },
  { name: "amber", h: 40, s: 80, v: 65 },
  { name: "olive", h: 65, s: 50, v: 45 },
  { name: "peach", h: 25, s: 50, v: 80 },
  { name: "crimson", h: 350, s: 75, v: 65 },
  { name: "scarlet", h: 10, s: 80, v: 65 },
  { name: "maroon", h: 350, s: 60, v: 30 },
  { name: "emerald", h: 150, s: 70, v: 55 },
  { name: "sky", h: 195, s: 50, v: 80 },
  { name: "azure", h: 205, s: 60, v: 70 },
  { name: "aqua", h: 180, s: 70, v: 70 },
  { name: "lavender", h: 270, s: 35, v: 78 },
  { name: "plum", h: 295, s: 50, v: 50 },
  { name: "tangerine", h: 28, s: 80, v: 75 },
  { name: "rust", h: 15, s: 60, v: 38 },
  { name: "lemon", h: 52, s: 75, v: 80 },
  { name: "mint", h: 145, s: 35, v: 78 },
  { name: "rose", h: 340, s: 55, v: 70 },
];

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
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

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function closestNamedColor(r: number, g: number, b: number): string {
  const [h, s, v] = rgbToHsv(r, g, b);
  let best = "red";
  let bestDist = Infinity;
  for (const c of COLOR_CENTERS) {
    let hDiff = Math.abs(h - c.h);
    if (hDiff > 180) hDiff = 360 - hDiff;
    const dist = Math.sqrt(hDiff * hDiff * 0.6 + (s - c.s) ** 2 * 0.25 + (v - c.v) ** 2 * 0.15);
    if (dist < bestDist) {
      bestDist = dist;
      best = c.name;
    }
  }
  return best;
}

export interface CustomColorRange {
  hMin: number; hMax: number;
  sMin: number; sMax: number;
  vMin: number; vMax: number;
  avgH: number; avgS: number; avgV: number;
}

export function createCustomRangeFromArea(
  frame: ImageData, x: number, y: number, radius: number, tolerance: number
): CustomColorRange | null {
  const W = frame.width;
  const H = frame.height;
  const r = Math.max(3, Math.round(radius));

  const hSamples: number[] = [];
  const sSamples: number[] = [];
  const vSamples: number[] = [];
  const weights: number[] = [];

  const sigma = r / 2.5;
  const sigmaSq2 = 2 * sigma * sigma;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;

      const idx = (py * W + px) * 4;
      const fr = frame.data[idx];
      const fg = frame.data[idx + 1];
      const fb = frame.data[idx + 2];

      if (fr < 10 && fg < 10 && fb < 10) continue;

      const [h, s, v] = rgbToHsv(fr, fg, fb);
      const w = Math.exp(-(dx * dx + dy * dy) / sigmaSq2);
      hSamples.push(h);
      sSamples.push(s);
      vSamples.push(v);
      weights.push(w);
    }
  }

  if (hSamples.length === 0) return null;

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let avgH = 0, avgS = 0, avgV = 0;
  for (let i = 0; i < hSamples.length; i++) {
    const nw = weights[i] / totalWeight;
    avgH += hSamples[i] * nw;
    avgS += sSamples[i] * nw;
    avgV += vSamples[i] * nw;
  }

  const hDevs: number[] = [];
  const sDevs: number[] = [];
  const vDevs: number[] = [];
  for (let i = 0; i < hSamples.length; i++) {
    let hDiff = Math.abs(hSamples[i] - avgH);
    if (hDiff > 180) hDiff = 360 - hDiff;
    hDevs.push(hDiff);
    sDevs.push(Math.abs(sSamples[i] - avgS));
    vDevs.push(Math.abs(vSamples[i] - avgV));
  }

  const sortedH = [...hDevs].sort((a, b) => a - b);
  const sortedS = [...sDevs].sort((a, b) => a - b);
  const sortedV = [...vDevs].sort((a, b) => a - b);
  const p90Idx = Math.floor(hDevs.length * 0.9);
  const hSpread = Math.max(5, sortedH[p90Idx] * 2);
  const sSpread = Math.max(5, sortedS[p90Idx] * 2);
  const vSpread = Math.max(5, sortedV[p90Idx] * 2);

  const tolFactor = Math.max(0.3, (100 - tolerance) / 100);
  const finalHMin = Math.max(0, avgH - hSpread * tolFactor);
  const finalHMax = Math.min(360, avgH + hSpread * tolFactor);
  const finalSMin = Math.max(0, avgS - sSpread * tolFactor);
  const finalSMax = Math.min(100, avgS + sSpread * tolFactor);
  const finalVMin = Math.max(0, avgV - vSpread * tolFactor);
  const finalVMax = Math.min(100, avgV + vSpread * tolFactor);

  return {
    hMin: finalHMin, hMax: finalHMax,
    sMin: finalSMin, sMax: finalSMax,
    vMin: finalVMin, vMax: finalVMax,
    avgH, avgS, avgV,
  };
}

export function createCustomRange(r: number, g: number, b: number, tolerance: number): CustomColorRange {
  const [h, s, v] = rgbToHsv(r, g, b);
  const t = Math.max(15, Math.round((100 - tolerance) * 1.5));
  return {
    hMin: Math.max(0, h - t / 2),
    hMax: Math.min(360, h + t / 2),
    sMin: Math.max(0, s - t * 0.5),
    sMax: Math.min(100, s + t * 0.5),
    vMin: Math.max(0, v - t * 0.5),
    vMax: Math.min(100, v + t * 0.5),
    avgH: h, avgS: s, avgV: v,
  };
}

export function isInColorRange(r: number, g: number, b: number, targetColor: string, customRange?: CustomColorRange, tolerance?: number): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);

  if (customRange) {
    let hDiff = Math.abs(h - customRange.avgH);
    if (hDiff > 180) hDiff = 360 - hDiff;

    const hInRange = h >= customRange.hMin && h <= customRange.hMax;
    const sInRange = s >= customRange.sMin && s <= customRange.sMax;
    const vInRange = v >= customRange.vMin && v <= customRange.vMax;

    return hInRange && sInRange && vInRange;
  }

  const base = COLOR_RANGES[targetColor] || [0, 360, 0, 100, 0, 100];
  let [hMin, hMax, sMin, sMax, vMin, vMax] = base;

  if (tolerance !== undefined) {
    const factor = tolerance / 100;
    const hCenter = (hMin + hMax) / 2;
    const hHalfSpan = (hMax - hMin) / 2 * factor;
    hMin = Math.max(0, hCenter - hHalfSpan);
    hMax = Math.min(360, hCenter + hHalfSpan);

    const sCenter = (sMin + sMax) / 2;
    const sHalfSpan = (sMax - sMin) / 2 * factor;
    sMin = Math.max(0, sCenter - sHalfSpan);
    sMax = Math.min(100, sCenter + sHalfSpan);

    const vCenter = (vMin + vMax) / 2;
    const vHalfSpan = (vMax - vMin) / 2 * factor;
    vMin = Math.max(0, vCenter - vHalfSpan);
    vMax = Math.min(100, vCenter + vHalfSpan);
  }

  const hInRange = h >= hMin && h <= hMax;
  return hInRange && s >= sMin && s <= sMax && v >= vMin && v <= vMax;
}
