"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Robot3D } from "@/components/yolo/Robot3D";

interface Detection {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ESP32ControlProps {
  leftSpeed?: number;
  rightSpeed?: number;
  buzzerOn?: boolean;
  searchState?: "idle" | "searching" | "locked";
  detections?: Detection[];
  onMotors?: (left: number, right: number) => void;
  onBuzzer?: (freq: number) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function ESP32Control({ 
  leftSpeed: externalLeft,
  rightSpeed: externalRight,
  buzzerOn: externalBuzzer,
  searchState = "idle",
  detections = [],
  onMotors, onBuzzer, onConnect, onDisconnect 
}: ESP32ControlProps) {
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 30));
  }, []);

  const setMotors = useCallback((l: number, r: number) => {
    addLog(`<< MOTOR:${l},${r}`);
    onMotors?.(l, r);
  }, [addLog, onMotors]);

  const handleBuzzer = useCallback((freq: number) => {
    addLog(freq > 0 ? `<< BUZZER:${freq}Hz` : "<< BUZZER:OFF");
    onBuzzer?.(freq);
  }, [addLog, onBuzzer]);

  const handleConnect = useCallback(() => {
    setConnected(true);
    addLog(">> ESP32 CONNECTED");
    onConnect?.();
  }, [addLog, onConnect]);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    setMotors(0, 0);
    addLog(">> ESP32 DISCONNECTED");
    onDisconnect?.();
  }, [addLog, onDisconnect, setMotors]);

  const l = externalLeft ?? 0;
  const r = externalRight ?? 0;
  const buz = externalBuzzer ?? false;

  // Keyboard
  useEffect(() => {
    const keys = new Set<string>();
    const interval = setInterval(() => {
      if (!connected) return;
      if (keys.has("ArrowUp") && keys.has("ArrowLeft")) setMotors(100, 200);
      else if (keys.has("ArrowUp") && keys.has("ArrowRight")) setMotors(200, 100);
      else if (keys.has("ArrowDown") && keys.has("ArrowLeft")) setMotors(-100, -200);
      else if (keys.has("ArrowDown") && keys.has("ArrowRight")) setMotors(-200, -100);
      else if (keys.has("ArrowUp")) setMotors(255, 255);
      else if (keys.has("ArrowDown")) setMotors(-255, -255);
      else if (keys.has("ArrowLeft")) setMotors(-200, 200);
      else if (keys.has("ArrowRight")) setMotors(200, -200);
      else if (keys.has(" ")) handleBuzzer(buz ? 0 : 1000);
      if (keys.size === 0) setMotors(0, 0);
    }, 100);

    const down = (e: KeyboardEvent) => { keys.add(e.key); if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); };
    const up = (e: KeyboardEvent) => { keys.delete(e.key); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { clearInterval(interval); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [connected, buz, handleBuzzer, setMotors]);

  // Touch joystick
  const stickRef = useRef<HTMLDivElement>(null);
  const stickActive = useRef(false);
  const stickCenter = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!connected) return;
    const el = stickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    stickCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    stickActive.current = true;
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!stickActive.current || !connected) return;
    const t = e.touches[0];
    const dx = t.clientX - stickCenter.current.x;
    const dy = t.clientY - stickCenter.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist / 50, 1);
    const angle = Math.atan2(dy, dx);

    let left = 0, right = 0;
    const power = Math.round(clamp * 255);
    if (dist < 10) { left = 0; right = 0; }
    else if (angle > -Math.PI*0.75 && angle < -Math.PI*0.25) { left = power; right = power; }
    else if (angle > Math.PI*0.25 && angle < Math.PI*0.75) { left = -power; right = -power; }
    else if (angle > Math.PI*0.75 || angle < -Math.PI*0.75) { left = -power; right = power; }
    else { left = power; right = -power; }
    setMotors(left, right);
  }, [setMotors, connected]);

  const handleTouchEnd = () => {
    stickActive.current = false;
    setMotors(0, 0);
  };

  return (
    <div className="bg-zinc-900/90 backdrop-blur-md rounded-xl border border-zinc-800/50 overflow-hidden shadow-xl" style={{ width: 240 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50">
        <span className="text-[10px] font-semibold text-zinc-400">ESP32</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
          <span className={`text-[8px] font-mono ${connected ? "text-green-400" : "text-red-400"}`}>
            {connected ? "ONLINE" : "OFFLINE"}
          </span>
          <button onClick={connected ? handleDisconnect : handleConnect} className="ml-1 px-1.5 py-0.5 rounded text-[7px] bg-zinc-800 hover:bg-zinc-700 text-zinc-500 transition-colors">
            {connected ? "OFF" : "ON"}
          </button>
        </div>
      </div>

      {/* 3D Robot Visualization */}
      <div className="flex items-center justify-center py-1 border-b border-zinc-800/40">
        <Robot3D
          leftSpeed={l}
          rightSpeed={r}
          buzzerOn={buz}
          connected={connected}
          searchState={searchState}
          detections={detections}
        />
      </div>

      {/* Joystick */}
      <div className="flex items-center justify-center py-2">
        <div ref={stickRef} className="relative w-20 h-20 rounded-full bg-zinc-800/80 border border-zinc-700/50 cursor-pointer select-none touch-none" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[7px] text-zinc-600 font-mono">F</span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[7px] text-zinc-600 font-mono">B</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[7px] text-zinc-600 font-mono">L</span>
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[7px] text-zinc-600 font-mono">R</span>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-cyan-500/60 border border-cyan-400/40" />
        </div>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-3 gap-1 px-3 pb-2">
        <button disabled={!connected} onTouchStart={() => setMotors(255, 255)} onTouchEnd={() => setMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">▲</button>
        <button disabled={!connected} onClick={() => handleBuzzer(buz ? 0 : 1000)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-yellow-400 disabled:opacity-30 transition-colors select-none touch-none">{buz ? "🔊" : "🔇"}</button>
        <button disabled={!connected} onTouchStart={() => setMotors(-255, -255)} onTouchEnd={() => setMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-red-400 active:bg-red-900/40 disabled:opacity-30 transition-colors select-none touch-none">▼</button>
        <button disabled={!connected} onTouchStart={() => setMotors(-200, 200)} onTouchEnd={() => setMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">◄</button>
        <button disabled={!connected} onClick={() => setMotors(0, 0)} className="py-1 bg-red-900/30 rounded text-[9px] text-red-400 disabled:opacity-30 transition-colors select-none touch-none">■</button>
        <button disabled={!connected} onTouchStart={() => setMotors(200, -200)} onTouchEnd={() => setMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">►</button>
      </div>

      {/* Motor bars */}
      <div className="px-3 pb-2 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-zinc-600 w-4 font-mono">L</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{
              width: `${Math.abs(l) / 255 * 100}%`,
              backgroundColor: l > 0 ? "#22d3ee" : l < 0 ? "#ef4444" : "#525252",
              marginLeft: l < 0 ? "auto" : "0",
              marginRight: l > 0 ? "auto" : "0",
            }} />
          </div>
          <span className="text-[8px] font-mono text-zinc-500 w-8 text-right">{l}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] text-zinc-600 w-4 font-mono">R</span>
          <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-75" style={{
              width: `${Math.abs(r) / 255 * 100}%`,
              backgroundColor: r > 0 ? "#22d3ee" : r < 0 ? "#ef4444" : "#525252",
              marginLeft: r < 0 ? "auto" : "0",
              marginRight: r > 0 ? "auto" : "0",
            }} />
          </div>
          <span className="text-[8px] font-mono text-zinc-500 w-8 text-right">{r}</span>
        </div>
        {buz && (
          <div className="flex items-center gap-1 text-[7px] text-yellow-500 font-mono animate-pulse">
            <span className="w-1 h-1 rounded-full bg-yellow-500" />
            BUZZER ON
          </div>
        )}
      </div>

      {/* Serial */}
      <div className="border-t border-zinc-800/40">
        <div className="h-16 overflow-y-auto px-2 py-1 font-mono text-[7px] leading-relaxed">
          {log.length === 0 && <span className="text-zinc-700">No commands</span>}
          {log.map((line, i) => (
            <div key={i} className={line.startsWith("<<") ? "text-cyan-600" : line.startsWith(">>") ? "text-green-600" : "text-zinc-600"}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
