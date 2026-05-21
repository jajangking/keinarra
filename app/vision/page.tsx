"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { DetectionMode, RobotMode, PlayTarget, DebugLogEntry } from "@/lib/vision/types";
import type { CustomColorRange } from "@/lib/vision/color";
import type { SavedColor } from "@/lib/vision/saved-colors";
import type { ScannedObject, SavedObject, ObjectSignature } from "@/lib/vision/objects";
import { useCamera } from "@/hooks/useCamera";
import { useVisionProcessor } from "@/hooks/useVisionProcessor";
import { useGroqAI } from "@/hooks/useGroqAI";
import { useObjectDetector, getYoloColor } from "@/hooks/useObjectDetector";
import { getDefaultModel, type VisionContext } from "@/lib/groq";
import { closestNamedColor, createCustomRangeFromArea, rgbToHsv } from "@/lib/vision/color";
import { loadSavedColors, addSavedColor, removeSavedColor } from "@/lib/vision/saved-colors";
import {
  loadSavedObjects,
  addSavedObject,
  removeSavedObject,
} from "@/lib/vision/objects";
import {
  ModeSelector,
  PlayModePanel, ColorDetectionPanel, MotionDetectionPanel,
  InteractionLog, DetectedObjectsList, DebugLogPanel,
  VideoFeed, AIChatPanel, ObjectScanPanel,
} from "@/components/vision";

const W = 640;
const H = 480;

const SETTINGS_KEY = "vision_settings";

interface PersistedSettings {
  mode: DetectionMode;
  robotMode: RobotMode;
  targetColor: string;
  colorTolerance: number;
  colorMinArea: number;
  motionThreshold: number;
  motionMinArea: number;
  edgeThreshold: number;
  objectMinArea: number;
  yoloConfidence: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  mode: "all",
  robotMode: "follow",
  targetColor: "red",
  colorTolerance: 50,
  colorMinArea: 200,
  motionThreshold: 30,
  motionMinArea: 500,
  edgeThreshold: 80,
  objectMinArea: 1000,
  yoloConfidence: 40,
};

async function loadSettings(): Promise<PersistedSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

async function saveSettings(settings: Partial<PersistedSettings>): Promise<void> {
  try {
    const existing = localStorage.getItem(SETTINGS_KEY);
    const current = existing ? JSON.parse(existing) : {};
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
  } catch {}
}

