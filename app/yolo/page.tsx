"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { CameraView } from "@/components/yolo/CameraView";
import { AIChat } from "@/components/yolo/AIChat";
import { ESP32Control } from "@/components/yolo/ESP32Control";
import { useRobotSearch } from "@/hooks/useRobotSearch";
import { useBuzzerSound } from "@/hooks/useBuzzerSound";
import type { Detection } from "@/components/yolo/CameraView";

export default function YoloPage() {
  const [dets, setDets] = useState<Detection[]>([]);
  const [yoloFps, setYoloFps] = useState(0);
  const [showESP, setShowESP] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [motorL, setMotorL] = useState(0);
  const [motorR, setMotorR] = useState(0);
  const [buzzerOn, setBuzzerOn] = useState(false);
  const { buzzerStart, buzzerStop } = useBuzzerSound();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleDetections = useCallback((d: Detection[]) => {
    setDets(d);
  }, []);

  const handleMotors = useCallback((l: number, r: number) => {
    setMotorL(l);
    setMotorR(r);
  }, []);

  const handleBuzzer = useCallback((freq: number) => {
    setBuzzerOn(freq > 0);
    if (freq > 0) buzzerStart(freq);
    else buzzerStop();
  }, [buzzerStart, buzzerStop]);

  const { state: searchState, target } = useRobotSearch({
    detections: dets,
    onMotors: handleMotors,
    onBuzzer: handleBuzzer,
    enabled: searchMode,
  });

  const persons = dets.filter(d => d.label === "person");

  const stateColor = searchState === "searching" ? "text-yellow-400" 
    : searchState === "locked" ? "text-green-400" 
    : "text-zinc-600";
  const stateLabel = searchState === "searching" ? "MENCARI"
    : searchState === "locked" ? "MENGIKUTI"
    : "DIAM";

  return (
    <div className="h-dvh bg-black text-zinc-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-950/90 shrink-0 min-h-0 relative">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight">KEINARRA</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-green-900/60 text-green-400">
            {yoloFps}fps
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${persons.length > 0 ? "bg-green-900/60 text-green-400" : "bg-zinc-800/60 text-zinc-600"}`}>
            {persons.length} org
          </span>
          <span className={`text-[9px] font-mono font-semibold ${stateColor}`}>
            {stateLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSearchMode(prev => !prev)}
            className={`px-2 py-1 rounded text-[9px] font-medium transition-colors ${
              searchMode 
                ? "bg-red-600/30 text-red-400 animate-pulse" 
                : "bg-cyan-600/30 text-cyan-400"
            }`}
          >
            {searchMode ? "STOP" : "CARI"}
          </button>
          <button
            onClick={() => setShowESP(prev => !prev)}
            className="px-2 py-1 rounded text-[9px] bg-zinc-800/80 hover:bg-zinc-700/80 text-cyan-400 transition-colors flex items-center gap-1"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${motorL !== 0 || motorR !== 0 ? "bg-green-400 animate-pulse" : "bg-green-400"}`} />
            ESP
          </button>
        </div>

        {showESP && (
          <div ref={panelRef} className="absolute top-full right-2 mt-1" style={{ zIndex: 20 }}>
            <ESP32Control
              leftSpeed={motorL}
              rightSpeed={motorR}
              buzzerOn={buzzerOn}
              searchState={searchState}
              detections={dets}
              onMotors={handleMotors}
              onBuzzer={handleBuzzer}
            />
          </div>
        )}
      </div>

      {/* Camera area */}
      <div className="flex-1 relative bg-black min-h-0 flex flex-col">
        <div className="flex-1 relative min-h-0">
          <CameraView onDetections={handleDetections} onFps={setYoloFps} />

          {/* Search status overlay */}
          {searchMode && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5" style={{ zIndex: 7 }}>
              <span className={`w-2 h-2 rounded-full ${searchState === "searching" ? "bg-yellow-400 animate-ping" : searchState === "locked" ? "bg-green-400" : "bg-zinc-600"}`} />
              <span className={`text-[9px] font-mono font-bold ${stateColor}`}>
                {searchState === "searching" ? "MENCARI..." : searchState === "locked" ? `❗ORANG DITEMUKAN` : ""}
              </span>
            </div>
          )}
        </div>
        <AIChat detections={dets} fps={yoloFps} />
      </div>
    </div>
  );
}
