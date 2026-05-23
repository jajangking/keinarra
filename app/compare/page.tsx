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

const W = 640;
const H = 480;
const YOLO_SIZE = 640;
const CONF_THRESHOLD = 0.4;
const IOU_THRESHOLD = 0.5;

const YOLO_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
  "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
  "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
  "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
  "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
  "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
  "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake",
  "chair","couch","potted plant","bed","dining table","toilet","tv","laptop",
  "mouse","remote","keyboard","cell phone","microwave","oven","toaster","sink",
  "refrigerator","book","clock","vase","scissors","teddy bear","hair drier","toothbrush",
];

interface Detection {
  id: string;
  modelId: string;
  label: string;
  confidence: number;
  x: number; y: number; w: number; h: number;
}

interface ModelRuntime {
  detect: (frame: ImageData) => Promise<Detection[]>;
  dispose: () => void;
}

interface ModelState {
  status: "loading" | "ready" | "error";
  error?: string;
  fps: number;
  count: number;
  latency: number;
}

const MODEL_DEFS = [
  { id: "effdet0", label: "EffDet-L0", desc: "EfficientDet-Lite0 (MediaPipe)", color: "#22c55e", file: "/models/efficientdet_lite0.tflite" },
  { id: "effdet2", label: "EffDet-L2", desc: "EfficientDet-Lite2 (MediaPipe)", color: "#a855f7", file: "/models/efficientdet_lite2.tflite" },
  { id: "yolov8", label: "YOLOv8n", desc: "YOLOv8 Nano (ONNX)", color: "#f59e0b", file: "/models/yolov8n.onnx" },
  { id: "yolov12", label: "YOLOv12n", desc: "YOLOv12 Nano (ONNX)", color: "#06b6d4", file: "/models/yolo12n.onnx" },
  { id: "cocossd", label: "COCO-SSD", desc: "COCO-SSD Lite (TF.js)", color: "#ef4444", file: "" },
] as const;

type ModelId = (typeof MODEL_DEFS)[number]["id"];

const COLORS: Record<string, string> = {};
for (const m of MODEL_DEFS) COLORS[m.id] = m.color;

function computeIOU(a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-6);
}

function nms(boxes: { x1: number; y1: number; x2: number; y2: number }[], scores: number[], iouThresh: number) {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep: number[] = [];
  while (order.length > 0) {
    const i = order.shift()!;
    keep.push(i);
    const remaining: number[] = [];
    for (const j of order) {
      if (computeIOU(boxes[i], boxes[j]) < iouThresh) remaining.push(j);
    }
    order.length = 0;
    order.push(...remaining);
  }
  return keep;
}

function preprocessYOLO(frame: ImageData): Float32Array {
  const temp = document.createElement("canvas");
  temp.width = frame.width; temp.height = frame.height;
  const tctx = temp.getContext("2d")!;
  tctx.putImageData(frame, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = YOLO_SIZE; canvas.height = YOLO_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(temp, 0, 0, YOLO_SIZE, YOLO_SIZE);
  const resized = ctx.getImageData(0, 0, YOLO_SIZE, YOLO_SIZE).data;

  const pixels = new Float32Array(3 * YOLO_SIZE * YOLO_SIZE);
  const len = YOLO_SIZE * YOLO_SIZE;
  for (let i = 0; i < len; i++) {
    pixels[i] = resized[i * 4] / 255;
    pixels[len + i] = resized[i * 4 + 1] / 255;
    pixels[2 * len + i] = resized[i * 4 + 2] / 255;
  }
  return pixels;
}

function postprocessYOLO(data: Float32Array, modelId: string, nextId: () => number): Detection[] {
  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const scores: number[] = [];
  const labels: number[] = [];
  const scaleX = W / YOLO_SIZE;
  const scaleY = H / YOLO_SIZE;
  const stride = 8400;

  for (let i = 0; i < stride; i++) {
    const cx = data[i];
    const cy = data[stride + i];
    const w = data[2 * stride + i];
    const h = data[3 * stride + i];
    if (cx <= 0 || cy <= 0 || w <= 0 || h <= 0 || cx > YOLO_SIZE || cy > YOLO_SIZE) continue;

    let maxScore = 0, maxClass = 0;
    for (let j = 0; j < 80; j++) {
      const s = data[4 * stride + j * stride + i];
      if (s > maxScore) { maxScore = s; maxClass = j; }
    }
    if (maxScore < CONF_THRESHOLD) continue;

    boxes.push({
      x1: (cx - w / 2) * scaleX,
      y1: (cy - h / 2) * scaleY,
      x2: (cx + w / 2) * scaleX,
      y2: (cy + h / 2) * scaleY,
    });
    scores.push(maxScore);
    labels.push(maxClass);
  }

  const keep = nms(boxes, scores, IOU_THRESHOLD);
  return keep.map(i => ({
    id: `${modelId}-${nextId()}`,
    modelId,
    label: YOLO_CLASSES[labels[i]] || `class-${labels[i]}`,
    confidence: scores[i],
    x: boxes[i].x1,
    y: boxes[i].y1,
    w: boxes[i].x2 - boxes[i].x1,
    h: boxes[i].y2 - boxes[i].y1,
  }));
}

async function initMediaPipeDetector(modelUrl: string): Promise<ModelRuntime> {
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const detector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer: new Uint8Array(buf) },
    scoreThreshold: CONF_THRESHOLD,
    maxResults: 50,
  });
  return {
    detect: async (frame: ImageData) => {
      const off = document.createElement("canvas");
      off.width = frame.width; off.height = frame.height;
      off.getContext("2d")!.putImageData(frame, 0, 0);
      const result = await detector.detect(off);
      return (result.detections || []).map(d => {
        const cat = d.categories?.[0];
        const box = d.boundingBox;
        if (!cat || !box) return null;
        return { id: "", modelId: "", label: cat.categoryName, confidence: cat.score, x: box.originX, y: box.originY, w: box.width, h: box.height };
      }).filter(Boolean) as Detection[];
      // Note: id & modelId are filled in by the caller (line 403 in process loop)
    },
    dispose: () => detector.close(),
  };
}

