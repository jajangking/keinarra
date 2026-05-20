import type { DetectedObject, RobotState, PlayTarget, RobotMode } from "./types";

interface UpdateRobotOptions {
  robotMode: RobotMode;
  playTargets: PlayTarget[];
  onInteractionLog?: (msg: string) => void;
  onScore?: (score: number) => void;
}

export function updateRobot(
  detected: DetectedObject[],
  currentRobot: RobotState,
  options: UpdateRobotOptions
): RobotState {
  const { robotMode, playTargets, onInteractionLog, onScore } = options;
  const next = { ...currentRobot };
  const maxSpeed = 5;
  const deadZone = 30;

  if (robotMode === "follow") {
    if (detected.length > 0) {
      const target = detected[0];
      const tx = target.x + target.w / 2;
      const ty = target.y + target.h / 2;
      const dx = tx - next.x;
      const dy = ty - next.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > deadZone) {
        next.targetX = tx;
        next.targetY = ty;
        next.angle = Math.atan2(dy, dx);
        next.speed = Math.min(maxSpeed, dist * 0.05);
        next.state = "moving";
      } else {
        next.speed = 0;
        next.state = "interacting";
      }
    } else {
      next.speed = 0;
      next.state = "idle";
    }
  } else if (robotMode === "interact") {
    if (detected.length > 0) {
      const target = detected[0];
      const tx = target.x + target.w / 2;
      const ty = target.y + target.h / 2;
      const dx = tx - next.x;
      const dy = ty - next.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > deadZone * 2) {
        next.angle = Math.atan2(dy, dx);
        next.speed = Math.min(maxSpeed * 0.8, dist * 0.04);
        next.state = "moving";
      } else if (dist > deadZone) {
        next.speed = 0;
        next.state = "interacting";
        const obj = detected[0];
        const msg = `Mendeteksi: ${obj.label}${obj.similarity !== undefined ? ` (${Math.round(obj.similarity)}%)` : ""} di (${Math.round(tx)}, ${Math.round(ty)})`;
        onInteractionLog?.(msg);
      } else {
        next.speed = 0;
        next.state = "interacting";
      }
    } else {
      next.speed = 0;
      next.state = "idle";
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
        next.speed = Math.min(maxSpeed, dist * 0.06);
        next.state = "moving";
      }
    } else {
      next.speed = 0;
      next.state = "idle";
    }
  }

  next.x += Math.cos(next.angle) * next.speed;
  next.y += Math.sin(next.angle) * next.speed;
  next.x = Math.max(20, Math.min(640 - 20, next.x));
  next.y = Math.max(20, Math.min(480 - 20, next.y));
  next.battery = Math.max(0, next.battery - 0.01);

  return next;
}
