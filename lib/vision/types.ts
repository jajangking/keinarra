export type DetectionMode = "color" | "motion" | "object" | "all" | "scan" | "yolo";
export type RobotMode = "follow" | "interact" | "play" | "manual";

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


