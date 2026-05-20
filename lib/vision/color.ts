const COLOR_RANGES: Record<string, [number, number, number, number, number, number]> = {
  red:    [0, 15, 50, 100, 50, 100],
  green:  [60, 170, 30, 100, 30, 100],
  blue:   [180, 270, 30, 100, 30, 100],
  yellow: [25, 60, 50, 100, 50, 100],
  orange: [15, 35, 50, 100, 50, 100],
};

const COLOR_CENTERS: { name: string; h: number; s: number; v: number }[] = [
  { name: "red", h: 7, s: 75, v: 75 },
  { name: "orange", h: 25, s: 75, v: 75 },
  { name: "yellow", h: 42, s: 75, v: 75 },
  { name: "green", h: 115, s: 65, v: 65 },
  { name: "blue", h: 225, s: 65, v: 65 },
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
  frame: ImageData, x: number, y: number, radius: number, sensitivity: number
): CustomColorRange | null {
  const W = frame.width;
  const H = frame.height;
  const r = Math.max(3, Math.round(radius));

  const hSamples: number[] = [];
  const sSamples: number[] = [];
  const vSamples: number[] = [];

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
      hSamples.push(h);
      sSamples.push(s);
      vSamples.push(v);
    }
  }

  if (hSamples.length === 0) return null;

  const avgH = hSamples.reduce((a, b) => a + b, 0) / hSamples.length;
  const avgS = sSamples.reduce((a, b) => a + b, 0) / sSamples.length;
  const avgV = vSamples.reduce((a, b) => a + b, 0) / vSamples.length;

  let hMin = Infinity, hMax = -Infinity;
  let sMin = Infinity, sMax = -Infinity;
  let vMin = Infinity, vMax = -Infinity;

  for (const h of hSamples) {
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  for (const s of sSamples) {
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }
  for (const v of vSamples) {
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  const spread = Math.max(5, (100 - sensitivity) * 0.3);

  const hSpread = Math.max(spread, (hMax - hMin) * 1.5);
  const sSpread = Math.max(spread * 0.5, (sMax - sMin) * 1.5);
  const vSpread = Math.max(spread * 0.5, (vMax - vMin) * 1.5);

  let finalHMin = avgH - hSpread / 2;
  let finalHMax = avgH + hSpread / 2;
  let finalSMin = Math.max(0, avgS - sSpread / 2);
  let finalSMax = Math.min(100, avgS + sSpread / 2);
  let finalVMin = Math.max(0, avgV - vSpread / 2);
  let finalVMax = Math.min(100, avgV + vSpread / 2);

  if (finalHMin < 0 || finalHMax > 360) {
    finalHMin = Math.max(0, finalHMin);
    finalHMax = Math.min(360, finalHMax);
  }

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

export function isInColorRange(r: number, g: number, b: number, targetColor: string, customRange?: CustomColorRange): boolean {
  const [h, s, v] = rgbToHsv(r, g, b);

  if (customRange) {
    let hDiff = Math.abs(h - customRange.avgH);
    if (hDiff > 180) hDiff = 360 - hDiff;

    const hInRange = h >= customRange.hMin && h <= customRange.hMax;
    const sInRange = s >= customRange.sMin && s <= customRange.sMax;
    const vInRange = v >= customRange.vMin && v <= customRange.vMax;

    return hInRange && sInRange && vInRange;
  }

  const [hMin, hMax, sMin, sMax, vMin, vMax] = COLOR_RANGES[targetColor] || [0, 360, 0, 100, 0, 100];
  const hInRange = h >= hMin && h <= hMax;
  return hInRange && s >= sMin && s <= sMax && v >= vMin && v <= vMax;
}
