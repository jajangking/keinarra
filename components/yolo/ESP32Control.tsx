"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  searchState?: "idle" | "searching" | "locked" | "resting";
  detections?: Detection[];
  onMotors?: (left: number, right: number) => void;
  onBuzzer?: (pattern: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function ESP32Control({ 
  leftSpeed: externalLeft,
  rightSpeed: externalRight,
  buzzerOn: externalBuzzer,
  searchState = "idle" as "idle" | "searching" | "locked" | "resting",
  detections = [],
  onMotors, onBuzzer, onConnect, onDisconnect 
}: ESP32ControlProps) {
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [ip, setIp] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 50));
  }, []);

  const wsSend = useCallback((cmd: string) => {
    addLog(cmd);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd);
    }
  }, [addLog]);

  const setMotors = useCallback((l: number, r: number) => {
    wsSend(`<< MOTOR:${l},${r}`);
    onMotors?.(l, r);
  }, [wsSend, onMotors]);

  const handleBuzzer = useCallback((pattern: string) => {
    if (pattern === "off") {
      wsSend("<< BUZZER:OFF");
      onBuzzer?.("off");
      return;
    }
    const freq = pattern === "found" ? 1000 : pattern === "lost" ? 600 : 800;
    wsSend(`<< BUZZER:ON:FREQ=${freq}`);
    onBuzzer?.(pattern);
  }, [wsSend, onBuzzer]);

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
      else if (keys.has(" ")) handleBuzzer(buz ? "off" : "chirp");
      if (keys.size === 0) setMotors(0, 0);
    }, 100);

    const down = (e: KeyboardEvent) => { keys.add(e.key); if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); };
    const up = (e: KeyboardEvent) => { keys.delete(e.key); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { clearInterval(interval); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [connected, buz, handleBuzzer, setMotors]);

  const connect = useCallback(() => {
    if (!ip.trim()) { addLog(">> Masukkan IP ESP32"); return; }
    const url = `ws://${ip.trim()}:81/`;
    addLog(`>> MENYAMBUNG ${url}`);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      wsRef.current = ws;
      setConnected(true);
      addLog(">> ESP32 TERHUBUNG");
      onConnect?.();
    };

    ws.onmessage = (e) => {
      addLog(">> " + e.data);
    };

    ws.onerror = () => {
      addLog(">> GAGAL TERHUBUNG");
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setConnected(false);
        addLog(">> ESP32 TERPUTUS");
        onDisconnect?.();
      }
    };
  }, [ip, addLog, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    addLog(">> ESP32 DIPUTUSKAN");
    onDisconnect?.();
  }, [addLog, onDisconnect]);

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
        </div>
      </div>

      {/* IP input + connect */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800/30">
        <input
          value={ip}
          onChange={e => setIp(e.target.value)}
          placeholder="192.168.x.x"
          disabled={connected}
          className="flex-1 bg-zinc-800/60 border border-zinc-700/50 rounded px-1.5 py-1 text-[8px] font-mono text-zinc-300 placeholder-zinc-700 outline-none focus:border-cyan-700/50 transition-colors"
        />
        <button
          onClick={connected ? disconnect : connect}
          className={`px-2 py-1 rounded text-[7px] font-medium transition-colors ${
            connected
              ? "bg-red-600/30 text-red-400 hover:bg-red-600/40"
              : "bg-cyan-600/30 text-cyan-400 hover:bg-cyan-600/40"
          }`}
        >
          {connected ? "OFF" : "ON"}
        </button>
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

      {/* Buttons */}
      <div className="grid grid-cols-3 gap-1 px-3 pb-2">
        <button disabled={!connected} onTouchStart={() => setMotors(255, 255)} onTouchEnd={() => setMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">▲</button>
        <button disabled={!connected} onClick={() => handleBuzzer(buz ? "off" : "chirp")} className="py-1 bg-zinc-800/80 rounded text-[9px] text-yellow-400 disabled:opacity-30 transition-colors select-none touch-none">{buz ? "🔊" : "🔇"}</button>
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

      {/* Monitor */}
      <div className="border-t border-zinc-800/40">
        <div className="flex items-center justify-between px-2 py-0.5">
          <span className="text-[6px] font-mono text-zinc-700">WS</span>
          <button onClick={() => setLog([])} className="text-[6px] px-1 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-600 transition-colors">CLR</button>
        </div>
        <div className="h-20 overflow-y-auto px-2 py-1 font-mono text-[7px] leading-relaxed">
          {log.length === 0 && <span className="text-zinc-700">—</span>}
          {log.map((line, i) => (
            <div key={i} className={line.startsWith("<<") ? "text-cyan-600" : line.startsWith(">>") ? "text-green-600" : "text-zinc-600"}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
