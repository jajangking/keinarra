const KNOWN_HEIGHTS: Record<string, number> = {
  person: 1.7, bicycle: 1.0, car: 1.5, motorcycle: 1.2, airplane: 4.0, bus: 3.0,
  train: 3.5, truck: 2.5, boat: 1.5, "traffic light": 0.8, "fire hydrant": 0.6,
  "stop sign": 0.7, "parking meter": 1.0, bench: 0.8, bird: 0.2, cat: 0.25,
  dog: 0.5, horse: 1.5, sheep: 0.8, cow: 1.4, elephant: 3.0, bear: 1.5,
  zebra: 1.3, giraffe: 4.5, backpack: 0.5, umbrella: 1.0, handbag: 0.3,
  tie: 0.1, suitcase: 0.6, frisbee: 0.2, skis: 1.5, snowboard: 1.2,
  "sports ball": 0.15, kite: 0.5, "baseball bat": 0.8, "baseball glove": 0.2,
  skateboard: 0.2, surfboard: 1.5, "tennis racket": 0.6, bottle: 0.25,
  "wine glass": 0.2, cup: 0.1, fork: 0.2, knife: 0.2, spoon: 0.2, bowl: 0.1,
  banana: 0.2, apple: 0.08, sandwich: 0.1, orange: 0.08, broccoli: 0.15,
  carrot: 0.15, "hot dog": 0.15, pizza: 0.3, donut: 0.1, cake: 0.15,
  chair: 0.8, couch: 0.8, "potted plant": 0.5, bed: 0.5, "dining table": 0.7,
  toilet: 0.4, tv: 0.5, laptop: 0.3, mouse: 0.1, remote: 0.1, keyboard: 0.1,
  "cell phone": 0.15, microwave: 0.3, oven: 0.5, toaster: 0.2, sink: 0.2,
  refrigerator: 1.5, book: 0.2, clock: 0.2, vase: 0.3, scissors: 0.15,
  "teddy bear": 0.4, "hair drier": 0.2, toothbrush: 0.15,
};

const KNOWN_WIDTHS: Record<string, number> = {
  person: 0.5, bicycle: 0.6, car: 1.8, motorcycle: 0.8, airplane: 8.0, bus: 2.5,
  train: 2.8, truck: 2.5, boat: 2.0, "traffic light": 0.3, "fire hydrant": 0.3,
  "stop sign": 0.6, "parking meter": 0.3, bench: 1.5, bird: 0.15, cat: 0.15,
  dog: 0.3, horse: 0.8, sheep: 0.6, cow: 0.8, elephant: 2.0, bear: 0.8,
  zebra: 0.8, giraffe: 1.0, backpack: 0.4, umbrella: 1.2, handbag: 0.3,
  tie: 0.05, suitcase: 0.5, frisbee: 0.25, skis: 0.2, snowboard: 0.3,
  "sports ball": 0.22, kite: 0.5, "baseball bat": 0.07, "baseball glove": 0.2,
  skateboard: 0.2, surfboard: 0.6, "tennis racket": 0.3, bottle: 0.08,
  "wine glass": 0.08, cup: 0.08, fork: 0.03, knife: 0.03, spoon: 0.03, bowl: 0.15,
  banana: 0.08, apple: 0.08, sandwich: 0.12, orange: 0.08, broccoli: 0.15,
  carrot: 0.03, "hot dog": 0.04, pizza: 0.35, donut: 0.1, cake: 0.2,
  chair: 0.5, couch: 1.8, "potted plant": 0.4, bed: 1.5, "dining table": 1.2,
  toilet: 0.4, tv: 0.8, laptop: 0.35, mouse: 0.06, remote: 0.05, keyboard: 0.15,
  "cell phone": 0.07, microwave: 0.5, oven: 0.6, toaster: 0.3, sink: 0.5,
  refrigerator: 0.8, book: 0.15, clock: 0.3, vase: 0.15, scissors: 0.08,
  "teddy bear": 0.3, "hair drier": 0.08, toothbrush: 0.03,
};

export function getKnownHeight(label: string): number | null {
  const key = label.toLowerCase().replace(/\s+/g, " ");
  return KNOWN_HEIGHTS[key] ?? null;
}

export function getKnownWidth(label: string): number | null {
  const key = label.toLowerCase().replace(/\s+/g, " ");
  return KNOWN_WIDTHS[key] ?? null;
}

export function estimateFocalLength(imageWidth: number, imageHeight: number, hfovDeg = 58): number {
  return imageWidth / (2 * Math.tan((hfovDeg / 2) * (Math.PI / 180)));
}

export function getFocalLengthFromTrack(videoEl: HTMLVideoElement, fallback: number): number {
  try {
    const track = videoEl.srcObject instanceof MediaStream
      ? videoEl.srcObject.getVideoTracks()[0]
      : null;
    if (!track) return fallback;
    const settings = track.getSettings?.();
    if (settings?.width && settings?.height) {
      const diagPx = Math.sqrt(settings.width ** 2 + settings.height ** 2);
      const diagFov = 65;
      return diagPx / (2 * Math.tan((diagFov / 2) * (Math.PI / 180)));
    }
  } catch {}
  return fallback;
}

export function estimateDistance(
  bboxPx: number,
  knownM: number,
  focalLengthPx: number,
): number | null {
  if (bboxPx <= 0 || knownM <= 0 || focalLengthPx <= 0) return null;
  return (knownM * focalLengthPx) / bboxPx;
}

export function estimateDistanceFromBbox(
  bboxW: number,
  bboxH: number,
  label: string,
  focalLengthPx: number,
  frameH = 480,
): number | null {
  const knownHeight = getKnownHeight(label);
  const knownWidth = getKnownWidth(label);

  const distH = knownHeight != null ? estimateDistance(bboxH, knownHeight, focalLengthPx) : null;
  const distW = knownWidth != null ? estimateDistance(bboxW, knownWidth, focalLengthPx) : null;

  if (distH != null && distW != null) {
    const spread = Math.abs(distH - distW);
    const larger = Math.max(distH, distW);
    if (spread > larger * 0.5) return null;
    return distH;
  }

  const dist = distH ?? distW;
  if (dist == null) return null;

  if (knownHeight != null) {
    const minPossibleH = (knownHeight * focalLengthPx) / frameH;
    if (dist < minPossibleH * 0.5) return null;
  }

  return dist;
}

export function formatDistance(meters: number): string {
  if (meters < 0) return "0cm";
  if (meters >= 100) return `${meters.toFixed(0)}m`;
  if (meters >= 10) return `${meters.toFixed(1)}m`;
  if (meters >= 1) return `${meters.toFixed(2)}m`;
  if (meters >= 0.01) return `${(meters * 100).toFixed(1)}cm`;
  return `${(meters * 1000).toFixed(0)}mm`;
}
