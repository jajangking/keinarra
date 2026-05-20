import { useRef, useState, useCallback, useEffect } from "react";
import type { DetectedObject, RobotState, PlayTarget, RobotMode, DebugLogEntry, HybridProfile } from "@/lib/vision/types";
import type { CustomColorRange } from "@/lib/vision/color";
import { processFrame } from "@/lib/vision/detection";
import { updateRobot } from "@/lib/vision/robot";

const W = 640;
const H = 480;

interface UseVisionProcessorOptions {
  mode: string;
  targetColor: string;
  colorThreshold: number;
  motionThreshold: number;
  minMotionArea: number;
  customRangeRef?: React.MutableRefObject<CustomColorRange | null>;
  colorLabel?: string | null;
  hybridProfileRef?: React.MutableRefObject<HybridProfile | null>;
  robotMode: RobotMode;
  playTargets: PlayTarget[];
  onInteractionLog: (msg: string) => void;
  onScore: (delta: number) => void;
  onDebugLog: (log: DebugLogEntry) => void;
}

export function useVisionProcessor(options: UseVisionProcessorOptions, containerRef: React.RefObject<HTMLDivElement | null>) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const trackedObjectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number; lastSeen: number }>>(new Map());
  const frameCountRef = useRef(0);
  const nextIdRef = useRef(1);
  const optionsRef = useRef(options);
  const liveDetectionsRef = useRef<{ x: number; y: number; w: number; h: number; id: string; similarity?: number }[]>([]);
  const robotState = useRef<RobotState>({
    x: W / 2, y: H / 2, angle: 0, speed: 0,
    targetX: W / 2, targetY: H / 2, state: "idle", battery: 100,
  });

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [robot, setRobot] = useState<RobotState>(robotState.current);
  const frameCounterRef = useRef(0);

  const handleFrame = useCallback((frame: ImageData) => {
    const opts = optionsRef.current;
    const detected = processFrame(frame, {
      mode: opts.mode,
      targetColor: opts.targetColor,
      colorThreshold: opts.colorThreshold,
      motionThreshold: opts.motionThreshold,
      minMotionArea: opts.minMotionArea,
      customRange: opts.customRangeRef?.current ?? null,
      colorLabel: opts.colorLabel,
      hybridProfile: opts.hybridProfileRef?.current ?? null,
      trackedObjectsRef,
      frameCountRef,
      nextIdRef,
      prevFrameRef,
      onDebugLog: opts.onDebugLog,
    });

    const updatedRobot = updateRobot(detected, robotState.current, {
      robotMode: opts.robotMode,
      playTargets: opts.playTargets,
      onInteractionLog: opts.onInteractionLog,
      onScore: opts.onScore,
    });

    robotState.current = updatedRobot;
    frameCounterRef.current++;
    liveDetectionsRef.current = detected.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, id: o.id, similarity: o.similarity }));

    if (frameCounterRef.current % 3 === 0) {
      queueMicrotask(() => {
        setRobot({ ...updatedRobot });
        setObjects([...detected]);
      });
    }

    const container = containerRef.current;
    const videoEl = document.querySelector("video") as HTMLVideoElement | null;
    const dw = videoEl?.clientWidth || container?.clientWidth || W;
    const dh = videoEl?.clientHeight || container?.clientHeight || H;
    if (dw > 0 && dh > 0) {
      renderOverlay(detected, updatedRobot, dw, dh);
    }
  }, []);

  const renderOverlay = useCallback((detected: DetectedObject[], currentRobot: RobotState, displayW: number, displayH: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const octx = overlay.getContext("2d");
    if (!octx) return;

    overlay.width = displayW;
    overlay.height = displayH;
    octx.clearRect(0, 0, displayW, displayH);

    if (detected.length === 0) {
      octx.fillStyle = "rgba(0, 255, 0, 0.05)";
      octx.fillRect(0, 0, displayW, displayH);
    }

    const scaleX = displayW / W;
    const scaleY = displayH / H;

    const colorMap: Record<string, string> = {
      red: "#ff0000", green: "#00ff00", blue: "#0000ff",
      yellow: "#ffff00", orange: "#ff8800", custom: "#ff00ff",
      cyan: "#00ffff", white: "#ffffff",
    };

    for (const obj of detected) {
      const c = obj.color && colorMap[obj.color]
        ? colorMap[obj.color]
        : obj.label === "Motion" ? "#00ffff"
        : obj.label === "Object" ? "#ffffff"
        : "#00ff00";
      const ox = obj.x * scaleX;
      const oy = obj.y * scaleY;
      const ow = obj.w * scaleX;
      const oh = obj.h * scaleY;
      octx.strokeStyle = c;
      octx.lineWidth = 3;
      octx.shadowColor = c;
      octx.shadowBlur = 6;
      octx.strokeRect(ox, oy, ow, oh);
      octx.shadowBlur = 0;

      octx.fillStyle = c;
      octx.font = "bold 16px monospace";
      octx.fillText(`${obj.id} ${obj.label}`, ox + 2, oy - 6);
      const extraText = obj.similarity !== undefined ? `${Math.round(obj.similarity)}%` : `${Math.round(obj.w)}x${Math.round(obj.h)}`;
      octx.fillText(extraText, ox + 2, oy + oh + 18);

      const cx = ox + ow / 2;
      const cy = oy + oh / 2;
      octx.beginPath();
      octx.arc(cx, cy, 5, 0, Math.PI * 2);
      octx.fillStyle = c;
      octx.fill();
    }

    const rx = currentRobot.x * scaleX;
    const ry = currentRobot.y * scaleY;
    const rSize = 20 * scaleX;

    octx.save();
    octx.translate(rx, ry);
    octx.rotate(currentRobot.angle);

    octx.fillStyle = "#00aaff";
    octx.beginPath();
    octx.moveTo(rSize, 0);
    octx.lineTo(-rSize * 0.7, -rSize * 0.6);
    octx.lineTo(-rSize * 0.4, 0);
    octx.lineTo(-rSize * 0.7, rSize * 0.6);
    octx.closePath();
    octx.fill();
    octx.strokeStyle = "#0088dd";
    octx.lineWidth = 2;
    octx.stroke();

    octx.fillStyle = "#ffffff";
    octx.beginPath();
    octx.arc(rSize * 0.3, -rSize * 0.2, 3, 0, Math.PI * 2);
    octx.arc(rSize * 0.3, rSize * 0.2, 3, 0, Math.PI * 2);
    octx.fill();

    octx.restore();

    if (currentRobot.state === "moving") {
      octx.strokeStyle = "#00aaff44";
      octx.lineWidth = 1;
      octx.setLineDash([4, 4]);
      octx.beginPath();
      octx.moveTo(rx, ry);
      octx.lineTo(currentRobot.targetX * scaleX, currentRobot.targetY * scaleY);
      octx.stroke();
      octx.setLineDash([]);
    }

    const opts = optionsRef.current;
    if (opts.robotMode === "play") {
      for (const target of opts.playTargets) {
        if (target.active) {
          octx.strokeStyle = target.color;
          octx.lineWidth = 3;
          octx.beginPath();
          octx.arc(target.x * scaleX, target.y * scaleY, target.radius * scaleX, 0, Math.PI * 2);
          octx.stroke();

          octx.fillStyle = target.color + "33";
          octx.fill();

          octx.fillStyle = target.color;
          octx.font = "bold 16px monospace";
          octx.textAlign = "center";
          octx.fillText("TARGET", target.x * scaleX, target.y * scaleY + 5);
          octx.textAlign = "left";
        }
      }
    }
  }, []);

  return { overlayRef, handleFrame, objects, robot, setRobot, liveDetectionsRef };
}