export default function VisionPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DetectionMode>(DEFAULT_SETTINGS.mode);
  const [robotMode, setRobotMode] = useState<RobotMode>(DEFAULT_SETTINGS.robotMode);
  const [targetColor, setTargetColor] = useState(DEFAULT_SETTINGS.targetColor);

  const [colorTolerance, setColorTolerance] = useState(DEFAULT_SETTINGS.colorTolerance);
  const [colorMinArea, setColorMinArea] = useState(DEFAULT_SETTINGS.colorMinArea);
  const [motionThreshold, setMotionThreshold] = useState(DEFAULT_SETTINGS.motionThreshold);
  const [motionMinArea, setMotionMinArea] = useState(DEFAULT_SETTINGS.motionMinArea);
  const [edgeThreshold, setEdgeThreshold] = useState(DEFAULT_SETTINGS.edgeThreshold);
  const [objectMinArea, setObjectMinArea] = useState(DEFAULT_SETTINGS.objectMinArea);

  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const [playTargets, setPlayTargets] = useState<PlayTarget[]>([]);
  const [score, setScore] = useState(0);
  const [interactionLog, setInteractionLog] = useState<string[]>([]);
  const [pickingColor, setPickingColor] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const [previewRgb, setPreviewRgb] = useState<{ r: number; g: number; b: number } | null>(null);
  const [pickedRgb, setPickedRgb] = useState<{ r: number; g: number; b: number } | null>(null);
  const [savedColors, setSavedColors] = useState<SavedColor[]>([]);
  const [colorLabel, setColorLabel] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scannedObjects, setScannedObjects] = useState<ScannedObject[]>([]);
  const [selectedForLock, setSelectedForLock] = useState<string | null>(null);
  const [savedObjects, setSavedObjects] = useState<SavedObject[]>([]);
  const [lockedObjectId, setLockedObjectId] = useState<string | null>(null);
  const [yoloConfidence, setYoloConfidence] = useState(DEFAULT_SETTINGS.yoloConfidence);

  const nextScanIdRef = useRef(1);
  const lastFrameRef = useRef<ImageData | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const isScanningRef = useRef(false);
  const isRunningRef = useRef(false);
  const scannedObjectsRef = useRef<ScannedObject[]>([]);

  useEffect(() => {
    scannedObjectsRef.current = scannedObjects;
  }, [scannedObjects]);

  const [groqApiKey, setGroqApiKey] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("groq_api_key") || "";
    return "";
  });

  const [groqModel, setGroqModel] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("groq_model") || getDefaultModel();
    return getDefaultModel();
  });

  useEffect(() => {
    loadSettings().then(s => {
      setMode(s.mode);
      setRobotMode(s.robotMode);
      setTargetColor(s.targetColor);
      setColorTolerance(s.colorTolerance);
      setColorMinArea(s.colorMinArea);
      setMotionThreshold(s.motionThreshold);
      setMotionMinArea(s.motionMinArea);
      setEdgeThreshold(s.edgeThreshold);
      setObjectMinArea(s.objectMinArea);
      setYoloConfidence(s.yoloConfidence);
    });
    loadSavedColors().then(setSavedColors);
    loadSavedObjects().then(setSavedObjects);
  }, []);

  const handleInteractionLog = useCallback((msg: string) => {
    setInteractionLog(prev => [msg, ...prev].slice(0, 10));
  }, []);

  const handleScore = useCallback((delta: number) => {
    setScore(prev => prev + delta);
    setInteractionLog(prev => ["Target tercapai! +100", ...prev].slice(0, 10));
    setPlayTargets(prev => {
      const next = [...prev];
      const active = next.find(t => t.active);
      if (active) active.active = false;
      return next;
    });
  }, []);

  const handleDebugLog = useCallback((log: DebugLogEntry) => {
    setDebugLog(prev => [...prev.slice(-200), log]);
  }, []);

  const processorHandleFrameRef = useRef<((frame: ImageData) => void) | null>(null);
  const customRangeRef = useRef<CustomColorRange | null>(null);

  const { overlayRef, handleFrame, objects, robot, setRobot } = useVisionProcessor({
    mode, targetColor, colorTolerance, colorMinArea,
    motionThreshold, motionMinArea, edgeThreshold, objectMinArea,
    customRangeRef, colorLabel,
    robotMode, playTargets,
    onInteractionLog: handleInteractionLog,
    onScore: handleScore,
    onDebugLog: handleDebugLog,
  }, containerRef);

  useEffect(() => {
    processorHandleFrameRef.current = handleFrame;
  }, [handleFrame]);

  const { videoRef, canvasRef, isRunning, fps, start: startCamera, stop: stopCamera } = useCamera({
    width: W, height: H, onFrame: (frame: ImageData) => {
      lastFrameRef.current = frame;
      processorHandleFrameRef.current?.(frame);

      if (isScanning && isRunning) {
        const currentObjects = objects.filter(o => o.label === "Scan");
        const newScanned: ScannedObject[] = [];
        for (const obj of currentObjects) {
          const existing = scannedObjectsRef.current.find(s => {
            const dx = Math.abs(s.x - obj.x);
            const dy = Math.abs(s.y - obj.y);
            return dx < 30 && dy < 30;
          });
          if (!existing) {
            const signature: ObjectSignature = {
              avgR: 0, avgG: 0, avgB: 0,
              avgH: 0, avgS: 0, avgV: 0,
              stdR: 0, stdG: 0, stdB: 0,
              widthHeightRatio: obj.w / (obj.h || 1),
              area: obj.w * obj.h,
              perimeter: 2 * (obj.w + obj.h),
              circularity: 0,
              edgeDensity: 0,
            };
            newScanned.push({
              id: `scan-${nextScanIdRef.current++}`,
              x: obj.x, y: obj.y, w: obj.w, h: obj.h,
              label: "Object",
              confidence: 1,
              signature,
              thumbnail: "",
              color: "#eab308",
            });
          }
        }
        if (newScanned.length > 0) {
          setScannedObjects(prev => [...prev, ...newScanned]);
        }
      }

      if (pickingColor && crosshairPos) {
        const px = Math.max(0, Math.min(W - 1, crosshairPos.x));
        const py = Math.max(0, Math.min(H - 1, crosshairPos.y));
        const idx = (py * W + px) * 4;
        setPreviewRgb({
          r: frame.data[idx],
          g: frame.data[idx + 1],
          b: frame.data[idx + 2],
        });
      }
    },
  });

  useEffect(() => {
    isScanningRef.current = isScanning;
    isRunningRef.current = isRunning;
  }, [isScanning, isRunning]);

  const useYolo = mode === "yolo";

  const {
    isReady: yoloReady,
    detections: yoloDetections,
    error: yoloError,
    fps: yoloFps,
    start: yoloStart,
    stop: yoloStop,
    getColor: yoloGetColor,
  } = useObjectDetector({
    enabled: useYolo && isRunning,
    confidenceThreshold: yoloConfidence / 100,
    classes: null,
    targetWidth: W,
    targetHeight: H,
  });

  const yoloStartRef = useRef(yoloStart);
  const yoloStopRef = useRef(yoloStop);
  useEffect(() => {
    yoloStartRef.current = yoloStart;
    yoloStopRef.current = yoloStop;
  }, [yoloStart, yoloStop]);

  useEffect(() => {
    if (useYolo && isRunning && yoloReady) {
      const videoEl = document.querySelector("video");
      if (videoEl && videoEl.readyState >= 2) {
        videoElRef.current = videoEl;
        yoloStartRef.current(videoEl);
      }
    } else {
      yoloStopRef.current();
    }
  }, [useYolo, isRunning, yoloReady]);

  const visionContext: VisionContext = {
    mode,
    robotMode,
    targetColor,
    objects: objects.map(o => ({
      id: o.id, label: o.label, color: o.color || "",
      x: o.x, y: o.y, w: o.w, h: o.h,
    })),
    robot: { x: robot.x, y: robot.y, state: robot.state, battery: robot.battery },
    fps,
    savedObjects: savedObjects.map(o => ({ id: o.id, name: o.name })),
    lockedObjectId,
    isScanning,
  };

  const {
    messages: aiMessages,
    isThinking: aiThinking,
    error: aiError,
    isEnabled: aiEnabled,
    setIsEnabled: setAiEnabled,
    sendMessage: aiSendMessage,
    clearChat: aiClearChat,
    cancelRequest: aiCancelRequest,
  } = useGroqAI({
    apiKey: groqApiKey,
    model: groqModel,
    visionContext,
    tools: {
      onSetRobotMode: (m) => { setRobotMode(m as RobotMode); saveSettings({ robotMode: m as RobotMode }); },
      onSetDetectionMode: (m) => { setMode(m as DetectionMode); saveSettings({ mode: m as DetectionMode }); },
      onSetTargetColor: (c, rgb) => {
        setTargetColor(c);
        saveSettings({ targetColor: c });
        if (rgb) {
          const [h, s, v] = rgbToHsv(rgb.r, rgb.g, rgb.b);
          customRangeRef.current = {
            hMin: Math.max(0, h - 30), hMax: Math.min(360, h + 30),
            sMin: Math.max(0, s - 40), sMax: Math.min(100, s + 40),
            vMin: Math.max(0, v - 40), vMax: Math.min(100, v + 40),
            avgH: h, avgS: s, avgV: v,
          };
          setColorLabel(c);
        }
      },
      onSetColorTolerance: (v) => { setColorTolerance(v); saveSettings({ colorTolerance: v }); },
      onSetColorMinArea: (v) => { setColorMinArea(v); saveSettings({ colorMinArea: v }); },
      onSetMotionThreshold: (v) => { setMotionThreshold(v); saveSettings({ motionThreshold: v }); },
      onSetMotionMinArea: (v) => { setMotionMinArea(v); saveSettings({ motionMinArea: v }); },
      onSetEdgeThreshold: (v) => { setEdgeThreshold(v); saveSettings({ edgeThreshold: v }); },
      onSetObjectMinArea: (v) => { setObjectMinArea(v); saveSettings({ objectMinArea: v }); },
      onSpeak: (text) => {
        setInteractionLog(prev => [`AI: ${text}`, ...prev].slice(0, 10));
      },
      onStartScan: () => {
        setIsScanning(true);
        setScannedObjects([]);
        setSelectedForLock(null);
        setMode("scan");
        saveSettings({ mode: "scan" });
        nextScanIdRef.current = 1;
      },
      onStopScan: () => {
        setIsScanning(false);
        setSelectedForLock(null);
      },
      onLockObject: async (scanId: string, name: string) => {
        const scanned = scannedObjects.find(o => o.id === scanId);
        if (!scanned) return;
        const savedObj: SavedObject = {
          id: `obj-${Date.now()}`,
          name,
          signature: scanned.signature,
          thumbnail: scanned.thumbnail,
          createdAt: Date.now(),
          seenCount: 0,
        };
        const updated = await addSavedObject(savedObj);
        setSavedObjects(updated);
        setScannedObjects(prev => prev.filter(o => o.id !== scanId));
        setSelectedForLock(null);
        setLockedObjectId(savedObj.id);
      },
      onTrackSavedObject: (name) => {
        const obj = savedObjects.find(o => o.name.toLowerCase() === name.toLowerCase());
        if (obj) {
          setLockedObjectId(obj.id);
          setInteractionLog(prev => [`AI tracking: ${name}`, ...prev].slice(0, 10));
        }
      },
    },
  });

  const handleCrosshairMove = useCallback((x: number, y: number) => {
    setCrosshairPos({ x, y });
  }, []);

  const handleColorConfirm = useCallback(() => {
    if (!previewRgb || !crosshairPos) return;
    const frame = lastFrameRef.current;
    if (!frame) return;
    const range = createCustomRangeFromArea(frame, crosshairPos.x, crosshairPos.y, 15, colorTolerance);
    if (range) {
      setPickedRgb(previewRgb);
      customRangeRef.current = range;
      setColorLabel(null);
      const name = closestNamedColor(previewRgb.r, previewRgb.g, previewRgb.b);
      setTargetColor(name);
      saveSettings({ targetColor: name });
    }
    setPickingColor(false);
    setCrosshairPos(null);
    setPreviewRgb(null);
  }, [previewRgb, crosshairPos, colorTolerance]);

  const handleColorCancel = useCallback(() => {
    setPickingColor(false);
    setCrosshairPos(null);
    setPreviewRgb(null);
  }, []);

  const clearPickedColor = useCallback(() => {
    setPickedRgb(null);
    setColorLabel(null);
    customRangeRef.current = null;
  }, []);

  const handleSaveColor = useCallback(async (name: string) => {
    if (!pickedRgb) return;
    const [h, s, v] = rgbToHsv(pickedRgb.r, pickedRgb.g, pickedRgb.b);
    const newColor: SavedColor = {
      id: `color-${Date.now()}`, name,
      r: pickedRgb.r, g: pickedRgb.g, b: pickedRgb.b,
      h, s, v, createdAt: Date.now(),
    };
    const updated = await addSavedColor(newColor);
    setSavedColors(updated);
    setColorLabel(name);
    customRangeRef.current = {
      hMin: Math.max(0, h - 20), hMax: Math.min(360, h + 20),
      sMin: Math.max(0, s - 30), sMax: Math.min(100, s + 30),
      vMin: Math.max(0, v - 30), vMax: Math.min(100, v + 30),
      avgH: h, avgS: s, avgV: v,
    };
  }, [pickedRgb]);

  const handleSelectSaved = useCallback((color: SavedColor) => {
    setPickedRgb({ r: color.r, g: color.g, b: color.b });
    setTargetColor(color.name);
    setColorLabel(color.name);
    saveSettings({ targetColor: color.name });
    customRangeRef.current = {
      hMin: Math.max(0, color.h - 20), hMax: Math.min(360, color.h + 20),
      sMin: Math.max(0, color.s - 30), sMax: Math.min(100, color.s + 30),
      vMin: Math.max(0, color.v - 30), vMax: Math.min(100, color.v + 30),
      avgH: color.h, avgS: color.s, avgV: color.v,
    };
  }, []);

  const handleDeleteSaved = useCallback(async (id: string) => {
    const updated = await removeSavedColor(id);
    setSavedColors(updated);
  }, []);

  const handleStartScan = useCallback(() => {
    setIsScanning(true);
    setScannedObjects([]);
    setSelectedForLock(null);
    setMode("scan");
    saveSettings({ mode: "scan" });
    nextScanIdRef.current = 1;
  }, []);

  const handleStopScan = useCallback(() => {
    setIsScanning(false);
    setSelectedForLock(null);
  }, []);

  const handleScanObjectSelect = useCallback((id: string) => {
    setSelectedForLock(prev => prev === id ? null : id);
  }, []);

  const handleLockObject = useCallback(async (scanId: string, name: string) => {
    const scanned = scannedObjects.find(o => o.id === scanId);
    if (!scanned) return;

    const savedObj: SavedObject = {
      id: `obj-${Date.now()}`,
      name,
      signature: scanned.signature,
      thumbnail: scanned.thumbnail,
      createdAt: Date.now(),
      seenCount: 0,
    };

    const updated = await addSavedObject(savedObj);
    setSavedObjects(updated);
    setScannedObjects(prev => prev.filter(o => o.id !== scanId));
    setSelectedForLock(null);
    setLockedObjectId(savedObj.id);
  }, [scannedObjects]);

  const handleDeleteSavedObject = useCallback(async (id: string) => {
    const updated = await removeSavedObject(id);
    setSavedObjects(updated);
    if (lockedObjectId === id) setLockedObjectId(null);
  }, [lockedObjectId]);

  const handleClearScanned = useCallback(() => {
    setScannedObjects([]);
    setSelectedForLock(null);
  }, []);

  const resetRobot = () => {
    setRobot({ x: W / 2, y: H / 2, angle: 0, speed: 0, targetX: W / 2, targetY: H / 2, state: "idle", battery: 100 });
    setScore(0);
    setInteractionLog([]);
    setPlayTargets([]);
  };

  const spawnPlayTarget = () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff8800"];
    setPlayTargets(prev => [...prev, {
      x: 50 + Math.random() * (W - 100),
      y: 50 + Math.random() * (H - 100),
      radius: 30 + Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      active: true,
    }]);
  };

  const clearPlayTargets = () => {
    setPlayTargets([]);
    setScore(0);
  };

  const handleApiKeySave = (key: string) => {
    setGroqApiKey(key);
    localStorage.setItem("groq_api_key", key);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      {/* Top Bar */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Keinarra</h1>
              <p className="text-[10px] text-zinc-500 -mt-0.5">Robot Vision Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={isRunning ? stopCamera : startCamera}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isRunning
                  ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-red-400 animate-pulse' : 'bg-green-400'}`} />
              {isRunning ? 'Stop' : 'Start'}
            </button>
            <button
              onClick={resetRobot}
              className="px-3 py-2 bg-zinc-800/60 hover:bg-zinc-700/80 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700/50"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto p-4 sm:p-6">
        <div className="flex flex-col xl:flex-row gap-6">
          {/* Left: Vision Feed */}
          <div className="flex-1 min-w-0">
            <VideoFeed
              videoRef={videoRef} canvasRef={canvasRef} overlayRef={overlayRef}
              containerRef={containerRef}
              isRunning={isRunning} mode={mode}
              objects={objects}
              pickingColor={pickingColor}
              crosshairPos={crosshairPos}
              pickedColor={previewRgb}
              onCrosshairMove={handleCrosshairMove}
              onColorConfirm={handleColorConfirm}
              onColorCancel={handleColorCancel}
              isScanning={isScanning}
              useYolo={useYolo}
              scannedObjects={scannedObjects.map(o => ({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h }))}
              selectedForLock={selectedForLock}
              onScanObjectClick={handleScanObjectSelect}
              yoloDetections={yoloDetections.map(d => ({
                id: d.id,
                label: d.label,
                confidence: d.confidence,
                x: d.x,
                y: d.y,
                w: d.w,
                h: d.h,
                color: getYoloColor(d.label),
              }))}
              yoloReady={yoloReady}
              yoloFps={yoloFps}
              yoloError={yoloError}
              fps={fps}
              aiEnabled={aiEnabled}
              aiThinking={aiThinking}
            />

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
              <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">FPS</p>
                <p className={`text-xl font-bold font-mono ${fps > 20 ? 'text-green-400' : fps > 10 ? 'text-yellow-400' : 'text-red-400'}`}>{fps}</p>
              </div>
              <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Objek</p>
                <p className="text-xl font-bold font-mono text-cyan-400">{objects.length}</p>
              </div>
              {useYolo && (
                <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/50">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">YOLO</p>
                  <p className={`text-xl font-bold font-mono ${yoloReady ? 'text-green-400' : 'text-yellow-400'}`}>{yoloReady ? `${yoloFps}fps` : "..."}</p>
                </div>
              )}
              <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Baterai</p>
                <p className={`text-xl font-bold font-mono ${robot.battery > 50 ? 'text-green-400' : robot.battery > 20 ? 'text-yellow-400' : 'text-red-400'}`}>{Math.round(robot.battery)}%</p>
              </div>
              <div className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Status</p>
                <p className="text-xl font-bold font-mono text-zinc-300 capitalize">{robot.state}</p>
              </div>
            </div>

            {/* AI Chat - Full width below video on desktop */}
            <div className="mt-6">
          <AIChatPanel
            messages={aiMessages}
            isThinking={aiThinking}
            error={aiError}
            isEnabled={aiEnabled}
            model={groqModel}
            onModelChange={(m) => { setGroqModel(m); localStorage.setItem("groq_model", m); }}
            onToggle={() => setAiEnabled(prev => !prev)}
            onSend={aiSendMessage}
            onClear={aiClearChat}
            onCancel={aiCancelRequest}
          />
            </div>

            {/* API Key input */}
            <div className="mt-4">
              <div className="bg-zinc-900/40 rounded-xl p-3 border border-zinc-800/30">
                <label className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium block mb-1.5">Groq API Key</label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  value={groqApiKey}
                  onChange={(e) => handleApiKeySave(e.target.value)}
                  placeholder="gsk_... (free at console.groq.com)"
                  className="w-full px-3 py-2 bg-zinc-800/40 rounded-lg border border-zinc-700/30 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="w-full xl:w-80 space-y-3">
            <ModeSelector robotMode={robotMode} detectionMode={mode} onRobotModeChange={setRobotMode} onDetectionModeChange={setMode} />

            {robotMode === "play" && (
              <PlayModePanel score={score} playTargets={playTargets} onSpawnTarget={spawnPlayTarget} onClearTargets={clearPlayTargets} />
            )}

            {(mode === "color" || mode === "all") && (
              <ColorDetectionPanel
                targetColor={targetColor}
                colorTolerance={colorTolerance}
                colorMinArea={colorMinArea}
                pickingColor={pickingColor}
                pickedRgb={pickedRgb}
                savedColors={savedColors}
                onColorChange={setTargetColor}
                onToleranceChange={setColorTolerance}
                onMinAreaChange={setColorMinArea}
                onPickColor={() => { setPickingColor(true); setCrosshairPos({ x: W / 2, y: H / 2 }); }}
                onClearPicked={clearPickedColor}
                onSaveColor={handleSaveColor}
                onSelectSaved={handleSelectSaved}
                onDeleteSaved={handleDeleteSaved}
              />
            )}

            {(mode === "motion" || mode === "all") && (
              <MotionDetectionPanel
                motionThreshold={motionThreshold}
                motionMinArea={motionMinArea}
                onThresholdChange={setMotionThreshold}
                onMinAreaChange={setMotionMinArea}
              />
            )}

            {mode === "yolo" && (
              <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/50">
                <h2 className="text-sm font-semibold mb-3 text-zinc-300">YOLO Detection</h2>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Sensitivity</label>
                    <span className="text-xs font-mono text-zinc-400">{yoloConfidence}%</span>
                  </div>
                  <input
                    type="range" min="10" max="90" value={yoloConfidence}
                    onChange={(e) => setYoloConfidence(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
                    <span>Lebih banyak deteksi</span>
                    <span>Lebih sedikit false positive</span>
                  </div>
                </div>
              </div>
            )}

            {(mode === "object" || mode === "all") && (
              <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-800/50">
                <h2 className="text-sm font-semibold mb-3 text-zinc-300">Deteksi Objek</h2>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Batas Tepi</label>
                      <span className="text-xs font-mono text-zinc-400">{edgeThreshold}</span>
                    </div>
                    <input
                      type="range" min="20" max="200" value={edgeThreshold}
                      onChange={(e) => setEdgeThreshold(Number(e.target.value))}
                      className="w-full accent-zinc-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Luas Minimum</label>
                      <span className="text-xs font-mono text-zinc-400">{objectMinArea}</span>
                    </div>
                    <input
                      type="range" min="100" max="10000" step="100" value={objectMinArea}
                      onChange={(e) => setObjectMinArea(Number(e.target.value))}
                      className="w-full accent-zinc-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {(mode === "scan" || isScanning) && (
              <ObjectScanPanel
                isScanning={useYolo}
                scannedObjects={scannedObjects}
                savedObjects={savedObjects}
                selectedForLock={selectedForLock}
                onStartScan={handleStartScan}
                onStopScan={handleStopScan}
                onSelectObject={handleScanObjectSelect}
                onLockObject={handleLockObject}
                onDeleteSaved={handleDeleteSavedObject}
                onClearScanned={handleClearScanned}
              />
            )}

            <InteractionLog logs={interactionLog} />
            <DetectedObjectsList objects={objects} />
            <DebugLogPanel logs={debugLog} />
          </div>
        </div>
      </main>
    </div>
  );
}
