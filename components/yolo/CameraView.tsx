"use client";

import { useRef, useState, useCallback, useEffect } from "react";

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
}

export function CameraView({ onDetections, onReady, onFps }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (frame: ImageData) => Promise<{ label: string; confidence: number; x: number; y: number; w: number; h: number }[]> } | null>(null);
  const nextIdRef = useRef(1);
  const frameRef = useRef<ImageData | null>(null);
  const detectionsRef = useRef<Detection[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [yoloReady, setYoloReady] = useState(false);
  const [boxes, setBoxes] = useState<Detection[]>([]);

  // Init YOLO
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await import("rtmlib-ts");
        const { ObjectDetector } = lib;
        const det = new (ObjectDetector as new (config: unknown) => {
          init(): Promise<void>;
          detectFromCanvas(canvas: HTMLCanvasElement): Promise<{ bbox: { x1: number; y1: number; x2: number; y2: number }; className: string; confidence: number }[]>;
          dispose(): void;
        })({
          confidence: 0.5, cache: true, detectorType: "mediapipe",
          mediaPipeModelPath: "/models/efficientdet_lite0.tflite",
          mediaPipeScoreThreshold: 0.5, mediaPipeMaxResults: 50,
        });
        await det.init();
        if (!cancelled) {
          detectorRef.current = {
            detect: async (frame: ImageData) => {
              const off = document.createElement("canvas");
              off.width = frame.width; off.height = frame.height;
              const ctx = off.getContext("2d")!;
              ctx.putImageData(frame, 0, 0);
              const r = await det.detectFromCanvas(off);
              return r.map(d => ({
                label: d.className, confidence: d.confidence,
                x: d.bbox.x1, y: d.bbox.y1,
                w: d.bbox.x2 - d.bbox.x1, h: d.bbox.y2 - d.bbox.y1,
              }));
            },
          };
          setYoloReady(true);
          onReady?.(true);
        }
      } catch (e) {
        console.error("YOLO init error:", e);
        onReady?.(false);
      }
    })();
    return () => { cancelled = true; };
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
      onDetections?.(mapped);
    } catch {}
    detTimerRef.current = window.setTimeout(runDetection, 100);
  }, [onDetections]);

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

  return (
    <div className="absolute inset-0 bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {!isRunning && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90" style={{ zIndex: 5 }}>
          <p className="text-zinc-600 text-xs font-mono">[ START ]</p>
        </div>
      )}
      {isRunning && boxes.map(d => {
        const pctX = (d.x / W) * 100;
        const pctY = (d.y / H) * 100;
        const pctW = (d.w / W) * 100;
        const pctH = (d.h / H) * 100;
        const color = getColor(d.label);
        return (
          <div key={d.id} className="absolute pointer-events-none" style={{ zIndex: 3, left: `${pctX}%`, top: `${pctY}%`, width: `${pctW}%`, height: `${pctH}%` }}>
            <div className="absolute inset-0" style={{ border: `2px solid ${color}`, borderRadius: 2 }} />
            <div className="absolute -top-4 left-0 px-1 rounded text-[9px] font-mono whitespace-nowrap" style={{ backgroundColor: color, color: "#000", lineHeight: "14px" }}>
              {d.label} {Math.round(d.confidence * 100)}%
            </div>
          </div>
        );
      })}

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
