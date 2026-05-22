import type { DetectedObject, RobotState, PlayTarget, RobotMode, MotorState, BuzzerState } from "./types";

interface YoloTarget {
  x: number;
  y: number;
  w: number;
  h: number;
  distance: number | null;
  label: string;
}

interface UpdateRobotOptions {
  robotMode: RobotMode;
  playTargets: PlayTarget[];
  yoloTargets?: YoloTarget[];
  followDistance?: number;
  onInteractionLog?: (msg: string) => void;
  onScore?: (score: number) => void;
  motorOverride?: { leftSpeed: number; rightSpeed: number };
}

const FOLLOW_SPEED = 4;
const STOP_DISTANCE_M = 1.0;
const FRAME_W = 640;
const FRAME_H = 480;

function approachTarget(
  next: RobotState,
  tx: number,
  ty: number,
  stopDistPx: number,
  maxSpeed: number,
): RobotState {
  const dx = tx - next.x;
  const dy = ty - next.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > stopDistPx) {
    next.targetX = tx;
    next.targetY = ty;
    next.angle = Math.atan2(dy, dx);
    const speedFactor = Math.min(1, dist / 200);
    next.speed = Math.min(maxSpeed, maxSpeed * speedFactor);
    next.state = "moving";
  } else {
    next.speed = 0;
    next.state = "interacting";
  }
  return next;
}

export function updateRobot(
  detected: DetectedObject[],
  currentRobot: RobotState,
  options: UpdateRobotOptions
): RobotState {
  const { robotMode, playTargets, yoloTargets, followDistance, onInteractionLog, onScore } = options;
  const next = { ...currentRobot };

  const stopM = followDistance ?? STOP_DISTANCE_M;

  function updateMotorDisplay() {
    const base = Math.round((next.speed / FOLLOW_SPEED) * 255);
    next.motorLeft = Math.max(-255, Math.min(255, base));
    next.motorRight = Math.max(-255, Math.min(255, base));
  }

  if (robotMode === "follow") {
    const yolo = yoloTargets && yoloTargets.length > 0 ? yoloTargets[0] : null;

    if (yolo && yolo.distance != null) {
      const tx = yolo.x + yolo.w / 2;
      const ty = yolo.y + yolo.h / 2;
      const distM = yolo.distance;

      if (distM > stopM) {
        const dx = tx - next.x;
        const dy = ty - next.y;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        next.targetX = tx;
        next.targetY = ty;
        next.angle = Math.atan2(dy, dx);
        const speedFactor = Math.min(1, (distM - stopM) / 2);
        next.speed = Math.min(FOLLOW_SPEED, FOLLOW_SPEED * speedFactor);
        next.state = "moving";

        if (distPx < 60 && distM > stopM * 1.5) {
          next.speed = Math.min(FOLLOW_SPEED, FOLLOW_SPEED * 0.8);
        }
      } else {
        next.speed = 0;
        next.state = "interacting";
        onInteractionLog?.(`Berhenti di depan ${yolo.label} (${(distM * 100).toFixed(0)}cm)`);
      }
    } else if (detected.length > 0) {
      const target = detected[0];
      const tx = target.x + target.w / 2;
      const ty = target.y + target.h / 2;
      approachTarget(next, tx, ty, 30, FOLLOW_SPEED);
    } else {
      next.speed = 0;
      next.state = "idle";
    }
    updateMotorDisplay();
  } else if (robotMode === "interact") {
    if (detected.length > 0) {
      const target = detected[0];
      const tx = target.x + target.w / 2;
      const ty = target.y + target.h / 2;
      const dx = tx - next.x;
      const dy = ty - next.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 60) {
        next.angle = Math.atan2(dy, dx);
        next.speed = Math.min(FOLLOW_SPEED * 0.8, dist * 0.04);
        next.state = "moving";
      } else if (dist > 30) {
        next.speed = 0;
        next.state = "interacting";
        const msg = `Mendeteksi: ${detected[0].label} di (${Math.round(tx)}, ${Math.round(ty)})`;
        onInteractionLog?.(msg);
      } else {
        next.speed = 0;
        next.state = "interacting";
      }
    } else {
      next.speed = 0;
      next.state = "idle";
    }
    updateMotorDisplay();
  } else if (robotMode === "manual") {
    const motor = options.motorOverride;
    if (motor && (motor.leftSpeed !== 0 || motor.rightSpeed !== 0)) {
      const avgSpeed = (Math.abs(motor.leftSpeed) + Math.abs(motor.rightSpeed)) / 2;
      const diff = motor.rightSpeed - motor.leftSpeed;
      const turnFactor = diff / 510;
      next.angle += turnFactor * 0.1;
      const speedNorm = avgSpeed / 255;
      const dirLeft = motor.leftSpeed > 0 ? 1 : -1;
      const dirRight = motor.rightSpeed > 0 ? 1 : -1;
      const effectiveDir = (dirLeft + dirRight) / 2;
      next.speed = Math.min(FOLLOW_SPEED, FOLLOW_SPEED * speedNorm) * effectiveDir;
      next.state = "moving";
      next.motorLeft = Math.max(-255, Math.min(255, motor.leftSpeed));
      next.motorRight = Math.max(-255, Math.min(255, motor.rightSpeed));
    } else {
      next.speed = 0;
      next.state = "idle";
      next.motorLeft = 0;
      next.motorRight = 0;
    }
  } else if (robotMode === "play") {
    const activeTarget = playTargets.find(t => t.active);
    if (activeTarget) {
      const dx = activeTarget.x - next.x;
      const dy = activeTarget.y - next.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < activeTarget.radius + 20) {
        activeTarget.active = false;
        onScore?.(100);
        onInteractionLog?.("Target tercapai! +100");
      } else {
        next.angle = Math.atan2(dy, dx);
        next.speed = Math.min(FOLLOW_SPEED, dist * 0.06);
        next.state = "moving";
      }
    } else {
      next.speed = 0;
      next.state = "idle";
    }
    updateMotorDisplay();
  }

  next.x += Math.cos(next.angle) * next.speed;
  next.y += Math.sin(next.angle) * next.speed;
  next.x = Math.max(20, Math.min(FRAME_W - 20, next.x));
  next.y = Math.max(20, Math.min(FRAME_H - 20, next.y));
  next.battery = Math.max(0, next.battery - 0.01);

  return next;
}

export function robotStateToSerial(state: RobotState): string {
  const speedFactor = Math.min(1, state.speed / 4);
  const leftSpeed = Math.round(state.speed > 0 ? 255 * speedFactor : 0);
  const rightSpeed = Math.round(state.speed > 0 ? 255 * speedFactor : 0);
  return `MOTOR:${leftSpeed},${rightSpeed}`;
}

export function robotToMotors(state: RobotState): MotorState {
  const speedFactor = Math.min(1, state.speed / 4);
  const base = Math.round(255 * speedFactor);
  const turnFactor = state.speed > 0 ? 0 : 1;
  const left = state.speed > 0 ? base : 0;
  const right = state.speed > 0 ? base : 0;
  return { leftSpeed: left, rightSpeed: right };
}
