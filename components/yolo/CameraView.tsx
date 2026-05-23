"use client";

// Suppress TFLite internal noise from console
if (typeof console !== "undefined") {
  const tfliteMsg = (a: unknown) => typeof a === "string" && (a.includes("TensorFlow") || a.includes("XNNPACK"));
  const origInfo = console.info.bind(console);
  console.info = (...args) => { if (args.some(tfliteMsg)) return; origInfo(...args); };
  const origLog = console.log.bind(console);
  console.log = (...args) => { if (args.some(tfliteMsg)) return; origLog(...args); };
}

import { useRef, useState, useCallback, useEffect } from "react";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";
const WASM_PATH = "/wasm";

async function initDetector() {
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Failed to fetch model: HTTP ${res.status}`);
  const modelBuffer = await res.arrayBuffer();
  const detector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer) },
    scoreThreshold: 0.5,
    maxResults: 50,
  });
  return detector;
}

const W = 640;
const H = 480;

const COLOR_MAP: Record<string, string> = {
  person: "#22c55e", bicycle: "#a855f7", car: "#3b82f6",
  cat: "#f59e0b", dog: "#ef4444", bottle: "#06b6d4",
  cup: "#8b5cf6", chair: "#78716c",
};

function getColor(label: string): string {
  return COLOR_MAP[label.toLowerCase()] || "#a855f7";
}

export interface Detection {
  id: string;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CameraViewProps {
  onDetections?: (dets: Detection[]) => void;
  onReady?: (ready: boolean) => void;
  onFps?: (fps: number) => void;
  lockedId?: string | null;
  onLock?: (id: string | null) => void;
  customDrawMode?: boolean;
  customBox?: { x: number; y: number; w: number; h: number } | null;
  onCustomBox?: (box: { x: number; y: number; w: number; h: number } | null) => void;
  onCustomTracking?: (det: { x: number; y: number; w: number; h: number; confidence: number } | null) => void;
  hideYolo?: boolean;
}

export function CameraView({ onDetections, onReady, onFps, lockedId, onLock, customDrawMode, customBox, onCustomBox, onCustomTracking, hideYolo }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (frame: ImageData) => Promise<{ label: string; confidence: number; x: number; y: number; w: number; h: number }[]> } | null>(null);
  const nextIdRef = useRef(1);
  const frameRef = useRef<ImageData | null>(null);
  const detectionsRef = useRef<Detection[]>([]);
  const cameraRef = useRef<HTMLDivElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [yoloReady, setYoloReady] = useState(false);
  const [boxes, setBoxes] = useState<Detection[]>([]);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drawingRect, setDrawingRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [trackedBox, setTrackedBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Template matching for custom tracking
  const customTemplateRef = useRef<Float32Array | null>(null);
  const customTemplateWRef = useRef(0);
  const customTemplateHRef = useRef(0);
  const customTrackPosRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const customBoxIdRef = useRef(0);
  const prevCustomBoxRef = useRef<typeof customBox>(null);

  // Init YOLO
  useEffect(() => {
    let cancelled = false;
    let detector: Awaited<ReturnType<typeof initDetector>> | null = null;
    (async () => {
      try {
        detector = await initDetector();
        if (!cancelled) {
          const det = detector;
          detectorRef.current = {
            detect: async (frame: ImageData) => {
              const off = document.createElement("canvas");
              off.width = frame.width; off.height = frame.height;
              const ctx = off.getContext("2d")!;
              ctx.putImageData(frame, 0, 0);
              const result = await det.detect(off);
              if (!result.detections) return [];
              return result.detections.map(d => {
                const cat = d.categories?.[0];
                const box = d.boundingBox;
                if (!cat || !box) return null;
                return {
                  label: cat.categoryName,
                  confidence: cat.score,
                  x: box.originX,
                  y: box.originY,
                  w: box.width,
                  h: box.height,
                };
              }).filter(Boolean) as { label: string; confidence: number; x: number; y: number; w: number; h: number }[];
            },
          };
          setYoloReady(true);
          onReady?.(true);
        } else {
          detector?.close();
        }
      } catch (e) {
        console.error("YOLO init error:", e);
        onReady?.(false);
      }
    })();
    return () => {
      cancelled = true;
      detector?.close();
    };
  }, [onReady]);

  // Camera
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: W, height: H, facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamRef.current = stream;
      setIsRunning(true);
    } catch (err) {
      console.error("Camera error:", err);
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRunning(false);
    setBoxes([]);
  }, []);

  // Process frames
  const animRef = useRef(0);
  const detTimerRef = useRef(0);
  const fpsCountRef = useRef(0);
  const fpsTimeRef = useRef(0);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(processFrame);
      return;
    }
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, W, H);
    frameRef.current = ctx.getImageData(0, 0, W, H);

    fpsCountRef.current++;
    const now = performance.now();
    if (now - fpsTimeRef.current >= 1000) {
      onFps?.(fpsCountRef.current);
      fpsCountRef.current = 0;
      fpsTimeRef.current = now;
    }
    animRef.current = requestAnimationFrame(processFrame);
  }, [onFps]);

  const smoothPosRef = useRef<{ x: number; y: number } | null>(null);

  const runTemplateMatch = useCallback(() => {
    const tpl = customTemplateRef.current;
    const lastPos = customTrackPosRef.current;
    const frame = frameRef.current;
    if (!tpl || !lastPos || !frame || !onCustomTracking) return;
    const stride = 2;
    const tw = customTemplateWRef.current;
    const th = customTemplateHRef.current;
    const tplData = tpl;
    const frameData = frame.data;
    const searchR = 40;
    const step = 2;
    let bestScore = Infinity;
    let bestX = lastPos.x;
    let bestY = lastPos.y;
    const sx = Math.max(0, lastPos.x - searchR);
    const sy = Math.max(0, lastPos.y - searchR);
    const ex = Math.min(W - tw * stride, lastPos.x + searchR);
    const ey = Math.min(H - th * stride, lastPos.y + searchR);
    for (let y = sy; y <= ey; y += step) {
      for (let x = sx; x <= ex; x += step) {
        let score = 0;
        for (let ty = 0; ty < th && score < bestScore; ty++) {
          for (let tx = 0; tx < tw && score < bestScore; tx++) {
            const fi = ((y + ty * stride) * W + (x + tx * stride)) * 4;
            const ti = (ty * tw + tx) * 3;
            score += Math.abs(frameData[fi] - tplData[ti]);
            score += Math.abs(frameData[fi + 1] - tplData[ti + 1]);
            score += Math.abs(frameData[fi + 2] - tplData[ti + 2]);
          }
        }
        if (score < bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }
    // Init or update smooth position
    if (!smoothPosRef.current) {
      smoothPosRef.current = { x: bestX, y: bestY };
    }
    const smoothFactor = 0.5;
    smoothPosRef.current.x += (bestX - smoothPosRef.current.x) * smoothFactor;
    smoothPosRef.current.y += (bestY - smoothPosRef.current.y) * smoothFactor;
    customTrackPosRef.current = { x: smoothPosRef.current.x, y: smoothPosRef.current.y, w: lastPos.w, h: lastPos.h };
    const trackedPct = {
      x: (smoothPosRef.current.x / W) * 100,
      y: (smoothPosRef.current.y / H) * 100,
      w: (lastPos.w / W) * 100,
      h: (lastPos.h / H) * 100,
    };
    setTrackedBox(trackedPct);
    onCustomTracking({ ...trackedPct, confidence: Math.max(0, 1 - bestScore / (tw * th * 3 * 255)) });
  }, [onCustomTracking]);

  const runDetection = useCallback(async () => {
    if (!detectorRef.current || !frameRef.current) {
      detTimerRef.current = window.setTimeout(runDetection, 100);
      return;
    }
    try {
      const raw = await detectorRef.current.detect(frameRef.current);
      const mapped: Detection[] = raw.map(r => ({
        id: `d-${nextIdRef.current++}`,
        label: r.label, confidence: r.confidence,
        x: r.x, y: r.y, w: r.w, h: r.h,
      }));
      setBoxes(mapped);
      detectionsRef.current = mapped;
      // Run template matching for custom tracking
      runTemplateMatch();
      onDetections?.(mapped);
    } catch {}
    detTimerRef.current = window.setTimeout(runDetection, 100);
  }, [onDetections, runTemplateMatch]);

  useEffect(() => {
    if (isRunning && yoloReady) {
      fpsTimeRef.current = performance.now();
      animRef.current = requestAnimationFrame(processFrame);
      detTimerRef.current = window.setTimeout(runDetection, 100);
    }
    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(detTimerRef.current);
      setBoxes([]);
    };
  }, [isRunning, yoloReady, processFrame, runDetection]);

  // Custom drawing handlers (use refs to avoid async state issues)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!customDrawMode || !cameraRef.current) return;
    const rect = cameraRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const r = { x, y, w: 0, h: 0 };
    drawStartRef.current = { x, y };
    drawRectRef.current = r;
    setDrawingRect(r);
  }, [customDrawMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!customDrawMode || !drawStartRef.current || !cameraRef.current) return;
    const rect = cameraRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const start = drawStartRef.current;
    const r = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    };
    drawRectRef.current = r;
    setDrawingRect(r);
  }, [customDrawMode]);

  const handlePointerUp = useCallback(() => {
    if (!customDrawMode || !drawStartRef.current || !onCustomBox) return;
    drawStartRef.current = null;
    const r = drawRectRef.current;
    drawRectRef.current = null;
    if (!r || (r.w < 2 && r.h < 2)) {
      setDrawingRect(null);
      return;
    }
    onCustomBox(r);
    setDrawingRect(null);
  }, [customDrawMode, onCustomBox]);

  // Capture template when custom box is drawn or changes
  useEffect(() => {
    if (!customBox) {
      customTemplateRef.current = null;
      customTrackPosRef.current = null;
      setTrackedBox(null);
      prevCustomBoxRef.current = null;
      smoothPosRef.current = null;
      onCustomTracking?.(null);
      return;
    }
    // Skip if same box as before (no change)
    if (prevCustomBoxRef.current && prevCustomBoxRef.current.x === customBox.x && prevCustomBoxRef.current.y === customBox.y && prevCustomBoxRef.current.w === customBox.w && prevCustomBoxRef.current.h === customBox.h) {
      return;
    }
    prevCustomBoxRef.current = customBox;
    const frame = frameRef.current;
    if (!frame || !isRunning) return;
    const px = Math.max(0, Math.round((customBox.x / 100) * W));
    const py = Math.max(0, Math.round((customBox.y / 100) * H));
    const pw = Math.max(4, Math.round((customBox.w / 100) * W));
    const ph = Math.max(4, Math.round((customBox.h / 100) * H));
    const stride = 2;
    const tw = Math.max(2, Math.floor(pw / stride));
    const th = Math.max(2, Math.floor(ph / stride));
    const tpl = new Float32Array(tw * th * 3);
    const data = frame.data;
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const fi = ((py + ty * stride) * W + (px + tx * stride)) * 4;
        const ti = (ty * tw + tx) * 3;
        tpl[ti] = data[fi];
        tpl[ti + 1] = data[fi + 1];
        tpl[ti + 2] = data[fi + 2];
      }
    }
    customTemplateRef.current = tpl;
    customTemplateWRef.current = tw;
    customTemplateHRef.current = th;
    customTrackPosRef.current = { x: px, y: py, w: pw, h: ph };
    smoothPosRef.current = null;
    customBoxIdRef.current++;
  }, [customBox, isRunning]);

  return (
    <div ref={cameraRef} className="absolute inset-0 bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {!isRunning && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90" style={{ zIndex: 5 }}>
          <p className="text-zinc-600 text-xs font-mono">[ START ]</p>
        </div>
      )}
      {isRunning && !hideYolo && boxes.map(d => {
        const pctX = (d.x / W) * 100;
        const pctY = (d.y / H) * 100;
        const pctW = (d.w / W) * 100;
        const pctH = (d.h / H) * 100;
        const color = getColor(d.label);
        const isLocked = lockedId === d.id;
        return (
          <div
            key={d.id}
            className="absolute"
            style={{ zIndex: isLocked ? 5 : 3, left: `${pctX}%`, top: `${pctY}%`, width: `${pctW}%`, height: `${pctH}%` }}
            onClick={() => onLock?.(isLocked ? null : d.id)}
          >
            <div
              className="absolute inset-0 transition-all duration-200"
              style={{
                border: `${isLocked ? 3 : 2}px solid ${isLocked ? "#06b6d4" : color}`,
                borderRadius: 2,
                backgroundColor: isLocked ? "rgba(6, 182, 212, 0.12)" : "transparent",
                boxShadow: isLocked ? "0 0 20px rgba(6, 182, 212, 0.5)" : undefined,
              }}
            />
            <div
              className="absolute -top-4 left-0 px-1 rounded text-[9px] font-mono whitespace-nowrap transition-all duration-200"
              style={{
                backgroundColor: isLocked ? "#06b6d4" : color,
                color: "#000",
                lineHeight: "14px",
                boxShadow: isLocked ? "0 0 12px rgba(6, 182, 212, 0.6)" : undefined,
              }}
            >
              {d.label} {Math.round(d.confidence * 100)}%
              {isLocked ? " 🔒" : ""}
            </div>
            {isLocked && (
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-400 animate-pulse whitespace-nowrap pointer-events-none">
                LOCKED
              </div>
            )}
          </div>
        );
      })}

      {/* Drawing overlay */}
      {customDrawMode && (
        <div
          className="absolute inset-0 touch-none"
          style={{ zIndex: 7, cursor: "crosshair" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      )}
      {drawingRect && (
        <div
          className="absolute pointer-events-none"
          style={{
            zIndex: 8,
            left: `${drawingRect.x}%`,
            top: `${drawingRect.y}%`,
            width: `${drawingRect.w}%`,
            height: `${drawingRect.h}%`,
            border: "2px dashed #fbbf24",
            backgroundColor: "rgba(251, 191, 36, 0.1)",
          }}
        />
      )}
      {(trackedBox || customBox) && (
        <div
          className="absolute pointer-events-none"
          style={{
            zIndex: 4,
            left: `${(trackedBox || customBox)!.x}%`,
            top: `${(trackedBox || customBox)!.y}%`,
            width: `${(trackedBox || customBox)!.w}%`,
            height: `${(trackedBox || customBox)!.h}%`,
            border: "2px solid #f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            boxShadow: "0 0 12px rgba(245, 158, 11, 0.3)",
          }}
        >
          <div className="absolute -top-4 left-0 px-1 rounded text-[9px] font-mono whitespace-nowrap bg-amber-500 text-black leading-[14px]">
            CUSTOM {trackedBox ? "🎯" : ""}
          </div>
        </div>
      )}

      {/* Start/Stop button overlay */}
      <div className="absolute top-2 right-2" style={{ zIndex: 6 }}>
        <button
          onClick={isRunning ? stop : start}
          className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${
            isRunning ? "bg-red-600/30 text-red-400" : "bg-green-600/30 text-green-400"
          }`}
        >
          {isRunning ? "STOP" : "START"}
        </button>
      </div>
    </div>
  );
}
