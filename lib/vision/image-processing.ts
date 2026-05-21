import type { RegionResult } from "./types";

export function findContours(mask: Uint8Array, w: number, h: number, minArea: number): RegionResult[] {
  const visited = new Uint8Array(w * h);
  const regions: RegionResult[] = [];
  const stack = new Int32Array(w * h);

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const idx = rowOff + x;
      if (mask[idx] === 0 || visited[idx]) continue;

      let minX = x, minY = y, maxX = x, maxY = y;
      let area = 0;
      let perimeter = 0;
      let sp = 0;
      stack[sp++] = idx;
      visited[idx] = 1;

      while (sp > 0) {
        const cur = stack[--sp];
        const cx = cur % w;
        const cy = (cur - cx) / w;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        let edgeCount = 0;

        if (cy > 0) {
          const n = cur - w;
          if (mask[n] === 0) { edgeCount++; }
          else if (!visited[n]) { visited[n] = 1; stack[sp++] = n; }
        } else { edgeCount++; }

        if (cy < h - 1) {
          const n = cur + w;
          if (mask[n] === 0) { edgeCount++; }
          else if (!visited[n]) { visited[n] = 1; stack[sp++] = n; }
        } else { edgeCount++; }

        if (cx > 0) {
          const n = cur - 1;
          if (mask[n] === 0) { edgeCount++; }
          else if (!visited[n]) { visited[n] = 1; stack[sp++] = n; }
        } else { edgeCount++; }

        if (cx < w - 1) {
          const n = cur + 1;
          if (mask[n] === 0) { edgeCount++; }
          else if (!visited[n]) { visited[n] = 1; stack[sp++] = n; }
        } else { edgeCount++; }

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
    const rowOff = (y + dy) * fw;
    const nextRowOff = rowOff + fw;
    for (let dx = 1; dx < w - 1; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= fw || py < 0 || py >= frame.height) continue;

      const idx = (rowOff + px) << 2;
      const gray = (frame.data[idx] * 77 + frame.data[idx + 1] * 150 + frame.data[idx + 2] * 29) >> 8;
      const idxR = idx + 4;
      const grayR = (frame.data[idxR] * 77 + frame.data[idxR + 1] * 150 + frame.data[idxR + 2] * 29) >> 8;
      const idxB = (nextRowOff + px) << 2;
      const grayB = (frame.data[idxB] * 77 + frame.data[idxB + 1] * 150 + frame.data[idxB + 2] * 29) >> 8;

      if (Math.abs(grayR - gray) + Math.abs(grayB - gray) > 60) edgeCount++;
      totalPixels++;
    }
  }

  return totalPixels > 0 ? edgeCount / totalPixels : 0;
}

export function computeSolidity(mask: Uint8Array, fw: number, fh: number, x: number, y: number, w: number, h: number): number {
  let area = 0;
  const hullArea = w * h;

  for (let dy = 0; dy < h; dy++) {
    const rowOff = (y + dy) * fw;
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= fw || py < 0 || py >= fh) continue;
      if (mask[rowOff + px] > 0) area++;
    }
  }

  return hullArea > 0 ? area / hullArea : 0;
}

export function approximateCornerCount(mask: Uint8Array, fw: number, fh: number, x: number, y: number, w: number, h: number): number {
  const step = Math.max(2, Math.floor(Math.min(w, h) / 10));
  let corners = 0;

  for (let dy = step; dy < h - step; dy += step) {
    const centerRowOff = (y + dy) * fw;
    const topRowOff = (y + dy - step) * fw;
    const bottomRowOff = (y + dy + step) * fw;
    for (let dx = step; dx < w - step; dx += step) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= fw || py < 0 || py >= fh) continue;

      if (mask[centerRowOff + px] === 0) continue;

      const top = mask[topRowOff + px] > 0;
      const bottom = mask[bottomRowOff + px] > 0;
      const left = mask[centerRowOff + px - step] > 0;
      const right = mask[centerRowOff + px + step] > 0;

      let transitions = 0;
      if (top !== right) transitions++;
      if (right !== bottom) transitions++;
      if (bottom !== left) transitions++;
      if (left !== top) transitions++;

      if (transitions >= 3) corners++;
    }
  }

  return corners;
}