async function initONNXDetector(modelUrl: string, modelId: string, nextId: () => number): Promise<ModelRuntime> {
  const onnx: any = await import("onnxruntime-web");
  onnx.env.wasm.wasmPaths = "/ort-wasm/";
  const session = await onnx.InferenceSession.create(modelUrl);
  const inputName = session.inputNames[0];

  return {
    detect: async (frame: ImageData) => {
      const pixels = preprocessYOLO(frame);
      const tensor = new onnx.Tensor("float32", pixels, [1, 3, YOLO_SIZE, YOLO_SIZE]);
      const feeds: Record<string, any> = {};
      feeds[inputName] = tensor;
      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      return postprocessYOLO(output.data as Float32Array, modelId, nextId);
    },
    dispose: () => session.release(),
  };
}

async function initCocoSSDDetector(modelId: string, nextId: () => number): Promise<ModelRuntime> {
  await import("@tensorflow/tfjs-core");
  await import("@tensorflow/tfjs-converter");
  await import("@tensorflow/tfjs-backend-webgl");
  const cocoSsd = await import("@tensorflow-models/coco-ssd");
  const model = await cocoSsd.load();
  return {
    detect: async (frame: ImageData) => {
      const off = document.createElement("canvas");
      off.width = frame.width; off.height = frame.height;
      off.getContext("2d")!.putImageData(frame, 0, 0);
      const preds = await model.detect(off, 50, CONF_THRESHOLD);
      return preds.map(p => ({
        id: `${modelId}-${nextId()}`,
        modelId,
        label: p.class,
        confidence: p.score,
        x: p.bbox[0], y: p.bbox[1], w: p.bbox[2], h: p.bbox[3],
      }));
    },
    dispose: () => {},
  };
}

function defaultState(): ModelState {
  return { status: "loading", fps: 0, count: 0, latency: 0 };
}

