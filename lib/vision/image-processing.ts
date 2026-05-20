import type { RegionResult } from "./types";

export function findContours(mask: Uint8Array, w: number, h: number, minArea: number): RegionResult[] {
  const visited = new Uint8Array(w * h);
  const regions: RegionResult[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0 || visited[idx]) continue;

      let minX = x, minY = y, maxX = x, maxY = y;
      let area = 0;
      let perimeter = 0;
      const stack = [idx];
      visited[idx] = 1;

      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cx = cur % w;
        const cy = Math.floor(cur / w);
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cy > 0 ? cur - w : -1,
          cy < h - 1 ? cur + w : -1,
          cx > 0 ? cur - 1 : -1,
          cx < w - 1 ? cur + 1 : -1,
        ];

        let edgeCount = 0;
        for (const n of neighbors) {
          if (n < 0 || mask[n] === 0) {
            edgeCount++;
          } else if (!visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
        perimeter += edgeCount;
      }

      if (area >= minArea) {
        regions.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, area, perimeter });
      }
    }
  }
  return regions;
}

export function computeEdgeDensity(frame: ImageData, x: number, y: number, w: number, h: number): number {
  const fw = frame.width;
  let edgeCount = 0;
  let totalPixels = 0;

  for (let dy = 1; dy < h - 1; dy++) {
    for (let dx = 1; dx < w - 1; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= fw || py < 0 || py >= frame.height) continue;

      const idx = (py * fw + px) * 4;
      const gray = 0.299 * frame.data[idx] + 0.587 * frame.data[idx + 1] + 0.114 * frame.data[idx + 2];

      const idxR = (py * fw + px + 1) * 4;
      const grayR = 0.299 * frame.data[idxR] + 0.587 * frame.data[idxR + 1] + 0.114 * frame.data[idxR + 2];

      const idxB = ((py + 1) * fw + px) * 4;
      const grayB = 0.299 * frame.data[idxB] + 0.587 * frame.data[idxB + 1] + 0.114 * frame.data[idxB + 2];

      const gx = Math.abs(grayR - gray);
      const gy = Math.abs(grayB - gray);

      if (gx + gy > 60) edgeCount++;
      totalPixels++;
    }
  }

  return totalPixels > 0 ? edgeCount / totalPixels : 0;
}

export function computeSolidity(mask: Uint8Array, fw: number, fh: number, x: number, y: number, w: number, h: number): number {
  let area = 0;
  let hullArea = w * h;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= fw || py < 0 || py >= fh) continue;
      if (mask[py * fw + px] > 0) area++;
    }
  }

  return hullArea > 0 ? area / hullArea : 0;
}

export function approximateCornerCount(mask: Uint8Array, fw: number, fh: number, x: number, y: number, w: number, h: number): number {
  const step = Math.max(2, Math.floor(Math.min(w, h) / 10));
  let corners = 0;

  for (let dy = step; dy < h - step; dy += step) {
    for (let dx = step; dx < w - step; dx += step) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= fw || py < 0 || py >= fh) continue;

      const center = mask[py * fw + px] > 0;
      if (!center) continue;

      const top = mask[(py - step) * fw + px] > 0;
      const bottom = mask[(py + step) * fw + px] > 0;
      const left = mask[py * fw + (px - step)] > 0;
      const right = mask[py * fw + (px + step)] > 0;

      const transitions = [top, right, bottom, left, top].reduce((acc, curr, i, arr) => {
        if (i > 0 && curr !== arr[i - 1]) acc++;
        return acc;
      }, 0);

      if (transitions >= 3) corners++;
    }
  }

  return corners;
}
