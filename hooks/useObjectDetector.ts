import { useRef, useState, useCallback, useEffect } from "react";
import { estimateDistanceFromBbox, estimateFocalLength } from "@/lib/vision/distance";

interface RtmlibDetection {
  bbox: { x1: number; y1: number; x2: number; y2: number; confidence: number };
  classId: number;
  className: string;
  confidence: number;
}

interface ObjectDetectorInstance {
  init(): Promise<void>;
  detectFromVideo(video: HTMLVideoElement): Promise<RtmlibDetection[]>;
  dispose(): void;
}

let ObjectDetector: new (config: unknown) => ObjectDetectorInstance;
let COCO_CLASSES: string[];
let loaded = false;

async function loadLibrary() {
  if (loaded) return;
  if (typeof window === "undefined") {
    throw new Error("rtmlib-ts can only be used in the browser");
  }
  const lib = await import("rtmlib-ts");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ObjectDetector = lib.ObjectDetector as any;
  COCO_CLASSES = lib.COCO_CLASSES;
  loaded = true;
}

export interface YoloDetection {
  id: string;
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
  classId: number;
  distance: number | null;
}

interface UseObjectDetectorOptions {
  enabled?: boolean;
  confidenceThreshold?: number;
  classes?: string[] | null;
  onDetections?: (detections: YoloDetection[]) => void;
  targetWidth?: number;
  targetHeight?: number;
  focalLength?: number;
}

const COLOR_MAP: Record<string, string> = {
  person: "#00ff00", bicycle: "#ff00ff", car: "#0000ff", motorcycle: "#ff0000",
  airplane: "#ffff00", bus: "#00ffff", train: "#ff8800", truck: "#8800ff",
  boat: "#0088ff", traffic_light: "#ff0088", fire_hydrant: "#88ff00",
  stop_sign: "#ff4444", parking_meter: "#44ff44", bench: "#4444ff",
  bird: "#ff8888", cat: "#88ff88", dog: "#8888ff", horse: "#ff88ff",
  sheep: "#88ffff", cow: "#ffff88", elephant: "#ffaa44", bear: "#aa44ff",
  zebra: "#44aaff", giraffe: "#ff44aa", backpack: "#aaff44", umbrella: "#44ffaa",
  handbag: "#aaffaa", tie: "#ffaaff", suitcase: "#aaaaff", frisbee: "#ffaaaa",
  skis: "#aaffff", snowboard: "#ffffaa", sports_ball: "#ff8844", kite: "#88ff44",
  baseball_bat: "#4488ff", baseball_glove: "#8844ff", skateboard: "#ff4488",
  surfboard: "#44ff88", tennis_racket: "#8844ff", bottle: "#44ffff",
  wine_glass: "#ff44ff", cup: "#ffff44", fork: "#444444", knife: "#888888",
  spoon: "#aaaaaa", bowl: "#cccccc", banana: "#ffdd00", apple: "#dd0000",
  sandwich: "#ddaa00", orange: "#ff8800", broccoli: "#00aa00", carrot: "#ff6600",
  hot_dog: "#cc4400", pizza: "#ffaa88", donut: "#aa88ff", cake: "#ff88aa",
  chair: "#888844", couch: "#448844", potted_plant: "#44aa44", bed: "#aa44aa",
  dining_table: "#884488", toilet: "#448888", tv: "#8888aa", laptop: "#aa8888",
  mouse: "#88aa88", remote: "#888888", keyboard: "#aaaa88", cell_phone: "#88aaaa",
  microwave: "#aa88aa", oven: "#88aa88", toaster: "#aaaaaa", sink: "#888888",
  refrigerator: "#aaaacc", book: "#cc8844", clock: "#88cc44", vase: "#4488cc",
  scissors: "#cc4488", teddy_bear: "#cc8888", hair_drier: "#88cc88",
  toothbrush: "#8888cc",
};

export function getYoloColor(className: string): string {
  return COLOR_MAP[className.toLowerCase().replace(/\s+/g, "_")] || "#ffffff";
}

