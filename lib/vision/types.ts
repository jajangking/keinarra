export type DetectionMode = "color" | "motion" | "object" | "custom" | "hybrid" | "all";
export type RobotMode = "follow" | "interact" | "play";

export interface DetectedObject {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  customName?: string;
  color?: string;
  similarity?: number;
}

export interface RobotState {
  x: number;
  y: number;
  angle: number;
  speed: number;
  targetX: number;
  targetY: number;
  state: "idle" | "moving" | "interacting" | "playing";
  battery: number;
}

export interface PlayTarget {
  x: number;
  y: number;
  radius: number;
  color: string;
  active: boolean;
}

export interface RegionResult {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  perimeter: number;
}

export interface DebugLogEntry {
  type: string;
  frame?: number;
  message?: string;
  timestamp?: number;
}

export interface HybridSample {
  id: string;
  hMin: number; hMax: number;
  sMin: number; sMax: number;
  vMin: number; vMax: number;
  edgeDensity: number;
  aspectRatio: number;
  solidity: number;
  cornerCount: number;
  capturedAt: number;
}

export interface HybridProfile {
  id: string;
  name: string;
  hMin: number; hMax: number;
  sMin: number; sMax: number;
  vMin: number; vMax: number;
  avgEdgeDensity: number;
  edgeDensityTolerance: number;
  avgAspectRatio: number;
  aspectRatioTolerance: number;
  avgSolidity: number;
  solidityTolerance: number;
  avgCornerCount: number;
  cornerCountTolerance: number;
  samples: HybridSample[];
  thumbnail: string;
  createdAt: number;
}