export default function ComparePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(["effdet0"]));
  const [states, setStates] = useState<Record<string, ModelState>>(() => {
    const s: Record<string, ModelState> = {};
    for (const m of MODEL_DEFS) s[m.id] = defaultState();
    return s;
  });
  const [allDets, setAllDets] = useState<Detection[]>([]);

  const modelsRef = useRef<Map<string, ModelRuntime>>(new Map());
  const nextIdRef = useRef(1);
  const frameRef = useRef<ImageData | null>(null);
  const enabledRef = useRef(enabled);
  const runningDetsRef = useRef<Map<string, Detection[]>>(new Map());
  const modelBusyRef = useRef<Set<string>>(new Set());
  const frameCountRef = useRef(0);
  const statsRef = useRef<Record<string, { frames: number; time: number; sumLatency: number; latCount: number; lastCount: number }>>({});
  const animRef = useRef(0);
  enabledRef.current = enabled;

  const isActive = useCallback((id: string) => enabledRef.current.has(id), []);

  // Init models
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      for (const def of MODEL_DEFS) {
        if (cancelled) return;
        try {
          let m: ModelRuntime;
          if (def.id.startsWith("effdet")) {
            m = await initMediaPipeDetector(def.file) as unknown as ModelRuntime;
          } else if (def.id.startsWith("yolo")) {
            m = await initONNXDetector(def.file, def.id, () => nextIdRef.current++);
          } else if (def.id === "cocossd") {
            m = await initCocoSSDDetector(def.id, () => nextIdRef.current++);
          } else continue;
          if (cancelled) { m.dispose(); return; }
          modelsRef.current.set(def.id, m);
          setStates(prev => ({ ...prev, [def.id]: { status: "ready", fps: 0, count: 0, latency: 0 } }));
        } catch (e) {
          if (!cancelled) setStates(prev => ({ ...prev, [def.id]: { status: "error", error: e instanceof Error ? e.message : "Init failed", fps: 0, count: 0, latency: 0 } }));
        }
      }
    };
    init();
    return () => { cancelled = true; for (const m of modelsRef.current.values()) m.dispose(); };
  }, []);

  // Camera
  const start = useCallback(async () => {
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: W, height: H, facingMode: "environment" },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: W, height: H },
        });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      streamRef.current = stream;
      setIsRunning(true);
      setError(null);
    } catch {
      setError("Camera access denied");
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setIsRunning(false);
    cancelAnimationFrame(animRef.current);
    setAllDets([]);
  }, []);

  // Init stats
  useEffect(() => {
    const now = performance.now();
    for (const m of MODEL_DEFS) {
      if (!statsRef.current[m.id]) statsRef.current[m.id] = { frames: 0, time: now, sumLatency: 0, latCount: 0, lastCount: 0 };
    }
  }, []);

  const toggleModel = useCallback((id: string) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Detection runner
  const runDetect = useCallback(async (modelId: string, frame: ImageData) => {
    const model = modelsRef.current.get(modelId);
    if (!model) return;
    const t0 = performance.now();
    try {
      const dets = await model.detect(frame);
      const t1 = performance.now();
      const lat = t1 - t0;
      runningDetsRef.current.set(modelId, dets);
      const s = statsRef.current[modelId];
      if (s) {
        s.frames++;
        s.sumLatency += lat;
        s.latCount++;
        s.lastCount = dets.length;
      }
    } catch {
      // skip
    }
  }, []);

  // Process loop
  useEffect(() => {
    if (!isRunning) return;
    let cancelled = false;
    const throttle: Record<string, number> = {
      effdet0: 3, effdet2: 3, yolov8: 4, yolov12: 4, cocossd: 2,
    };

    const loop = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, W, H);
      frameRef.current = ctx.getImageData(0, 0, W, H);

      frameCountRef.current++;

      // Run active models (throttled)
      for (const def of MODEL_DEFS) {
        const id = def.id;
        if (!isActive(id)) continue;
        if (modelBusyRef.current.has(id)) continue;
        const t = throttle[id] || 3;
        if (frameCountRef.current % t !== 0) continue;
        modelBusyRef.current.add(id);
        const f = frameRef.current;
        if (!f) continue;
        const frameClone = new ImageData(new Uint8ClampedArray(f.data), f.width, f.height);
        runDetect(id, frameClone).finally(() => modelBusyRef.current.delete(id));
      }

      // Update display
      const all: Detection[] = [];
      for (const id of enabledRef.current) {
        const dets = runningDetsRef.current.get(id);
        if (dets) all.push(...dets.map(d => ({ ...d, id: `${id}-${nextIdRef.current++}`, modelId: id })));
      }
      setAllDets(all);

      // Stats every 30 frames
      if (frameCountRef.current % 30 === 0) {
        const now = performance.now();
        setStates(prev => {
          const next = { ...prev };
          for (const def of MODEL_DEFS) {
            const s = statsRef.current[def.id];
            if (s && s.frames > 0) {
              const elapsed = now - s.time;
              next[def.id] = {
                ...next[def.id],
                fps: Math.round((s.frames / elapsed) * 1000),
                count: s.lastCount,
                latency: s.latCount > 0 ? s.sumLatency / s.latCount : 0,
              };
              s.frames = 0;
              s.time = now;
              s.sumLatency = 0;
              s.latCount = 0;
            }
          }
          return next;
        });
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(animRef.current); };
  }, [isRunning, isActive, runDetect]);

  // Overlay draw
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    let raf: number;
    const draw = () => {
      const canvas = overlay;
      if (canvas.parentElement) {
        const p = canvas.parentElement;
        if (canvas.width !== p.clientWidth || canvas.height !== p.clientHeight) {
          canvas.width = p.clientWidth;
          canvas.height = p.clientHeight;
        }
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sx = canvas.width / W;
        const sy = canvas.height / H;
        for (const d of allDets) {
          const color = COLORS[d.modelId] || "#fff";
          const x = d.x * sx, y = d.y * sy, w = d.w * sx, h = d.h * sy;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          const label = `${d.modelId.toUpperCase()}: ${d.label}`;
          ctx.font = "bold 10px monospace";
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = color;
          ctx.fillRect(x, y - 15, tw + 6, 15);
          ctx.fillStyle = "#000";
          ctx.fillText(label, x + 3, y - 4);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [allDets]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 bg-zinc-950/90 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-3">
          <a href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">←</a>
          <h1 className="text-sm font-bold tracking-tight">Model Comparison</h1>
          <span className="text-[9px] text-zinc-500 font-mono">5 models</span>
        </div>
        <button
          onClick={isRunning ? stop : start}
          className={`px-3 py-1.5 rounded text-[10px] font-medium transition-colors ${
            isRunning ? "bg-red-600/30 text-red-400" : "bg-green-600/30 text-green-400"
          }`}
        >
          {isRunning ? "STOP" : "START"}
        </button>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-[10px] text-red-400 font-mono">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Video */}
        <div className="flex-1 relative min-h-0 bg-black flex items-center justify-center">
          <div className="relative w-full max-w-[800px] max-h-[600px]">
            <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
              <video ref={videoRef} className="block w-full h-full object-contain" playsInline />
              <canvas ref={canvasRef} className="hidden" />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
              {!isRunning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80" style={{ zIndex: 5 }}>
                  <p className="text-zinc-600 text-xs font-mono">Camera off</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-800/50 overflow-y-auto bg-zinc-950/80">
          <div className="p-3 space-y-2">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-3">Models</p>
            {MODEL_DEFS.map(m => {
              const s = states[m.id];
              const on = enabled.has(m.id);
              const ready = s.status === "ready";
              return (
                <button
                  key={m.id}
                  onClick={() => { if (ready) toggleModel(m.id); }}
                  disabled={!ready}
                  className={`w-full text-left rounded-lg border transition-all ${
                    on ? "border-zinc-600 bg-zinc-900/80" : "border-zinc-800/30 bg-zinc-900/30 opacity-60"
                  } disabled:opacity-30`}
                >
                  <div className="p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                        <span className="text-xs font-bold">{m.label}</span>
                        <span className={`text-[9px] font-mono ${
                          s.status === "ready" ? "text-green-500" :
                          s.status === "error" ? "text-red-500" : "text-yellow-500"
                        }`}>
                          {s.status === "ready" ? "●" : s.status === "error" ? "✕" : "○"}
                        </span>
                      </div>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        on ? "bg-green-900/50 text-green-400" : "bg-zinc-800/50 text-zinc-600"
                      }`}>
                        {on ? "ON" : "OFF"}
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500 mb-1.5">{m.desc}</p>
                    {s.status === "error" && (
                      <p className="text-[8px] text-red-500/80 truncate">{s.error}</p>
                    )}
                    {on && s.status === "ready" && (
                      <div className="grid grid-cols-3 gap-1">
                        <div className="bg-zinc-800/60 rounded px-1.5 py-1 text-center">
                          <p className="text-[8px] text-zinc-500">FPS</p>
                          <p className="text-[10px] font-mono text-cyan-400">{s.fps}</p>
                        </div>
                        <div className="bg-zinc-800/60 rounded px-1.5 py-1 text-center">
                          <p className="text-[8px] text-zinc-500">Deteksi</p>
                          <p className="text-[10px] font-mono text-green-400">{s.count}</p>
                        </div>
                        <div className="bg-zinc-800/60 rounded px-1.5 py-1 text-center">
                          <p className="text-[8px] text-zinc-500">Latency</p>
                          <p className="text-[10px] font-mono text-zinc-400">{s.latency.toFixed(0)}ms</p>
                        </div>
                      </div>
                    )}
                    {s.status === "loading" && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-[9px] text-zinc-500">Loading...</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-zinc-800/50 p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
              Deteksi ({allDets.length})
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {allDets.slice(0, 20).map(d => (
                <div key={d.id} className="flex items-center gap-2 text-[9px] font-mono bg-zinc-900/60 rounded px-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[d.modelId] || "#fff" }} />
                  <span className="text-zinc-400 w-16 shrink-0">{d.modelId.toUpperCase()}</span>
                  <span className="text-zinc-300 truncate">{d.label}</span>
                  <span className="text-zinc-500 ml-auto">{Math.round(d.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
