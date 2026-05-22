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
  const [ip, setIp] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("esp32_ip") ?? ""; } catch { return ""; }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const lastSentMotorsRef = useRef({ l: 0, r: 0 });
  const connectedRef = useRef(false);
  const ipRef = useRef("");

  const addLog = useCallback((msg: string) => {
    setLog(prev => [msg, ...prev].slice(0, 50));
  }, []);

  // Keep refs in sync
  useEffect(() => { connectedRef.current = connected; }, [connected]);
  useEffect(() => { ipRef.current = ip; }, [ip]);
  useEffect(() => {
    try { localStorage.setItem("esp32_ip", ip); } catch {}
  }, [ip]);

  const wsSend = useCallback((cmd: string) => {
    addLog(cmd);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd);
    }
  }, [addLog]);

  const sendMotors = useCallback((l: number, r: number) => {
    l = Math.max(-255, Math.min(255, Math.round(l)));
    r = Math.max(-255, Math.min(255, Math.round(r)));
    if (l === lastSentMotorsRef.current.l && r === lastSentMotorsRef.current.r) return;
    lastSentMotorsRef.current = { l, r };
    wsSend(`<< MOTOR:${l},${r}`);
  }, [wsSend]);

  const connect = useCallback(() => {
    if (!ip.trim()) { addLog(">> Masukkan IP ESP32"); return; }
    const url = `ws://${ip.trim()}:81/`;
    addLog(`>> MENYAMBUNG ${url}`);

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog(">> ESP32 TERHUBUNG");
      setConnected(true);
      connectedRef.current = true;
      reconnectAttemptRef.current = 0;
      onConnect?.();
    };

    ws.onmessage = (e) => {
      const msg = e.data as string;
      addLog(">> " + msg);
    };

    ws.onerror = () => {
      addLog(">> GAGAL TERHUBUNG");
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setConnected(false);
        connectedRef.current = false;
        addLog(">> ESP32 TERPUTUS");

        const attempt = reconnectAttemptRef.current;
        if (attempt < 5 && ipRef.current.trim()) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          addLog(`>> COBA ULANG ${attempt + 1}/5 dalam ${delay / 1000}s...`);
          reconnectAttemptRef.current = attempt + 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!connectedRef.current) connect();
          }, delay);
        } else {
          addLog(">> GAGAL SAMBUNG, tekan ON buat manual");
          onDisconnect?.();
        }
      }
    };
  }, [ip, addLog, onConnect, onDisconnect]);

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, []);

  // Forward external motor changes to WebSocket
  useEffect(() => {
    if (!connected) return;
    const l = externalLeft ?? 0;
    const r = externalRight ?? 0;
    sendMotors(l, r);
  }, [externalLeft, externalRight, connected, sendMotors]);

  const l = externalLeft ?? 0;
  const r = externalRight ?? 0;
  const buz = externalBuzzer ?? false;

  // Buzzer local state for manual toggle (independent of externalBuzzer prop)
  const buzzerActiveRef = useRef(false);

  const toggleBuzzer = useCallback(() => {
    if (buzzerActiveRef.current) {
      wsSend("<< BUZZER:OFF");
      buzzerActiveRef.current = false;
      onBuzzer?.("off");
    } else {
      wsSend("<< BUZZER:ON:FREQ=800");
      buzzerActiveRef.current = true;
      onBuzzer?.("chirp");
    }
  }, [wsSend, onBuzzer]);

  // Forward external buzzer changes to WebSocket
  useEffect(() => {
    if (!connected) return;
    if (buz) {
      wsSend("<< BUZZER:ON:FREQ=800");
      buzzerActiveRef.current = true;
    } else {
      wsSend("<< BUZZER:OFF");
      buzzerActiveRef.current = false;
    }
  }, [buz, connected, wsSend]);

  const currentSpeedRef = useRef({ l: 0, r: 0 });
  const keyTargetRef = useRef({ l: 0, r: 0 });
  // Keyboard with smooth acceleration ramp
  useEffect(() => {
    const keys = new Set<string>();
    let anim = 0;
    let active = false;

    const loop = () => {
      if (!connectedRef.current) { anim = requestAnimationFrame(loop); return; }

      if (keys.size === 0) {
        if (active) {
          active = false;
          keyTargetRef.current = { l: 0, r: 0 };
          currentSpeedRef.current = { l: 0, r: 0 };
          sendMotors(0, 0);
          onMotors?.(0, 0);
        }
        anim = requestAnimationFrame(loop);
        return;
      }

      active = true;

      if (keys.has("ArrowUp") && keys.has("ArrowLeft")) { keyTargetRef.current = { l: 200, r: 255 }; }
      else if (keys.has("ArrowUp") && keys.has("ArrowRight")) { keyTargetRef.current = { l: 255, r: 200 }; }
      else if (keys.has("ArrowDown") && keys.has("ArrowLeft")) { keyTargetRef.current = { l: -200, r: -255 }; }
      else if (keys.has("ArrowDown") && keys.has("ArrowRight")) { keyTargetRef.current = { l: -255, r: -200 }; }
      else if (keys.has("ArrowUp")) { keyTargetRef.current = { l: 255, r: 255 }; }
      else if (keys.has("ArrowDown")) { keyTargetRef.current = { l: -255, r: -255 }; }
      else if (keys.has("ArrowLeft")) { keyTargetRef.current = { l: -255, r: 255 }; }
      else if (keys.has("ArrowRight")) { keyTargetRef.current = { l: 255, r: -255 }; }
      else if (keys.has(" ")) { keys.delete(" "); toggleBuzzer(); }

      const t = keyTargetRef.current;
      const c = currentSpeedRef.current;

      const step = 24;
      if (c.l !== t.l) { c.l += Math.sign(t.l - c.l) * Math.min(step, Math.abs(t.l - c.l)); }
      if (c.r !== t.r) { c.r += Math.sign(t.r - c.r) * Math.min(step, Math.abs(t.r - c.r)); }

      sendMotors(c.l, c.r);
      onMotors?.(c.l, c.r);

      anim = requestAnimationFrame(loop);
    };

    const down = (e: KeyboardEvent) => {
      keys.add(e.key);
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    anim = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(anim);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.clear();
      lastSentMotorsRef.current = { l: -999, r: -999 };
    };
  }, [connected, sendMotors, toggleBuzzer, onMotors]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    connectedRef.current = false;
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
        <button disabled={!connected} onTouchStart={() => sendMotors(255, 255)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">▲</button>
        <button disabled={!connected} onClick={toggleBuzzer} className="py-1 bg-zinc-800/80 rounded text-[9px] text-yellow-400 disabled:opacity-30 transition-colors select-none touch-none">{buzzerActiveRef.current ? "🔊" : "🔇"}</button>
        <button disabled={!connected} onTouchStart={() => sendMotors(-255, -255)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-red-400 active:bg-red-900/40 disabled:opacity-30 transition-colors select-none touch-none">▼</button>
        <button disabled={!connected} onTouchStart={() => sendMotors(-200, 200)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">◄</button>
        <button disabled={!connected} onClick={() => sendMotors(0, 0)} className="py-1 bg-red-900/30 rounded text-[9px] text-red-400 disabled:opacity-30 transition-colors select-none touch-none">■</button>
        <button disabled={!connected} onTouchStart={() => sendMotors(200, -200)} onTouchEnd={() => sendMotors(0, 0)} className="py-1 bg-zinc-800/80 rounded text-[9px] text-cyan-400 active:bg-cyan-900/40 disabled:opacity-30 transition-colors select-none touch-none">►</button>
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
