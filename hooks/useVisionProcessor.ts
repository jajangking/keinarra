import { useRef, useState, useCallback, useEffect } from "react";
import type { DetectedObject, RobotState, PlayTarget, RobotMode, DebugLogEntry } from "@/lib/vision/types";
import type { CustomColorRange } from "@/lib/vision/color";
import { processFrame } from "@/lib/vision/detection";
import { updateRobot } from "@/lib/vision/robot";

const W = 640;
const H = 480;

interface UseVisionProcessorOptions {
  mode: string;
  targetColor: string;
  colorTolerance: number;
  colorMinArea: number;
  motionThreshold: number;
  motionMinArea: number;
  edgeThreshold: number;
  objectMinArea: number;
  customRangeRef?: React.MutableRefObject<CustomColorRange | null>;
  colorLabel?: string | null;
  robotMode: RobotMode;
  playTargets: PlayTarget[];
  onInteractionLog: (msg: string) => void;
  onScore: (delta: number) => void;
  onDebugLog: (log: DebugLogEntry) => void;
}

const initialRobotState: RobotState = {
  x: W / 2, y: H / 2, angle: 0, speed: 0,
  targetX: W / 2, targetY: H / 2, state: "idle", battery: 100,
};

const COLOR_MAP: Record<string, string> = {
  red: "#ff0000", green: "#00ff00", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ff8800", custom: "#ff00ff",
  cyan: "#00ffff", white: "#ffffff",
};

export function useVisionProcessor(options: UseVisionProcessorOptions, containerRef: React.RefObject<HTMLDivElement | null>) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const trackedObjectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number; lastSeen: number }>>(new Map());
  const frameCountRef = useRef(0);
  const nextIdRef = useRef(1);
  const optionsRef = useRef(options);
  const liveDetectionsRef = useRef<{ x: number; y: number; w: number; h: number; id: string; similarity?: number }[]>([]);
  const robotState = useRef<RobotState>({ ...initialRobotState });
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const videoEl = document.querySelector("video");
    if (!videoEl) return;
    videoElRef.current = videoEl;

    const syncSize = () => {
      const overlay = overlayRef.current;
      if (!overlay || !videoElRef.current) return;
      const vw = videoElRef.current.clientWidth;
      const vh = videoElRef.current.clientHeight;
      if (vw > 0 && vh > 0 && (overlay.width !== vw || overlay.height !== vh)) {
        overlay.width = vw;
        overlay.height = vh;
        overlayCtxRef.current = overlay.getContext("2d");
      }
    };

    syncSize();

    const observer = new ResizeObserver(syncSize);
    observer.observe(videoEl);

    return () => observer.disconnect();
  }, []);

  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [robot, setRobot] = useState<RobotState>(initialRobotState);
  const frameCounterRef = useRef(0);

  const renderOverlay = useCallback((detected: DetectedObject[], currentRobot: RobotState, displayW: number, displayH: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (overlay.width !== displayW || overlay.height !== displayH) {
      overlay.width = displayW;
      overlay.height = displayH;
      overlayCtxRef.current = overlay.getContext("2d");
    }

    const octx = overlayCtxRef.current;
    if (!octx) return;

    octx.clearRect(0, 0, displayW, displayH);

    const videoEl = videoElRef.current;
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return;

    const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
    const displayAspect = displayW / displayH;

    let drawW = displayW;
    let drawH = displayH;
    let offsetX = 0;
    let offsetY = 0;

    if (displayAspect > videoAspect) {
      drawH = displayW / videoAspect;
      offsetY = (displayH - drawH) / 2;
    } else {
      drawW = displayH * videoAspect;
      offsetX = (displayW - drawW) / 2;
    }

    const scaleX = drawW / W;
    const scaleY = drawH / H;

    if (detected.length === 0) {
      octx.fillStyle = "rgba(0, 255, 0, 0.05)";
      octx.fillRect(0, 0, displayW, displayH);
    }

    for (const obj of detected) {
      const c = obj.color && COLOR_MAP[obj.color]
        ? COLOR_MAP[obj.color]
        : obj.label === "Motion" ? "#00ffff"
        : obj.label === "Object" ? "#ffffff"
        : "#00ff00";

      const pad = 4;
      const ox = obj.x * scaleX + offsetX - pad;
      const oy = obj.y * scaleY + offsetY - pad;
      const ow = obj.w * scaleX + pad * 2;
      const oh = obj.h * scaleY + pad * 2;

      octx.strokeStyle = c;
      octx.lineWidth = 2;
      octx.strokeRect(ox, oy, ow, oh);

      const label = `${obj.label}`;
      const detail = obj.similarity !== undefined ? `${Math.round(obj.similarity)}%` : `${Math.round(obj.w)}×${Math.round(obj.h)}`;
      const fullLabel = `${label} ${detail}`;

      octx.font = "bold 12px monospace";
      const textW = octx.measureText(fullLabel).width;
      const bgH = 18;

      octx.fillStyle = c;
      octx.fillRect(ox, oy - bgH - 2, textW + 8, bgH);
      octx.fillStyle = "#000";
      octx.fillText(fullLabel, ox + 4, oy - 6);

      const cx = ox + ow / 2;
      const cy = oy + oh / 2;
      octx.beginPath();
      octx.arc(cx, cy, 3, 0, Math.PI * 2);
      octx.fillStyle = c;
      octx.fill();
    }

    const rx = currentRobot.x * scaleX + offsetX;
    const ry = currentRobot.y * scaleY + offsetY;
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
      octx.lineTo((currentRobot.targetX * scaleX) + offsetX, (currentRobot.targetY * scaleY) + offsetY);
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
          octx.arc((target.x * scaleX) + offsetX, (target.y * scaleY) + offsetY, target.radius * scaleX, 0, Math.PI * 2);
          octx.stroke();

          octx.fillStyle = target.color + "33";
          octx.fill();

          octx.fillStyle = target.color;
          octx.font = "bold 16px monospace";
          octx.textAlign = "center";
          octx.fillText("TARGET", (target.x * scaleX) + offsetX, (target.y * scaleY) + offsetY + 5);
          octx.textAlign = "left";
        }
      }
    }
  }, []);

  const handleFrame = useCallback((frame: ImageData) => {
    const opts = optionsRef.current;

    const detected = processFrame(frame, {
      mode: opts.mode,
      targetColor: opts.targetColor,
      colorTolerance: opts.colorTolerance,
      colorMinArea: opts.colorMinArea,
      motionThreshold: opts.motionThreshold,
      motionMinArea: opts.motionMinArea,
      edgeThreshold: opts.edgeThreshold,
      objectMinArea: opts.objectMinArea,
      customRange: opts.customRangeRef?.current ?? null,
      colorLabel: opts.colorLabel,
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
    liveDetectionsRef.current = detected;

    if (frameCounterRef.current % 3 === 0) {
      setRobot(updatedRobot);
      setObjects(detected);
    }

    const videoEl = videoElRef.current;
    if (videoEl && videoEl.clientWidth > 0 && videoEl.clientHeight > 0) {
      renderOverlay(detected, updatedRobot, videoEl.clientWidth, videoEl.clientHeight);
    }
  }, [renderOverlay]);

  return { overlayRef, handleFrame, objects, robot, setRobot, liveDetectionsRef };
}