export function useObjectDetector({
  enabled = true,
  confidenceThreshold = 0.4,
  classes = null,
  onDetections,
  targetWidth = 640,
  targetHeight = 480,
  focalLength,
}: UseObjectDetectorOptions = {}) {
  const detectorRef = useRef<ObjectDetectorInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState<YoloDetection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const animFrameRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const lastDetectTimeRef = useRef(0);
  const nextIdRef = useRef(1);
  const detectFnRef = useRef<((video: HTMLVideoElement) => void) | null>(null);
  const MODEL_PATH = typeof window !== "undefined" && window.location.origin
    ? "/models/efficientdet_lite0.tflite"
    : "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";

  const detectIntervalMs = 100;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setError("YOLO model loading timed out. Check your internet connection or try again.");
        }
      }, 120000);

      try {
        await loadLibrary();

        if (cancelled) return;

        try {
          const { FilesetResolver } = await import("@mediapipe/tasks-vision");
          const orig = FilesetResolver.forVisionTasks;
          FilesetResolver.forVisionTasks = function (path: string) {
            return orig.call(this, "/wasm");
          };
        } catch {
          // Fallback: use CDN
        }

        if (cancelled) return;

        const detectorConfig: Record<string, unknown> = {
          confidence: confidenceThreshold,
          cache: true,
          classes: classes ?? [],
          detectorType: "mediapipe",
          mediaPipeModelPath: MODEL_PATH,
          mediaPipeScoreThreshold: confidenceThreshold,
          mediaPipeMaxResults: 50,
        };

        const detector = new ObjectDetector(detectorConfig);

        await detector.init();

        if (cancelled) {
          detector.dispose();
          return;
        }

        if (timeoutId) clearTimeout(timeoutId);
        detectorRef.current = detector;
        setIsReady(true);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          if (timeoutId) clearTimeout(timeoutId);
          const msg = err instanceof Error ? err.message : "Failed to init YOLO detector";
          if (msg.includes("NetworkError") || msg.includes("Failed to fetch") || msg.includes("LOAD")) {
            setError("Cannot download YOLO model. Try using a different network or mode.");
          } else {
            setError(msg);
          }
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      detectorRef.current?.dispose();
      detectorRef.current = null;
      setIsReady(false);
    };
  }, [enabled, confidenceThreshold, classes]);

  const smoothDistRef = useRef<Map<string, number>>(new Map());

  const detectFrame = useCallback(async (video: HTMLVideoElement) => {
    if (!detectorRef.current || !video.readyState || video.readyState < 2 || video.videoWidth === 0 || video.paused) {
      animFrameRef.current = requestAnimationFrame(() => detectFnRef.current?.(video));
      return;
    }

    const now = performance.now();
    if (now - lastDetectTimeRef.current < detectIntervalMs) {
      animFrameRef.current = requestAnimationFrame(() => detectFnRef.current?.(video));
      return;
    }
    lastDetectTimeRef.current = now;

    try {
      const results = await detectorRef.current.detectFromVideo(video);

      if (!results || !Array.isArray(results)) {
        animFrameRef.current = requestAnimationFrame(() => detectFnRef.current?.(video));
        return;
      }

      const vw = video.videoWidth || targetWidth;
      const vh = video.videoHeight || targetHeight;
      const sx = targetWidth / vw;
      const sy = targetHeight / vh;
      const fl = focalLength ?? estimateFocalLength(targetWidth, targetHeight);
      const smooth = smoothDistRef.current;
      const alpha = 0.3;
      const mapped: YoloDetection[] = results.map((r: RtmlibDetection) => {
        const bw = (r.bbox.x2 - r.bbox.x1) * sx;
        const bh = (r.bbox.y2 - r.bbox.y1) * sy;
        const raw = estimateDistanceFromBbox(bw, bh, r.className, fl, targetHeight);
        const prev = smooth.get(r.className);
        let dist: number | null;
        if (raw != null && prev != null) {
          dist = alpha * raw + (1 - alpha) * prev;
        } else {
          dist = raw;
        }
        if (dist != null) smooth.set(r.className, dist);
        return {
          id: `yolo-${nextIdRef.current++}`,
          label: r.className,
          confidence: r.confidence,
          x: r.bbox.x1 * sx,
          y: r.bbox.y1 * sy,
          w: bw,
          h: bh,
          classId: r.classId,
          distance: dist,
        };
      });

      setDetections(mapped);
      onDetections?.(mapped);

      frameCountRef.current++;
      const fpsNow = performance.now();
      if (fpsNow - lastFpsTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = fpsNow;
      }
    } catch (err) {
      console.warn("[YOLO] Frame detection error:", err);
    }

    animFrameRef.current = requestAnimationFrame(() => detectFnRef.current?.(video));
  }, [onDetections]);

  useEffect(() => {
    detectFnRef.current = detectFrame;
  }, [detectFrame]);

  const start = useCallback((video: HTMLVideoElement) => {
    if (!isReady || !detectorRef.current) return;
    videoRef.current = video;
    setIsDetecting(true);
    lastFpsTimeRef.current = performance.now();
    frameCountRef.current = 0;
    animFrameRef.current = requestAnimationFrame(() => detectFrame(video));
  }, [isReady, detectFrame]);

  const stop = useCallback(() => {
    setIsDetecting(false);
    setDetections([]);
    setFps(0);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const getColor = useCallback((className: string) => {
    return COLOR_MAP[className] || "#ffffff";
  }, []);

  return {
    isReady,
    isDetecting,
    detections,
    error,
    fps,
    start,
    stop,
    getColor,
    availableClasses: COCO_CLASSES || [],
  };
}
