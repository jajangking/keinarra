export type DetectionMode = "color" | "motion" | "object" | "all" | "scan" | "yolo" | "face" | "hand" | "pose" | "segment" | "train";
export type RobotMode = "follow" | "interact" | "play" | "manual";

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  name?: string;
}

export interface HandData {
  landmarks: LandmarkPoint[];
  handedness: string;
  gestures: string[];
}

export interface PoseData {
  landmarks: LandmarkPoint[];
}

export interface FaceData {
  landmarks?: LandmarkPoint[];
}

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
  landmarks?: LandmarkPoint[];
  handData?: HandData;
  poseData?: PoseData;
  faceData?: FaceData;
}

export interface SegmentationResult {
  mask: ImageData | null;
  width: number;
  height: number;
}

export interface TrainingSample {
  id: string;
  label: string;
  features: number[];
  thumbnail?: string;
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
  motorLeft?: number;
  motorRight?: number;
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

export interface MotorState {
  leftSpeed: number;
  rightSpeed: number;
}

export interface BuzzerState {
  on: boolean;
  frequency: number;
}

export interface Esp32State {
  motors: MotorState;
  buzzer: BuzzerState;
  connected: boolean;
}

export interface DebugLogEntry {
  type: string;
  frame?: number;
  message?: string;
  timestamp?: number;
}


