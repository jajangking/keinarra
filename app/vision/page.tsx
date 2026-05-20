"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { DetectionMode, RobotMode, PlayTarget, DebugLogEntry, HybridProfile, HybridSample } from "@/lib/vision/types";
import type { CustomColorRange } from "@/lib/vision/color";
import type { SavedColor } from "@/lib/vision/saved-colors";
import { useCamera } from "@/hooks/useCamera";
import { useVisionProcessor } from "@/hooks/useVisionProcessor";
import { closestNamedColor, createCustomRangeFromArea, rgbToHsv } from "@/lib/vision/color";
import { loadSavedColors, addSavedColor, removeSavedColor } from "@/lib/vision/saved-colors";
import { loadHybridProfiles, addHybridProfile, removeHybridProfile } from "@/lib/vision/hybrid-storage";
import { computeEdgeDensity, computeSolidity, approximateCornerCount, findContours } from "@/lib/vision/image-processing";
import {
  StatsPanel, ModeSelector,
  PlayModePanel, ColorDetectionPanel, MotionDetectionPanel,
  InteractionLog, DetectedObjectsList, DebugLogPanel,
  VideoFeed, HybridTrainingPanel,
} from "@/components/vision";

const W = 640;
const H = 480;

export default function VisionPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DetectionMode>("all");
  const [robotMode, setRobotMode] = useState<RobotMode>("follow");
  const [targetColor, setTargetColor] = useState("red");
  const [colorThreshold, setColorThreshold] = useState(100);
  const [motionThreshold, setMotionThreshold] = useState(30);
  const [minMotionArea, setMinMotionArea] = useState(500);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [playTargets, setPlayTargets] = useState<PlayTarget[]>([]);
  const [score, setScore] = useState(0);
  const [interactionLog, setInteractionLog] = useState<string[]>([]);
  const [pickingColor, setPickingColor] = useState(false);
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);
  const [previewRgb, setPreviewRgb] = useState<{ r: number; g: number; b: number } | null>(null);
  const [pickedRgb, setPickedRgb] = useState<{ r: number; g: number; b: number } | null>(null);
  const [savedColors, setSavedColors] = useState<SavedColor[]>([]);
  const [colorLabel, setColorLabel] = useState<string | null>(null);

  const [hybridPhase, setHybridPhase] = useState<"idle" | "training" | "testing" | "improving" | "done">("idle");
  const [hybridSamples, setHybridSamples] = useState<HybridSample[]>([]);
  const [hybridProfileName, setHybridProfileName] = useState("");
  const [hybridProfiles, setHybridProfiles] = useState<HybridProfile[]>([]);
  const [activeHybridProfile, setActiveHybridProfile] = useState<HybridProfile | null>(null);
  const [dragRegion, setDragRegion] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [detectedInRegion, setDetectedInRegion] = useState(false);
  const [improveIteration, setImproveIteration] = useState(0);

  useEffect(() => {
    loadSavedColors().then(setSavedColors);
    loadHybridProfiles().then(setHybridProfiles);
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
  const lastFrameRef = useRef<ImageData | null>(null);
  const customRangeRef = useRef<CustomColorRange | null>(null);
  const hybridProfileRef = useRef<HybridProfile | null>(null);
  const hybridDetectObjectsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);

  const { overlayRef, handleFrame, objects, robot, setRobot } = useVisionProcessor({
    mode, targetColor, colorThreshold, motionThreshold, minMotionArea,
    customRangeRef, colorLabel, hybridProfileRef, robotMode, playTargets,
    onInteractionLog: handleInteractionLog,
    onScore: handleScore,
    onDebugLog: handleDebugLog,
  }, containerRef);

  useEffect(() => {
    processorHandleFrameRef.current = handleFrame;
  }, [handleFrame]);

  useEffect(() => {
    hybridProfileRef.current = activeHybridProfile;
  }, [activeHybridProfile]);

  useEffect(() => {
    hybridDetectObjectsRef.current = objects
      .filter(o => o.color === "custom" && o.label.includes(hybridProfileName || ""))
      .map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  }, [objects, hybridProfileName]);

  const { videoRef, canvasRef, isRunning, fps, start: startCamera, stop: stopCamera } = useCamera({
    width: W, height: H, onFrame: (frame: ImageData) => {
      lastFrameRef.current = frame;
      processorHandleFrameRef.current?.(frame);

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

  const handleCrosshairMove = useCallback((x: number, y: number) => {
    setCrosshairPos({ x, y });
  }, []);

  const handleColorConfirm = useCallback(() => {
    if (!previewRgb || !crosshairPos) return;
    const frame = lastFrameRef.current;
    if (!frame) return;
    const sensitivity = Math.round(((500 - colorThreshold) / 490) * 100);
    const range = createCustomRangeFromArea(frame, crosshairPos.x, crosshairPos.y, 11, sensitivity);
    setPickedRgb(previewRgb);
    customRangeRef.current = range;
    setColorLabel(null);
    const name = closestNamedColor(previewRgb.r, previewRgb.g, previewRgb.b);
    setTargetColor(name);
    setPickingColor(false);
    setCrosshairPos(null);
    setPreviewRgb(null);
  }, [previewRgb, crosshairPos, colorThreshold]);

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

  const handleDragSelect = useCallback((x: number, y: number, w: number, h: number) => {
    setDragRegion({ x, y, w, h });
  }, []);

  const handleHybridStartTraining = useCallback(() => {
    setHybridPhase("training");
    setHybridSamples([]);
    setHybridProfileName("");
    setDragRegion(null);
  }, []);

  const handleHybridCaptureSample = useCallback(() => {
    if (!dragRegion) return;
    const frame = lastFrameRef.current;
    if (!frame) return;

    const { x: rx, y: ry, w: rw, h: rh } = dragRegion;

    const mask = new Uint8Array(W * H);
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const px = rx + dx;
        const py = ry + dy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = (py * W + px) * 4;
        const r = frame.data[idx], g = frame.data[idx + 1], b = frame.data[idx + 2];
        if (r > 240 && g > 240 && b > 240) continue;
        if (r < 20 && g < 20 && b < 20) continue;
        mask[py * W + px] = 255;
      }
    }

    let hSum = 0, sSum = 0, vSum = 0, count = 0;
    let hMin = 360, hMax = 0, sMin = 100, sMax = 0, vMin = 100, vMax = 0;

    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const px = rx + dx;
        const py = ry + dy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        if (mask[py * W + px] === 0) continue;
        const idx = (py * W + px) * 4;
        const [h, s, v] = rgbToHsv(frame.data[idx], frame.data[idx + 1], frame.data[idx + 2]);
        hSum += h; sSum += s; vSum += v; count++;
        if (h < hMin) hMin = h; if (h > hMax) hMax = h;
        if (s < sMin) sMin = s; if (s > sMax) sMax = s;
        if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      }
    }

    if (count < 50) return;

    const edgeDensity = computeEdgeDensity(frame, rx, ry, rw, rh);
    const solidity = computeSolidity(mask, W, H, rx, ry, rw, rh);
    const aspectRatio = rw / rh;
    const cornerCount = approximateCornerCount(mask, W, H, rx, ry, rw, rh);

    const canvas = document.createElement("canvas");
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext("2d")!;
    const imgData = ctx.createImageData(rw, rh);
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const px = rx + dx;
        const py = ry + dy;
        const srcIdx = (py * W + px) * 4;
        const dstIdx = (dy * rw + dx) * 4;
        imgData.data[dstIdx] = frame.data[srcIdx];
        imgData.data[dstIdx + 1] = frame.data[srcIdx + 1];
        imgData.data[dstIdx + 2] = frame.data[srcIdx + 2];
        imgData.data[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const thumbnail = canvas.toDataURL("image/jpeg", 0.5);

    const sample: HybridSample = {
      id: `sample-${Date.now()}`,
      hMin, hMax, sMin, sMax, vMin, vMax,
      edgeDensity, aspectRatio, solidity, cornerCount,
      capturedAt: Date.now(),
    };

    (window as any).__hybridThumbnail = thumbnail;
    setHybridSamples(prev => [...prev, sample]);
    setDragRegion(null);
  }, [dragRegion]);

  const buildProfileFromSamples = useCallback((samples: HybridSample[], toleranceMultiplier: number): HybridProfile => {
    const allHMin = Math.min(...samples.map(s => s.hMin));
    const allHMax = Math.max(...samples.map(s => s.hMax));
    const allSMin = Math.min(...samples.map(s => s.sMin));
    const allSMax = Math.max(...samples.map(s => s.sMax));
    const allVMin = Math.min(...samples.map(s => s.vMin));
    const allVMax = Math.max(...samples.map(s => s.vMax));

    const avgEdgeDensity = samples.reduce((a, s) => a + s.edgeDensity, 0) / samples.length;
    const avgAspectRatio = samples.reduce((a, s) => a + s.aspectRatio, 0) / samples.length;
    const avgSolidity = samples.reduce((a, s) => a + s.solidity, 0) / samples.length;
    const avgCornerCount = samples.reduce((a, s) => a + s.cornerCount, 0) / samples.length;

    const edgeDensityStd = samples.reduce((a, s) => a + Math.abs(s.edgeDensity - avgEdgeDensity), 0) / samples.length;
    const aspectRatioStd = samples.reduce((a, s) => a + Math.abs(s.aspectRatio - avgAspectRatio), 0) / samples.length;
    const solidityStd = samples.reduce((a, s) => a + Math.abs(s.solidity - avgSolidity), 0) / samples.length;
    const cornerCountStd = samples.reduce((a, s) => a + Math.abs(s.cornerCount - avgCornerCount), 0) / samples.length;

    return {
      id: `hybrid-temp`,
      name: hybridProfileName.trim(),
      hMin: Math.max(0, allHMin), hMax: Math.min(360, allHMax),
      sMin: Math.max(0, allSMin), sMax: Math.min(100, allSMax),
      vMin: Math.max(0, allVMin), vMax: Math.min(100, allVMax),
      avgEdgeDensity, edgeDensityTolerance: Math.max(0.05, edgeDensityStd * 2 * toleranceMultiplier),
      avgAspectRatio, aspectRatioTolerance: Math.max(0.3, aspectRatioStd * 2 * toleranceMultiplier),
      avgSolidity, solidityTolerance: Math.max(0.05, solidityStd * 2 * toleranceMultiplier),
      avgCornerCount, cornerCountTolerance: Math.max(2, cornerCountStd * 2 * toleranceMultiplier),
      samples,
      thumbnail: (window as any).__hybridThumbnail || "",
      createdAt: Date.now(),
    };
  }, [hybridProfileName]);

  const testDetectionInRegion = useCallback((profile: HybridProfile, region: { x: number; y: number; w: number; h: number }): boolean => {
    const frame = lastFrameRef.current;
    if (!frame) return false;

    const mask = new Uint8Array(W * H);
    for (let i = 0; i < frame.data.length; i += 4) {
      const r = frame.data[i], g = frame.data[i + 1], b = frame.data[i + 2];
      const [h, s, v] = rgbToHsv(r, g, b);
      if (h >= profile.hMin && h <= profile.hMax && s >= profile.sMin && s <= profile.sMax && v >= profile.vMin && v <= profile.vMax) {
        mask[i / 4] = 255;
      }
    }

    const regions = findContours(mask, W, H, Math.max(200, colorThreshold));

    for (const r of regions) {
      const edgeDensity = computeEdgeDensity(frame, r.x, r.y, r.w, r.h);
      const solidity = computeSolidity(mask, W, H, r.x, r.y, r.w, r.h);
      const aspectRatio = r.w / r.h;
      const cornerCount = approximateCornerCount(mask, W, H, r.x, r.y, r.w, r.h);

      const edgeMatch = Math.abs(edgeDensity - profile.avgEdgeDensity) <= profile.edgeDensityTolerance;
      const aspectMatch = Math.abs(aspectRatio - profile.avgAspectRatio) <= profile.aspectRatioTolerance;
      const solidityMatch = Math.abs(solidity - profile.avgSolidity) <= profile.solidityTolerance;
      const cornerMatch = Math.abs(cornerCount - profile.avgCornerCount) <= profile.cornerCountTolerance;

      const score = [edgeMatch, aspectMatch, solidityMatch, cornerMatch].filter(Boolean).length;

      if (score >= 3) {
        const overlapX = Math.max(r.x, region.x);
        const overlapY = Math.max(r.y, region.y);
        const overlapW = Math.min(r.x + r.w, region.x + region.w) - overlapX;
        const overlapH = Math.min(r.y + r.h, region.y + region.h) - overlapY;

        if (overlapW > 0 && overlapH > 0) {
          const overlapArea = overlapW * overlapH;
          const regionArea = region.w * region.h;
          if (overlapArea / regionArea > 0.3) return true;
        }
      }
    }

    return false;
  }, [colorThreshold]);

  const handleHybridTrain = useCallback(() => {
    if (hybridSamples.length < 2 || !hybridProfileName.trim() || !dragRegion) return;

    setHybridPhase("testing");
    setImproveIteration(0);

    const runTest = (iteration: number) => {
      const toleranceMultiplier = 1 + iteration * 0.5;
      const profile = buildProfileFromSamples(hybridSamples, toleranceMultiplier);

      const detected = testDetectionInRegion(profile, dragRegion);

      if (detected || iteration >= 15) {
        const finalProfile: HybridProfile = {
          ...profile,
          id: `hybrid-${Date.now()}`,
        };

        addHybridProfile(finalProfile).then(updated => {
          setHybridProfiles(updated);
          setActiveHybridProfile(finalProfile);
          hybridProfileRef.current = finalProfile;
          setDetectedInRegion(detected);
          setHybridPhase("done");
        });
      } else {
        setImproveIteration(iteration + 1);
        setHybridPhase("improving");
        setTimeout(() => {
          setHybridPhase("testing");
          runTest(iteration + 1);
        }, 100);
      }
    };

    runTest(0);
  }, [hybridSamples, hybridProfileName, dragRegion, buildProfileFromSamples, testDetectionInRegion]);

  const handleHybridCancel = useCallback(() => {
    setHybridPhase("idle");
    setHybridSamples([]);
    setHybridProfileName("");
    setDragRegion(null);
    setDetectedInRegion(false);
    setImproveIteration(0);
  }, []);

  const handleSelectHybridProfile = useCallback((profile: HybridProfile) => {
    setActiveHybridProfile(profile);
    hybridProfileRef.current = profile;
  }, []);

  const handleDeleteHybridProfile = useCallback(async (id: string) => {
    const updated = await removeHybridProfile(id);
    setHybridProfiles(updated);
    if (activeHybridProfile?.id === id) {
      setActiveHybridProfile(null);
      hybridProfileRef.current = null;
    }
  }, [activeHybridProfile]);

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

  const resetRobot = () => {
    setRobot({ x: W / 2, y: H / 2, angle: 0, speed: 0, targetX: W / 2, targetY: H / 2, state: "idle", battery: 100 });
    setScore(0);
    setInteractionLog([]);
    setPlayTargets([]);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-3 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Robot Vision Simulator</h1>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        <div className="flex-1">
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
            dragSelectEnabled={hybridPhase === "training"}
            onDragSelect={handleDragSelect}
            dragSelection={dragRegion}
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={startCamera}
              disabled={isRunning}
              className="px-4 py-2 bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start
            </button>
            <button
              onClick={stopCamera}
              disabled={!isRunning}
              className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop
            </button>
            <button onClick={resetRobot} className="px-4 py-2 bg-zinc-700 rounded-md hover:bg-zinc-600">
              Reset
            </button>
          </div>
        </div>

        <div className="w-full lg:w-80 space-y-3 sm:space-y-4">
          <StatsPanel fps={fps} objectsCount={objects.length} mode={mode} robot={robot} />
          <ModeSelector robotMode={robotMode} detectionMode={mode} onRobotModeChange={setRobotMode} onDetectionModeChange={setMode} />

          {robotMode === "play" && (
            <PlayModePanel score={score} playTargets={playTargets} onSpawnTarget={spawnPlayTarget} onClearTargets={clearPlayTargets} />
          )}

          {(mode === "color" || mode === "all" || mode === "custom") && (
            <ColorDetectionPanel
              targetColor={targetColor} colorThreshold={colorThreshold}
              pickingColor={pickingColor} pickedRgb={pickedRgb}
              savedColors={savedColors}
              onColorChange={setTargetColor} onThresholdChange={setColorThreshold}
              onPickColor={() => { setPickingColor(true); setCrosshairPos({ x: W / 2, y: H / 2 }); }}
              onClearPicked={clearPickedColor}
              onSaveColor={handleSaveColor}
              onSelectSaved={handleSelectSaved}
              onDeleteSaved={handleDeleteSaved}
            />
          )}

          {mode === "hybrid" && (
            <HybridTrainingPanel
              phase={hybridPhase}
              samples={hybridSamples}
              profileName={hybridProfileName}
              activeProfile={activeHybridProfile}
              profiles={hybridProfiles}
              dragRegion={dragRegion}
              detectedInRegion={detectedInRegion}
              improveIteration={improveIteration}
              onNameChange={setHybridProfileName}
              onCaptureSample={handleHybridCaptureSample}
              onRemoveSample={(id) => setHybridSamples(prev => prev.filter(s => s.id !== id))}
              onTrain={handleHybridTrain}
              onSelectProfile={handleSelectHybridProfile}
              onDeleteProfile={handleDeleteHybridProfile}
              onCancel={handleHybridCancel}
              onStartTraining={handleHybridStartTraining}
            />
          )}

          {(mode === "motion" || mode === "all") && (
            <MotionDetectionPanel motionThreshold={motionThreshold} minMotionArea={minMotionArea} onThresholdChange={setMotionThreshold} onMinAreaChange={setMinMotionArea} />
          )}

          <InteractionLog logs={interactionLog} />
          <DetectedObjectsList objects={objects} />
          {showDebugLog && <DebugLogPanel logs={debugLog} />}
        </div>
      </div>
    </div>
  );
}
