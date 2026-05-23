"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { CameraView } from "@/components/yolo/CameraView";
import { AIChat } from "@/components/yolo/AIChat";
import { ESP32Control } from "@/components/yolo/ESP32Control";
import { useRobotSearch } from "@/hooks/useRobotSearch";
import { useBuzzerSound } from "@/hooks/useBuzzerSound";
import { useSearchVoice } from "@/hooks/useSearchVoice";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useInteraction } from "@/hooks/useInteraction";
import { useAudioManager } from "@/hooks/useAudioManager";
import type { Detection } from "@/components/yolo/CameraView";
import type { Mood } from "@/hooks/useMood";

const MOOD_BUZZER: Partial<Record<Mood, string>> = {
  excited: "excited",
  happy: "found",
  playful: "chirp",
  confused: "lost",
  tired: "tired",
};

export default function YoloPage() {
  const [dets, setDets] = useState<Detection[]>([]);
  const [yoloFps, setYoloFps] = useState(0);
  const [showESP, setShowESP] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [motorL, setMotorL] = useState(0);
  const [motorR, setMotorR] = useState(0);
  const [buzzerOn, setBuzzerOn] = useState(false);
  const [sttEnabled, setSttEnabled] = useState(true);
  const [voiceLog, setVoiceLog] = useState<{ role: "assistant"; text: string }[]>([]);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [customTrackMode, setCustomTrackMode] = useState(false);
  const [customDrawMode, setCustomDrawMode] = useState(false);
  const [customBox, setCustomBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [customTracking, setCustomTracking] = useState<{ x: number; y: number; w: number; h: number; confidence: number } | null>(null);
  const [customOnly, setCustomOnly] = useState(false);
  const customPanelRef = useRef<HTMLDivElement>(null);

  const audio = useAudioManager();
  const { buzzerStart, buzzerStop, setCanPlay } = useBuzzerSound();
  const voice = useSearchVoice();
  const { sttStart, sttStop } = useSpeechToText();
  const interaction = useInteraction();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevSearchStateRef = useRef<"idle" | "searching" | "locked" | "resting">("idle");
  const searchVoiceSpokeRef = useRef(false);

  // Buzzer respects TTS
  useEffect(() => {
    setCanPlay(() => audio.canBuzzer());
  }, [setCanPlay, audio.canBuzzer]);

  const handleDetections = useCallback((d: Detection[]) => {
    setDets(d);
  }, []);

  const handleMotors = useCallback((l: number, r: number) => {
    setMotorL(l);
    setMotorR(r);
  }, []);

  const handleBuzzer = useCallback((mood: Mood) => {
    const pattern = MOOD_BUZZER[mood];
    if (!pattern) return;
    setBuzzerOn(true);
    buzzerStart(pattern as "found" | "search" | "lost" | "excited" | "chirp" | "tired");
    setTimeout(() => setBuzzerOn(false), 1200);
  }, [buzzerStart]);

  const handleDirectBuzzer = useCallback((pattern: string) => {
    if (pattern === "off") {
      setBuzzerOn(false);
      return;
    }
    setBuzzerOn(true);
    buzzerStart(pattern as "found" | "search" | "lost" | "excited" | "chirp" | "tired");
    setTimeout(() => setBuzzerOn(false), 1200);
  }, [buzzerStart]);

  // Merge custom tracking with YOLO detections for robot search
  const mergedDets = customTracking && customTracking.confidence > 0.15
    ? [...(customOnly ? [] : dets), { id: "custom", label: "person", confidence: Math.max(0.5, customTracking.confidence), x: (customTracking.x / 100) * 640, y: (customTracking.y / 100) * 480, w: (customTracking.w / 100) * 640, h: (customTracking.h / 100) * 480 }]
    : (customOnly ? [] : dets);

  const { state: searchState } = useRobotSearch({
    detections: mergedDets,
    onMotors: handleMotors,
    enabled: searchMode,
  });

  // Voice trigger on search state change
  useEffect(() => {
    voice.trigger({
      searchState,
      onSpeak: (text: string) => {
        searchVoiceSpokeRef.current = true;
        setVoiceLog(prev => [...prev.slice(-20), { role: "assistant", text }]);
      },
    });
  }, [searchState, voice]);

  // Start interaction once when search mode turns on
  useEffect(() => {
    if (searchMode) {
      interaction.start({
        onMotors: handleMotors,
        onBuzzer: handleBuzzer,
        onDirectBuzzer: handleDirectBuzzer,
        onStartSTT: sttEnabled ? sttStart : undefined,
        audioManager: sttEnabled ? audio : undefined,
      });
    } else {
      interaction.stop();
      setVoiceLog([]);
    }
    return () => {
      if (!searchMode) interaction.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode]);

  // Control mic based on search state + wait for search voice TTS on lock
  useEffect(() => {
    const prev = prevSearchStateRef.current;
    prevSearchStateRef.current = searchState;

    if (!searchMode || !sttEnabled) return;

    if (searchState === "locked") {
      if (prev !== "locked") {
        searchVoiceSpokeRef.current = false;
        let elapsed = 0;
        const waitSearchVoice = () => {
          elapsed += 200;
          if ((searchVoiceSpokeRef.current && !window.speechSynthesis.speaking) || elapsed > 8000) {
            searchVoiceSpokeRef.current = false;
            interaction.listen();
          } else {
            setTimeout(waitSearchVoice, 200);
          }
        };
        setTimeout(waitSearchVoice, 500);
      }
    } else {
      interaction.stopListening();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState, searchMode, sttEnabled]);

  // STT toggle
  const handleSttToggle = useCallback(() => {
    setSttEnabled(prev => {
      const next = !prev;
      if (searchMode) {
        if (next && searchState === "locked") {
          interaction.listen();
        } else {
          interaction.stopListening();
        }
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode, searchState]);

  const handleSendText = useCallback((text: string) => {
    if (!interaction.running.current) {
      interaction.start({
        onMotors: handleMotors,
        onBuzzer: handleBuzzer,
        onDirectBuzzer: handleDirectBuzzer,
        onStartSTT: sttEnabled ? sttStart : undefined,
        audioManager: sttEnabled ? audio : undefined,
      });
    }
    interaction.sendText(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttEnabled]);

  const handleCustomBox = useCallback((box: { x: number; y: number; w: number; h: number } | null) => {
    setCustomBox(box);
    if (box) setCustomDrawMode(false);
  }, []);

  const handleCustomTracking = useCallback((det: { x: number; y: number; w: number; h: number; confidence: number } | null) => {
    setCustomTracking(det);
  }, []);

  const persons = mergedDets.filter(d => d.label === "person");

  const stateColor = searchState === "searching" ? "text-yellow-400" 
    : searchState === "locked" ? "text-green-400" 
    : searchState === "resting" ? "text-red-400" 
    : "text-zinc-600";
  const stateLabel = searchState === "searching" ? "MENCARI"
    : searchState === "locked" ? "MENGIKUTI"
    : searchState === "resting" ? "ISTIRAHAT"
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
          <span className="text-[9px] font-mono text-purple-400">{interaction.mood.mood}</span>
          {interaction.listening && (
            <span className="text-[9px] font-mono text-cyan-400 animate-pulse">🎤</span>
          )}
          {audio.ttsSpeaking && (
            <span className="text-[9px] font-mono text-yellow-400">💬</span>
          )}
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
          <button
            onClick={() => { setCustomTrackMode(prev => !prev); setCustomDrawMode(false); }}
            className={`px-2 py-1 rounded text-[9px] font-medium transition-colors ${
              customTrackMode
                ? "bg-amber-600/40 text-amber-400"
                : "bg-zinc-800/80 hover:bg-zinc-700/80 text-amber-400"
            }`}
          >
            CUSTOM
          </button>
        </div>

        <div ref={panelRef} className={`absolute top-full right-2 mt-1 transition-opacity duration-150 ${showESP ? "opacity-100" : "opacity-0 pointer-events-none"}`} style={{ zIndex: 20 }}>
          <ESP32Control
            leftSpeed={motorL}
            rightSpeed={motorR}
            buzzerOn={buzzerOn}
            searchState={searchState}
            detections={dets}
            onMotors={handleMotors}
            onBuzzer={(p) => setBuzzerOn(p !== "off")}
          />
        </div>

        {/* Custom Track Panel */}
        <div ref={customPanelRef} className={`absolute top-full right-2 mt-1 transition-opacity duration-150 ${customTrackMode ? "opacity-100" : "opacity-0 pointer-events-none"}`} style={{ zIndex: 20 }}>
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-lg p-3 w-52 shadow-2xl">
            <p className="text-[10px] font-bold text-amber-400 mb-2 tracking-wide">CUSTOM TRACK</p>
            <div className="space-y-2">
              <button
                onClick={() => setCustomDrawMode(prev => !prev)}
                className={`w-full px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                  customDrawMode
                    ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                    : "bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300"
                }`}
              >
                {customDrawMode ? "GAMBAR BOX..." : "GAMBAR BOX"}
              </button>
              {customBox && (
                <div className="bg-zinc-800/60 rounded p-1.5 space-y-1">
                  <p className="text-[9px] font-mono text-amber-300/80">
                    Box: ({customBox.x.toFixed(0)},{customBox.y.toFixed(0)}) {customBox.w.toFixed(0)}×{customBox.h.toFixed(0)}
                  </p>
                  <button
                    onClick={() => { setCustomBox(null); setCustomDrawMode(false); setCustomTracking(null); }}
                    className="w-full px-2 py-1 rounded text-[9px] bg-red-600/30 hover:bg-red-600/50 text-red-400 transition-colors"
                  >
                    HAPUS
                  </button>
                </div>
              )}
              {!customBox && (
                <p className="text-[9px] text-zinc-500 text-center py-1">
                  {customDrawMode ? "Tarik box di kamera" : "Klik GAMBAR BOX lalu tarik di kamera"}
                </p>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customOnly}
                  onChange={() => setCustomOnly(prev => !prev)}
                  className="accent-amber-500 w-3 h-3"
                />
                <span className="text-[9px] text-zinc-400">Sembunyikan deteksi lain</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative bg-black min-h-0 flex flex-col">
        <div className="flex-1 relative min-h-0">
          <CameraView onDetections={handleDetections} onFps={setYoloFps} lockedId={lockedId} onLock={setLockedId} customDrawMode={customDrawMode} customBox={customBox} onCustomBox={handleCustomBox} onCustomTracking={handleCustomTracking} hideYolo={customOnly} />

          {searchMode && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5" style={{ zIndex: 7 }}>
              <span className={`w-2 h-2 rounded-full ${searchState === "searching" ? "bg-yellow-400 animate-ping" : searchState === "locked" ? "bg-green-400" : searchState === "resting" ? "bg-red-400" : "bg-zinc-600"}`} />
              <span className={`text-[9px] font-mono font-bold ${stateColor}`}>
                {searchState === "searching" ? "MENCARI..." : searchState === "locked" ? "NGOMONG" : searchState === "resting" ? "💤 CAPEK" : ""}
              </span>
            </div>
          )}
        </div>
        <AIChat
          messages={[...voiceLog, ...interaction.messages]}
          isThinking={interaction.thinking}
          sttEnabled={sttEnabled}
          onSttToggle={handleSttToggle}
          onSendText={handleSendText}
          ttsSpeaking={audio.ttsSpeaking}
        />
      </div>
    </div>
  );
}
